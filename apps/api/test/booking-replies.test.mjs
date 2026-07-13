import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const repliesImport = await import(
  pathToFileURL(join(dir, "..", "dist", "booking", "booking-replies.service.js")).href
);
const constantsImport = await import(
  pathToFileURL(join(dir, "..", "dist", "integrations", "google-oauth.constants.js")).href
);
const repliesMod = repliesImport.default ?? repliesImport;
const constants = constantsImport.default ?? constantsImport;

function serviceFixture({
  scopeReady = true,
  threadMessages = [],
  existingOpportunity = null,
  createApproval
} = {}) {
  const state = {
    replies: [],
    recipientStatus: "sent",
    audits: [],
    settings: null,
    opportunities: existingOpportunity
      ? [existingOpportunity]
      : [{ id: "opp-a", artistId: "artist-a", stage: "scoped" }],
    approvals: []
  };

  const client = {
    artistBookingReplySettings: {
      findUnique: async () => state.settings,
      upsert: async ({ create, update }) => {
        state.settings = {
          id: "settings-a",
          ...(state.settings ?? create),
          ...update
        };
        return state.settings;
      }
    },
    integrationConnection: {
      findUnique: async () => ({
        status: "active",
        scopes: scopeReady ? [constants.GMAIL_READONLY_SCOPE] : []
      })
    },
    bookingCampaignDelivery: {
      findMany: async () => [
        {
          id: "delivery-a",
          recipientId: "recipient-a",
          providerMessageId: "sent-a",
          providerThreadId: "thread-a",
          recipient: {
            opportunityId: "opp-a",
            contact: { email: "buyer@example.test" },
            prospect: { id: "prospect-a", name: "A Buyer" }
          }
        }
      ]
    },
    bookingReply: {
      findUnique: async ({ where }) =>
        state.replies.find(
          (row) =>
            row.providerMessageId ===
            where.artistId_providerMessageId.providerMessageId
        ) ?? null,
      findFirst: async ({ where }) => {
        if (where?.id) {
          return (
            state.replies.find(
              (row) => row.id === where.id && row.artistId === where.artistId
            ) ?? null
          );
        }
        if (where?.artistId_providerMessageId) {
          return (
            state.replies.find(
              (row) =>
                row.artistId === where.artistId_providerMessageId.artistId &&
                row.providerMessageId ===
                  where.artistId_providerMessageId.providerMessageId
            ) ?? null
          );
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { id: `reply-${state.replies.length + 1}`, ...data };
        state.replies.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const reply = state.replies.find((row) => row.id === where.id);
        if (!reply) throw new Error("not found");
        Object.assign(reply, data);
        return reply;
      }
    },
    bookingCampaignRecipient: {
      updateMany: async ({ data }) => {
        state.recipientStatus = data.status;
      },
      findMany: async () => []
    },
    artistMembership: { findMany: async () => [] },
    workflowNotification: { createMany: async () => ({ count: 0 }) },
    bookingOpportunity: {
      findFirst: async ({ where }) =>
        state.opportunities.find(
          (row) => row.id === where.id && row.artistId === where.artistId
        ) ?? null
    },
    auditEvent: {
      create: async ({ data }) => {
        state.audits.push(data);
      }
    },
    $transaction: async (fn) => fn(client)
  };

  const approvalStore = {
    create: async (_artistId, spec) => {
      if (spec.sourceKey) {
        const existing = state.approvals.find(
          (row) =>
            row.artistId === _artistId &&
            row.sourceKey === spec.sourceKey &&
            row.actionType === spec.actionType
        );
        if (existing) return existing;
      }
      const row = {
        id: `approval-${state.approvals.length + 1}`,
        artistId: _artistId,
        status: spec.status ?? "pending",
        actorOperatorId: spec.actorOperatorId ?? null,
        ...spec
      };
      state.approvals.push(row);
      return row;
    }
  };

  const service = new repliesMod.BookingRepliesService(
    { client },
    { get: (key) => key === "GMAIL_REPLY_SYNC_ENABLED" },
    {
      resolveForArtist: async () => ({
        gmail: {
          mode: "real",
          getTrackedThread: async () => threadMessages
        }
      })
    },
    { log: async () => undefined },
    createApproval ? { create: createApproval } : approvalStore
  );

  return { service, state, client };
}

test("reply settings require a connected Google account with Gmail read access", async () => {
  const { service } = serviceFixture({ scopeReady: false });
  await assert.rejects(
    () => service.updateSettings("artist-a", { syncEnabled: true }, "owner", "operator-a"),
    /Reconnect Google/
  );
});

test("tracked-thread sync stores only external replies and is idempotent", async () => {
  const messages = [
    {
      messageId: "sent-a",
      threadId: "thread-a",
      fromEmail: "band@example.test",
      receivedAt: new Date().toISOString(),
      isFromUser: true
    },
    {
      messageId: "reply-a",
      threadId: "thread-a",
      fromEmail: "buyer@example.test",
      subject: "Re: show",
      snippet: "What is your fee?",
      bodyText: "What is your fee?",
      receivedAt: new Date().toISOString(),
      isFromUser: false
    }
  ];
  const { service, state } = serviceFixture({ threadMessages: messages });
  assert.deepEqual(await service.sync("artist-a", "owner", "operator-a"), {
    checkedThreads: 1,
    created: 1,
    failed: 0
  });
  assert.equal(state.replies[0].snippet, "What is your fee?");
  assert.equal(state.replies[0].bodyText, undefined);
  assert.equal(state.recipientStatus, "replied");
  assert.equal(state.audits[0].action, "booking_reply.detected");
  assert.equal((await service.sync("artist-a")).created, 0);
});

test("tracked-thread sync isolates provider failures", async () => {
  const fixture = serviceFixture();
  fixture.service.registry = {
    resolveForArtist: async () => ({
      gmail: {
        mode: "real",
        getTrackedThread: async () => {
          throw new Error("provider down");
        }
      }
    })
  };
  const result = await fixture.service.sync("artist-a");
  assert.equal(result.created, 0);
  assert.equal(result.failed, 1);
});

test("prepare confirmation requires reply linked to an opportunity", async () => {
  const fixture = serviceFixture({ existingOpportunity: null });
  fixture.service.approvals = {
    create: async () => {
      throw new Error("should not be called");
    }
  };
  const { service, state } = fixture;
  state.opportunities = [];
  const reply = {
    id: "reply-a",
    artistId: "artist-a",
    recipientId: "recipient-a",
    opportunityId: null,
    providerThreadId: "thread-a",
    fromEmail: "buyer@example.test",
    recipient: {
      prospect: { id: "prospect-a", name: "A Buyer" },
      campaign: { id: "campaign-a", name: "Show campaign" },
      contact: { id: "contact-a", fullName: "A Buyer", email: "buyer@example.test" }
    }
  };
  state.replies.push(reply);
  await assert.rejects(
    () => service.prepareConfirmation("artist-a", "reply-a", "owner@test.invalid", "operator-a"),
    /Link an opportunity/i
  );
});

test("prepare confirmation requires applied terms", async () => {
  const fixture = serviceFixture();
  fixture.service.approvals = {
    create: async () => {
      throw new Error("should not be called");
    }
  };
  const { service, state } = fixture;
  state.replies.push({
    id: "reply-a",
    artistId: "artist-a",
    recipientId: "recipient-a",
    opportunityId: "opp-a",
    providerThreadId: "thread-a",
    fromEmail: "buyer@example.test",
    termsAppliedAt: null,
    recipient: {
      prospect: { id: "prospect-a", name: "A Buyer" },
      campaign: { id: "campaign-a", name: "Show campaign" },
      opportunity: { id: "opp-a", name: "Venue Show", artistId: "artist-a" },
      contact: { id: "contact-a", fullName: "A Buyer", email: "buyer@example.test" }
    }
  });
  await assert.rejects(
    () => service.prepareConfirmation("artist-a", "reply-a", "owner@test.invalid", "operator-a"),
    /Apply terms/i
  );
});

test("prepare confirmation creates idempotent approval payload", async () => {
  const fixture = serviceFixture();
  const { service, state } = fixture;

  state.replies.push({
    id: "reply-a",
    artistId: "artist-a",
    recipientId: "recipient-a",
    opportunityId: "opp-a",
    providerThreadId: "thread-a",
    fromEmail: "buyer@example.test",
    termsAppliedAt: new Date().toISOString(),
    recipient: {
      prospect: { id: "prospect-a", name: "A Buyer" },
      campaign: { id: "campaign-a", name: "Show campaign" },
      opportunity: { id: "opp-a", name: "Venue Show", artistId: "artist-a" },
      contact: { id: "contact-a", fullName: "A Buyer", email: "buyer@example.test" }
    }
  });

  const first = await service.prepareConfirmation(
    "artist-a",
    "reply-a",
    "owner@test.invalid",
    "operator-a"
  );
  const second = await service.prepareConfirmation(
    "artist-a",
    "reply-a",
    "owner@test.invalid",
    "operator-a"
  );

  assert.equal(first.approval.id, second.approval.id);
  assert.equal(first.approval.actionType, "booking_reply_confirm");
  assert.equal(first.approval.payload.replyId, "reply-a");
  assert.equal(first.approval.payload.opportunityId, "opp-a");
  assert.equal(state.approvals.length, 1);
});
