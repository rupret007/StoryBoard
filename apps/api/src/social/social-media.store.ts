import { createWriteStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export function socialMediaRoot(dir?: string): string {
  if (dir?.trim()) return resolve(dir.trim());
  const cwd = process.cwd();
  if (cwd.endsWith(`${sep}apps${sep}api`)) {
    return resolve(cwd, "..", "..", "data", "social-media");
  }
  return resolve(cwd, "data", "social-media");
}

export function socialMediaStorageKey(artistId: string, assetId: string): string {
  return `${artistId}/${assetId}`;
}

export function socialMediaAbsolutePath(root: string, storageKey: string): string {
  const absolute = resolve(root, storageKey);
  if (!absolute.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error("Rejected a media path outside the social media directory.");
  }
  return absolute;
}

export async function createSocialMediaFile(absolutePath: string): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const handle = await open(absolutePath, "w");
  await handle.close();
}

export async function appendSocialMediaChunk(
  absolutePath: string,
  bytes: Uint8Array,
  expectedOffset: number
): Promise<number> {
  const current = await stat(absolutePath);
  if (current.size !== expectedOffset) {
    throw new Error(`Disk size ${current.size} does not match expected offset ${expectedOffset}.`);
  }
  await pipeline(Readable.from(Buffer.from(bytes)), createWriteStream(absolutePath, { flags: "a" }));
  const next = await stat(absolutePath);
  return next.size;
}
