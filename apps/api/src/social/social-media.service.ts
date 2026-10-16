import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SOCIAL_MEDIA_CHUNK_SIZE,
  assertSocialMediaLimits,
  nextReceivedBytes,
  parseSocialContentRange,
  socialMediaInitSchema,
  socialMediaKindFromMime
} from "@storyboard/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  appendSocialMediaChunk,
  createSocialMediaFile,
  socialMediaAbsolutePath,
  socialMediaRoot,
  socialMediaStorageKey
} from "./social-media.store";

@Injectable()
export class SocialMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  root(): string {
    return socialMediaRoot(this.config.get<string>("SOCIAL_MEDIA_DIR"));
  }

  chunkSize(): number {
    return SOCIAL_MEDIA_CHUNK_SIZE;
  }

  async init(artistId: string, raw: unknown) {
    const input = socialMediaInitSchema.parse(raw);
    let kind: "photo" | "video";
    try {
      ({ kind } = assertSocialMediaLimits(input));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "The file was rejected.");
    }
    const asset = await this.prisma.client.socialMediaAsset.create({
      data: {
        artistId,
        filename: input.filename,
        mimeType: input.mimeType.trim().toLowerCase(),
        byteSize: input.byteSize,
        receivedBytes: 0,
        publicUrl: "local://uploading",
        uploadStatus: "uploading",
        kind
      }
    });
    const storageKey = socialMediaStorageKey(artistId, asset.id);
    await createSocialMediaFile(socialMediaAbsolutePath(this.root(), storageKey));
    const updated = await this.prisma.client.socialMediaAsset.update({
      where: { id: asset.id },
      data: { storageKey, publicUrl: this.hostedUrl(asset.id) }
    });
    return this.present(updated);
  }

  async appendChunk(artistId: string, id: string, rangeHeader: string | undefined, bytes: Uint8Array) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SocialMediaAsset" WHERE id = ${id} AND "artistId" = ${artistId} FOR UPDATE`;
      const asset = await tx.socialMediaAsset.findFirst({ where: { id, artistId } });
      if (!asset) throw new NotFoundException("Media not found");
      if (asset.uploadStatus !== "uploading" || !asset.storageKey) {
        throw new BadRequestException("This file is not accepting more chunks.");
      }
      let range;
      try {
        range = parseSocialContentRange(rangeHeader, asset.byteSize);
        nextReceivedBytes(asset.receivedBytes, range);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : "The chunk range is invalid.");
      }
      if (bytes.byteLength !== range.length) {
        throw new BadRequestException("Chunk byte length does not match Content-Range.");
      }
      const path = socialMediaAbsolutePath(this.root(), asset.storageKey);
      const receivedBytes = await appendSocialMediaChunk(path, bytes, asset.receivedBytes);
      const updated = await tx.socialMediaAsset.update({
        where: { id: asset.id },
        data: { receivedBytes }
      });
      return this.present(updated);
    });
  }

  async complete(artistId: string, id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SocialMediaAsset" WHERE id = ${id} AND "artistId" = ${artistId} FOR UPDATE`;
      const asset = await tx.socialMediaAsset.findFirst({ where: { id, artistId } });
      if (!asset) throw new NotFoundException("Media not found");
      if (asset.receivedBytes !== asset.byteSize || !asset.storageKey) {
        throw new BadRequestException("The file is not finished uploading.");
      }
      const file = await stat(socialMediaAbsolutePath(this.root(), asset.storageKey));
      if (file.size !== asset.byteSize) {
        throw new BadRequestException("The uploaded file size does not match the recorded upload.");
      }
      const updated = await tx.socialMediaAsset.update({
        where: { id: asset.id },
        data: { uploadStatus: "ready", publicUrl: this.hostedUrl(asset.id) }
      });
      return this.present(updated);
    });
  }

  async requireReady(artistId: string, id: string) {
    const asset = await this.requireOwned(artistId, id);
    if (asset.uploadStatus !== "ready") {
      throw new BadRequestException("Wait for the file upload to finish before drafting captions.");
    }
    return asset;
  }

  async openForArtist(artistId: string, id: string) {
    const asset = await this.requireOwned(artistId, id);
    if (!asset.storageKey) throw new NotFoundException("That file is a remote URL, not a local upload.");
    this.assertSafeToServe(asset);
    return {
      stream: createReadStream(socialMediaAbsolutePath(this.root(), asset.storageKey)),
      mimeType: asset.mimeType,
      filename: asset.filename,
      byteSize: asset.byteSize
    };
  }

  async openPublic(id: string, token: string) {
    if (!this.verifyPublicToken(id, token)) {
      throw new NotFoundException("Media is not available.");
    }
    const asset = await this.prisma.client.socialMediaAsset.findUnique({ where: { id } });
    if (!asset?.storageKey || asset.uploadStatus !== "ready") {
      throw new NotFoundException("Media is not available.");
    }
    this.assertSafeToServe(asset);
    return {
      stream: createReadStream(socialMediaAbsolutePath(this.root(), asset.storageKey)),
      mimeType: asset.mimeType,
      filename: asset.filename,
      byteSize: asset.byteSize
    };
  }

  absolutePathFor(asset: { storageKey: string | null }): string | undefined {
    if (!asset.storageKey) return undefined;
    return socialMediaAbsolutePath(this.root(), asset.storageKey);
  }

  present(asset: {
    id: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    receivedBytes: number;
    publicUrl: string;
    kind: string;
    uploadStatus: string;
  }) {
    return {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      receivedBytes: asset.receivedBytes,
      publicUrl: `/social/media/${encodeURIComponent(asset.id)}/file`,
      kind: socialMediaKindFromMime(asset.mimeType, asset.filename),
      uploadStatus: asset.uploadStatus,
      chunkSize: this.chunkSize(),
      ready: asset.uploadStatus === "ready" && asset.receivedBytes === asset.byteSize,
      progress: asset.byteSize === 0 ? 0 : Math.min(100, Math.round((asset.receivedBytes / asset.byteSize) * 100))
    };
  }

  hostedUrl(assetId: string): string {
    const apiUrl = (this.config.get<string>("API_URL") ?? "http://localhost:4000").replace(/\/$/, "");
    return `${apiUrl}/social/media/${assetId}/public/${this.publicToken(assetId)}`;
  }

  publicToken(assetId: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("SESSION_SECRET"))
      .update(`social-media:${assetId}`)
      .digest("hex")
      .slice(0, 32);
  }

  private verifyPublicToken(assetId: string, token: string): boolean {
    const expected = Buffer.from(this.publicToken(assetId));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private assertSafeToServe(asset: { mimeType: string; filename: string; byteSize: number; receivedBytes: number; uploadStatus: string }) {
    if (asset.uploadStatus !== "ready" || asset.receivedBytes !== asset.byteSize) {
      throw new NotFoundException("Media is not available.");
    }
    try {
      assertSocialMediaLimits(asset);
    } catch {
      throw new NotFoundException("Media is not available.");
    }
  }

  private async requireOwned(artistId: string, id: string) {
    const asset = await this.prisma.client.socialMediaAsset.findFirst({
      where: { id, artistId }
    });
    if (!asset) throw new NotFoundException("Media not found");
    return asset;
  }
}
