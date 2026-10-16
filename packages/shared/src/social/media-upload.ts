export const SOCIAL_MEDIA_CHUNK_SIZE = 8 * 1024 * 1024;
export const SOCIAL_MEDIA_MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** Stays inside a signed 32-bit Prisma Int while covering long phone clips. */
export const SOCIAL_MEDIA_MAX_VIDEO_BYTES = 2_000_000_000;
export const TIKTOK_FILE_UPLOAD_CHUNK_SIZE = 10 * 1024 * 1024;

const PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp"
]);

export type SocialMediaKind = "photo" | "video";

export type SocialContentRange = {
  start: number;
  endInclusive: number;
  total: number;
  length: number;
};

export function socialMediaKindFromMime(mimeType: string, filename = ""): SocialMediaKind {
  const mime = mimeType.trim().toLowerCase();
  if (PHOTO_TYPES.has(mime) || mime.startsWith("image/")) return "photo";
  if (VIDEO_TYPES.has(mime) || mime.startsWith("video/")) return "video";
  if (/\.(mp4|mov|m4v|webm|3gp)$/i.test(filename)) return "video";
  return "photo";
}

export function isAllowedSocialMediaMime(mimeType: string, _filename = ""): boolean {
  const mime = mimeType.trim().toLowerCase();
  return PHOTO_TYPES.has(mime) || VIDEO_TYPES.has(mime);
}

export function assertSocialMediaLimits(input: {
  mimeType: string;
  filename?: string | undefined;
  byteSize: number;
}): { kind: SocialMediaKind } {
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    throw new Error("File size is missing or invalid.");
  }
  if (!isAllowedSocialMediaMime(input.mimeType, input.filename ?? "")) {
    throw new Error("Choose a photo or video file (jpeg, png, webp, mp4, mov, webm).");
  }
  const kind = socialMediaKindFromMime(input.mimeType, input.filename ?? "");
  const max = kind === "video" ? SOCIAL_MEDIA_MAX_VIDEO_BYTES : SOCIAL_MEDIA_MAX_PHOTO_BYTES;
  if (input.byteSize > max) {
    throw new Error(
      kind === "video"
        ? "Videos can be up to 2 GB. Compress the clip or split it, then drop it again."
        : "Photos can be up to 20 MB."
    );
  }
  return { kind };
}

export function parseSocialContentRange(
  header: string | undefined,
  expectedTotal: number
): SocialContentRange {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec((header ?? "").trim());
  if (!match) {
    throw new Error("Content-Range must look like bytes start-end/total.");
  }
  const start = Number(match[1]);
  const endInclusive = Number(match[2]);
  const total = Number(match[3]);
  if (total !== expectedTotal) {
    throw new Error("Content-Range total does not match the file size.");
  }
  if (endInclusive < start) {
    throw new Error("Content-Range end is before start.");
  }
  const length = endInclusive - start + 1;
  if (start + length > expectedTotal) {
    throw new Error("Content-Range extends past the file size.");
  }
  return { start, endInclusive, total, length };
}

export function nextReceivedBytes(receivedBytes: number, range: SocialContentRange): number {
  if (range.start !== receivedBytes) {
    throw new Error(`Expected the next chunk to start at byte ${receivedBytes}.`);
  }
  return receivedBytes + range.length;
}

export function socialUploadChunkPlan(
  byteSize: number,
  chunkSize = SOCIAL_MEDIA_CHUNK_SIZE
): Array<{ start: number; endExclusive: number; length: number; index: number }> {
  if (byteSize <= 0) return [];
  const chunks = [];
  let start = 0;
  let index = 0;
  while (start < byteSize) {
    const endExclusive = Math.min(start + chunkSize, byteSize);
    chunks.push({ start, endExclusive, length: endExclusive - start, index });
    start = endExclusive;
    index += 1;
  }
  return chunks;
}

export function tiktokFileUploadPlan(byteSize: number) {
  const chunkSize = Math.min(
    TIKTOK_FILE_UPLOAD_CHUNK_SIZE,
    Math.max(byteSize, 1)
  );
  const chunks = socialUploadChunkPlan(byteSize, chunkSize);
  return {
    source: "FILE_UPLOAD" as const,
    videoSize: byteSize,
    chunkSize,
    totalChunkCount: Math.max(chunks.length, 1),
    chunks
  };
}
