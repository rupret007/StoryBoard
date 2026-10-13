import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";

export const STRIPE_WEBHOOK_PATH = "/integrations/stripe/webhook";
/** Matches Fastify's default bodyLimit and is enforced on this unauthenticated path. */
export const STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES = 1024 * 1024;

export type StripeWebhookRequest = FastifyRequest & { rawBody?: string };

export class StripeWebhookPayloadTooLargeError extends Error {
  readonly statusCode = 413;
  readonly code = "FST_ERR_CTP_BODY_TOO_LARGE";

  constructor() {
    super("Stripe webhook payload exceeds size limit");
    this.name = "StripeWebhookPayloadTooLargeError";
  }
}

export function isStripeWebhookPayloadTooLargeError(
  error: unknown
): error is StripeWebhookPayloadTooLargeError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "StripeWebhookPayloadTooLargeError"
  );
}

export function readStripeRawBody(req: FastifyRequest): string | null {
  const raw = (req as StripeWebhookRequest).rawBody;
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (Buffer.byteLength(raw, "utf8") > STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES) {
    throw new StripeWebhookPayloadTooLargeError();
  }
  return raw;
}

type StripeWebhookPayloadStream = AsyncIterable<unknown> & {
  destroy?: (error?: Error) => void;
};

export async function bufferStripeWebhookRawBody(
  payload: StripeWebhookPayloadStream,
  options: { maxBytes?: number; declaredLength?: number } = {}
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES;
  const declared = options.declaredLength;
  if (typeof declared === "number" && Number.isFinite(declared) && declared > maxBytes) {
    payload.destroy?.();
    throw new StripeWebhookPayloadTooLargeError();
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let overLimit = false;
  for await (const chunk of payload) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array);
    size += buffer.byteLength;
    if (size > maxBytes) {
      overLimit = true;
      break;
    }
    chunks.push(buffer);
  }
  if (overLimit) {
    payload.destroy?.();
    throw new StripeWebhookPayloadTooLargeError();
  }
  return Buffer.concat(chunks, size);
}

/** Capture the exact posted bytes for Stripe-Signature verification. */
export function attachStripeWebhookRawBody(fastify: FastifyInstance): void {
  fastify.addHook("preParsing", async (request, _reply, payload) => {
    const path = String(request.url ?? "").split("?")[0] ?? "";
    if (!path.startsWith(STRIPE_WEBHOOK_PATH)) {
      return payload;
    }
    const declared = Number(request.headers["content-length"]);
    const buffer = await bufferStripeWebhookRawBody(
      payload,
      Number.isFinite(declared) ? { declaredLength: declared } : {}
    );
    (request as StripeWebhookRequest).rawBody = buffer.toString("utf8");
    return Readable.from(buffer);
  });
}
