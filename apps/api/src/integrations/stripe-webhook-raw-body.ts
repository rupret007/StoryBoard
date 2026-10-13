import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";

export const STRIPE_WEBHOOK_PATH = "/integrations/stripe/webhook";

export type StripeWebhookRequest = FastifyRequest & { rawBody?: string };

export function readStripeRawBody(req: FastifyRequest): string | null {
  const raw = (req as StripeWebhookRequest).rawBody;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Capture the exact posted bytes for Stripe-Signature verification. */
export function attachStripeWebhookRawBody(fastify: FastifyInstance): void {
  fastify.addHook("preParsing", async (request, _reply, payload) => {
    const path = String(request.url ?? "").split("?")[0] ?? "";
    if (!path.startsWith(STRIPE_WEBHOOK_PATH)) {
      return payload;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    (request as StripeWebhookRequest).rawBody = buffer.toString("utf8");
    return Readable.from(buffer);
  });
}
