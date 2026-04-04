import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;

function decodeKey(raw: string): Buffer {
  const t = raw.trim();
  try {
    const buf = Buffer.from(t, "base64");
    if (buf.length === KEY_LEN) {
      return buf;
    }
  } catch {
    /* fall through */
  }
  return scryptSync(t, "storyboard-integration-secrets", KEY_LEN);
}

export class SecretBox {
  constructor(private readonly keyMaterial: string | undefined) {}

  configured(): boolean {
    return Boolean(this.keyMaterial?.trim());
  }

  encryptJson(payload: unknown): string {
    if (!this.keyMaterial?.trim()) {
      throw new Error("INTEGRATION_SECRETS_ENCRYPTION_KEY is not configured");
    }
    const key = decodeKey(this.keyMaterial);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const json = JSON.stringify(payload);
    const enc = Buffer.concat([
      cipher.update(json, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.from(
      JSON.stringify({
        v: 1,
        iv: iv.toString("base64url"),
        tag: tag.toString("base64url"),
        d: enc.toString("base64url")
      })
    ).toString("base64url");
  }

  decryptJson<T>(blob: string): T {
    if (!this.keyMaterial?.trim()) {
      throw new Error("INTEGRATION_SECRETS_ENCRYPTION_KEY is not configured");
    }
    const key = decodeKey(this.keyMaterial);
    const parsed = JSON.parse(
      Buffer.from(blob, "base64url").toString("utf8")
    ) as { v: number; iv: string; tag: string; d: string };
    if (parsed.v !== 1) {
      throw new Error("Unsupported secrets blob version");
    }
    const iv = Buffer.from(parsed.iv, "base64url");
    const tag = Buffer.from(parsed.tag, "base64url");
    const data = Buffer.from(parsed.d, "base64url");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  }
}
