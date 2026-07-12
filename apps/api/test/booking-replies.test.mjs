import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const repliesImport = await import(pathToFileURL(join(dir, "..", "dist", "booking", "booking-replies.service.js")).href);
const constantsImport = await import(pathToFileURL(join(dir, "..", "dist", "integrations", "google-oauth.constants.js")).href);
const repliesMod = repliesImport.default ?? repliesImport;
const constants = constantsImport.default ?? constantsImport;

function serviceFixture({ scopeReady = true, threadMessages = [] } = {}) {
  const state = { replies: [], recipientStatus: "sent", audits: [], settings: null };
  const client = {
    artistBookingReplySettings: {
      findUnique: async () => state.settings,
      upsert: async ({ create, update }) => { state.settings = { id: "settings-a", ...(state.settings ?? create), ...update }; return state.settings; }
    },
    integrationConnection: { findUnique: async () => ({ status: "active", scopes: scopeReady ? [constants.GMAIL_READONLY_SCOPE] : [] }) },
    bookingCampaignDelivery: { findMany: async () => [{ id: "delivery-a", recipientId: "recipient-a", providerMessageId: "sent-a", providerThreadId: "thread-a", recipient: { opportunityId: "opp-a", contact: { email: "buyer@example.test" } } }] },
    bookingReply: {
      findUnique: async ({ where }) => state.replies.find((row) => row.providerMessageId === where.artistId_providerMessageId.providerMessageId) ?? null,
      create: async ({ data }) => { const row = { id: `reply-${state.replies.length + 1}`, ...data }; state.replies.push(row); return row; }
    },
    bookingCampaignRecipient: { updateMany: async ({ data }) => { state.recipientStatus = data.status; } },
    artistMembership: { findMany: async () => [] },
    workflowNotification: { createMany: async () => ({ count: 0 }) },
    auditEvent: { create: async ({ data }) => { state.audits.push(data); } },
    $transaction: async (fn) => fn(client)
  };
  const service = new repliesMod.BookingRepliesService(
    { client },
    { get: (key) => key === "GMAIL_REPLY_SYNC_ENABLED" },
    { resolveForArtist: async () => ({ gmail: { mode: "real", getTrackedThread: async () => threadMessages } }) },
    { log: async () => undefined },
    {}
  );
  return { service, state };
}

test("reply settings require a connected Google account with Gmail read access", async () => {
  const { service } = serviceFixture({ scopeReady: false });
  await assert.rejects(() => service.updateSettings("artist-a", { syncEnabled: true }, "owner", "operator-a"), /Reconnect Google/);
});

test("tracked-thread sync stores only external replies and is idempotent", async () => {
  const messages = [
    { messageId: "sent-a", threadId: "thread-a", fromEmail: "band@example.test", receivedAt: new Date().toISOString(), isFromUser: true },
    { messageId: "reply-a", threadId: "thread-a", fromEmail: "buyer@example.test", subject: "Re: show", snippet: "What is your fee?", bodyText: "What is your fee?", receivedAt: new Date().toISOString(), isFromUser: false }
  ];
  const { service, state } = serviceFixture({ threadMessages: messages });
  assert.deepEqual(await service.sync("artist-a", "owner", "operator-a"), { checkedThreads: 1, created: 1, failed: 0 });
  assert.equal(state.replies[0].snippet, "What is your fee?");
  assert.equal(state.replies[0].bodyText, undefined);
  assert.equal(state.recipientStatus, "replied");
  assert.equal(state.audits[0].action, "booking_reply.detected");
  assert.equal((await service.sync("artist-a")).created, 0);
});

test("tracked-thread sync isolates provider failures", async () => {
  const fixture = serviceFixture();
  fixture.service.registry = { resolveForArtist: async () => ({ gmail: { mode: "real", getTrackedThread: async () => { throw new Error("provider down"); } } }) };
  const result = await fixture.service.sync("artist-a");
  assert.equal(result.created, 0);
  assert.equal(result.failed, 1);
});
