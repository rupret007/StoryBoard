import { createHash } from "crypto";

export function hashTelegramRegistrationToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
