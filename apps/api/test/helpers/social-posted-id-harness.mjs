import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SocialExecutionService } = require("../../dist/social/social-execution.service.js");

export function postedIdHarness({ role = "owner", deliveryState = "published", mode = "real", publish, auditOwner = true } = {}) {
  const account = { id: "account", artistId: "artist", platform: "facebook", status: "active",
    externalAccountId: "page", accountLabel: "Stalemate", voiceKey: "stalemate" };
  const target = { id: "target", platform: "facebook", account, accountId: account.id, postId: "post",
    enabled: true, caption: "Approved words", title: null, tags: [], includeFacebookEvent: false,
    facebookEventName: null, facebookEventStartsAt: null, facebookEventPlace: null,
    captionVariants: [], selectedVariantIndex: 0, status: "pending", externalPostId: null,
    externalPostUrl: null, isDraftOnly: false, lastError: null };
  const approval = { id: "approval", artistId: "artist", actionType: "social_post_batch", status: "approved",
    sourceKey: "social_post:post", approvedAt: new Date(), approvedBy: "owner@example.invalid",
    executionAttemptedAt: new Date(), payload: { adapterMode: mode, postId: "post", voiceKey: "stalemate", targets: [{
      targetId: "target", platform: "facebook", enabled: true, caption: target.caption, tags: [],
      includeFacebookEvent: false, accountExternalId: "page", accountLabel: "Stalemate", accountVoiceKey: "stalemate"
    }] } };
  const post = { id: "post", artistId: "artist", approvalRequestId: "approval", approval,
    status: "approved", voiceKey: "stalemate", mediaAsset: null, targets: [target], sendLogs: [],
    createdAt: new Date(), note: "note" };
  const writes = [], calls = [], audits = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const client = {
    artistMembership: { findUnique: async () => ({ role }) },
    artist: { findUniqueOrThrow: async () => ({ id: "artist", name: "Stalemate" }) },
    approvalRequest: {
      findFirst: async ({ where }) => matches(approval, where) ? structuredClone(approval) : null,
      updateMany: async ({ where, data }) => {
        if (!matches(approval, where)) return { count: 0 };
        Object.assign(approval, data); writes.push("approval"); return { count: 1 };
      }
    },
    socialPost: {
      findFirst: async ({ where }) => matches(post, where) ? structuredClone(post) : null,
      updateMany: async ({ where, data }) => {
        if (!matches(post, where)) return { count: 0 };
        Object.assign(post, data); writes.push("post"); return { count: 1 };
      },
      update: async ({ data }) => { Object.assign(post, data); writes.push("post"); return post; }
    },
    socialPostTarget: {
      findUnique: async ({ where, select }) => {
        if (where.id !== target.id) return null;
        if (!select) return structuredClone(target);
        return Object.fromEntries(
          Object.keys(select).filter((key) => key in target).map((key) => [key, target[key]])
        );
      },
      updateMany: async ({ where, data }) => {
        if (!matches(target, where)) return { count: 0 };
        Object.assign(target, data); writes.push("target"); return { count: 1 };
      },
      update: async ({ data }) => { Object.assign(target, data); writes.push("target"); return target; }
    },
    socialSendLog: {
      create: async ({ data }) => { const log = { id: `log-${post.sendLogs.length}`, attemptedAt: new Date(), ...data };
        post.sendLogs.push(log); writes.push("attempt"); return log; },
      update: async ({ where, data }) => { Object.assign(post.sendLogs.find((log) => log.id === where.id), data); }
    },
    auditEvent: { findFirst: async () => auditOwner ? {} : null,
      create: async ({ data }) => { audits.push(data); return data; } },
    integrationConnection: { findUnique: async () => ({ status: "active", encryptedSecrets: { blob: "encrypted" } }) }
  };
  client.$transaction = async (callback) => callback(client);
  const execution = new SocialExecutionService({ client }, {}, { get: (key) => key === "SOCIAL_ADAPTER" ? mode : undefined }, {
    configured: () => true, decryptJson: () => ({ v: 1, pageId: "page", pageAccessToken: "synthetic-token" })
  });
  execution.adapters = () => ({ facebook: { platform: "facebook", mode, publish: async (input) => {
    calls.push(input);
    assert.equal(target.status, "sending");
    assert.equal(post.sendLogs[0].outcome, "unknown", "durable unknown receipt precedes every effect");
    if (publish) return publish(input);
    return { success: true, deliveryState, isDraftOnly: false, externalPostId: "provider-id", durationMs: 1, requestSummary: {} };
  } } });
  return { execution, client, approval, post, target, calls, writes, audits };
}
