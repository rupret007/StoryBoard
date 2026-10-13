import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WorkflowTelegramService } = require("../dist/workflow-automation/workflow-telegram.service.js");

const ARTIST_ID = "artist-1";
const DEDUPE_KEY = "approval_failed:approval-1";

function uniqueError() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function enabledArtist(overrides = {}) {
  return {
    id: ARTIST_ID,
    name: "Test Band",
    telegramUrgentEnabled: true,
    telegramChatId: "12345",
    telegramNotifyCategories: {
      approvals: true,
      overdueTasks: true,
      staleFollowUps: true
    },
    ...overrides
  };
}

function fixture({
  artist = enabledArtist(),
  createBarrier = false,
  failSentPersist = false,
  existing,
  adapterImpl
} = {}) {
  const rows = new Map();
  const events = [];
  const audits = [];
  let idSeq = 0;
  let waitingCreates = 0;
  let releaseCreates;
  const allCreatesEntered = new Promise((resolve) => {
    releaseCreates = resolve;
  });

  if (existing) {
    rows.set(`${existing.artistId}:${existing.dedupeKey}`, {
      id: "existing",
      sentAt: existing.sentAt ?? null,
      lastError: existing.lastError ?? null,
      ...existing
    });
  }

  const keyOf = (artistId, dedupeKey) => `${artistId}:${dedupeKey}`;

  const prisma = {
    client: {
      artist: {
        findUnique: async ({ where }) => (where.id === artist?.id ? artist : null)
      },
      telegramUrgentDedupe: {
        findUnique: async ({ where }) => {
          const key = where.artistId_dedupeKey;
          return rows.get(keyOf(key.artistId, key.dedupeKey)) ?? null;
        },
        create: async ({ data }) => {
          events.push("claim");
          if (createBarrier) {
            waitingCreates += 1;
            if (waitingCreates >= 2) releaseCreates();
            await allCreatesEntered;
          }
          const key = keyOf(data.artistId, data.dedupeKey);
          if (rows.has(key)) throw uniqueError();
          const row = {
            id: `dedupe-${++idSeq}`,
            artistId: data.artistId,
            dedupeKey: data.dedupeKey,
            status: data.status ?? "attempted",
            sentAt: data.sentAt ?? null,
            lastError: data.lastError ?? null
          };
          rows.set(key, row);
          return { ...row };
        },
        update: async ({ where, data }) => {
          const key = keyOf(where.artistId_dedupeKey.artistId, where.artistId_dedupeKey.dedupeKey);
          const row = rows.get(key);
          if (!row) throw new Error("dedupe row missing");
          if (failSentPersist && data.status === "sent") {
            events.push("persist-sent-failed");
            throw new Error("dedupe persist failed");
          }
          Object.assign(row, data);
          if (data.status === "sent") events.push("sent");
          if (data.lastError) events.push("lastError");
          return { ...row };
        }
      }
    }
  };

  const audit = {
    log: async (entry) => {
      audits.push(entry);
    }
  };
  const config = {
    get: () => undefined
  };
  const service = new WorkflowTelegramService(prisma, audit, config);
  let adapterCalls = 0;
  const adapterInvocations = [];
  service.useSendAdapters({
    sendReal: async () => {
      throw new Error("real Telegram adapter must not run in this test");
    },
    sendMock: (input) => {
      adapterCalls += 1;
      events.push("adapter");
      adapterInvocations.push(input);
      if (adapterImpl) return adapterImpl(input);
      return { mode: "mock", messageId: adapterCalls };
    }
  });

  const send = (overrides = {}) =>
    service.sendUrgent({
      artistId: ARTIST_ID,
      category: "approvals",
      dedupeKey: DEDUPE_KEY,
      text: "Approval execution failed.",
      aggregateType: "ApprovalRequest",
      aggregateId: "approval-1",
      ...overrides
    });

  return {
    send,
    events,
    audits,
    adapterCalls: () => adapterCalls,
    adapterInvocations,
    row: (artistId = ARTIST_ID, dedupeKey = DEDUPE_KEY) => rows.get(keyOf(artistId, dedupeKey))
  };
}

test("claims the unique dedupe row before invoking the adapter", async () => {
  const h = fixture();
  const result = await h.send();
  assert.deepEqual(result, { ok: true, delivered: true, mode: "mock" });
  assert.deepEqual(h.events, ["claim", "adapter", "sent"]);
  assert.equal(h.adapterCalls(), 1);
  assert.equal(h.row().status, "sent");
  assert.ok(h.row().sentAt instanceof Date);
  assert.equal(h.row().lastError, null);
  assert.equal(h.audits.at(-1)?.action, "telegram.urgent.sent");
  assert.equal(h.audits.at(-1)?.metadata.mode, "mock");
});

test("two concurrent calls for one key invoke the adapter at most once", async () => {
  const h = fixture({ createBarrier: true });
  const results = await Promise.all([h.send(), h.send()]);
  const delivered = results.filter((r) => r.ok && r.delivered);
  const skipped = results.filter((r) => r.ok && r.skipped === "dedupe");
  assert.equal(h.adapterCalls(), 1, "both callers invoked the adapter before the unique insert");
  assert.equal(delivered.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(h.row().status, "sent");
  assert.equal(h.events.filter((e) => e === "claim").length, 2);
  assert.equal(h.events.filter((e) => e === "adapter").length, 1);
});

test("a persist-sent failure after the adapter does not resend and is not delivered", async () => {
  const h = fixture({ failSentPersist: true });
  const first = await h.send();
  assert.equal(first.ok, false);
  assert.equal("delivered" in first, false);
  assert.equal(h.adapterCalls(), 1);
  assert.equal(h.row().status, "attempted");
  assert.equal(h.row().sentAt, null);
  assert.match(h.row().lastError, /dedupe persist failed/);
  assert.equal(h.audits.some((entry) => entry.action === "telegram.urgent.sent"), false);
  assert.equal(h.audits.at(-1)?.action, "telegram.urgent.failed");

  const replay = await h.send();
  assert.deepEqual(replay, {
    ok: true,
    delivered: false,
    mode: "mock",
    skipped: "dedupe"
  });
  assert.equal(h.adapterCalls(), 1, "replay after persist failure invoked the adapter again");
  assert.equal(h.row().status, "attempted");
});

test("an adapter throw keeps the attempted claim and does not automatically resend", async () => {
  const h = fixture({
    adapterImpl: () => {
      throw new Error("telegram unavailable");
    }
  });
  const first = await h.send();
  assert.deepEqual(first, { ok: false, error: "telegram unavailable" });
  assert.equal(h.adapterCalls(), 1);
  assert.equal(h.row().status, "attempted");
  assert.equal(h.row().sentAt, null);
  assert.equal(h.row().lastError, "telegram unavailable");
  assert.equal(h.audits.some((entry) => entry.action === "telegram.urgent.sent"), false);
  assert.equal(h.audits.at(-1)?.action, "telegram.urgent.failed");

  const replay = await h.send();
  assert.equal(replay.skipped, "dedupe");
  assert.equal(replay.delivered, false);
  assert.equal(h.adapterCalls(), 1);
});

test("an existing attempted or sent claim skips without invoking the adapter", async () => {
  for (const status of ["attempted", "sent"]) {
    const h = fixture({
      existing: {
        artistId: ARTIST_ID,
        dedupeKey: DEDUPE_KEY,
        status,
        sentAt: status === "sent" ? new Date("2026-10-12T00:00:00.000Z") : null,
        lastError: null
      }
    });
    const result = await h.send();
    assert.deepEqual(result, {
      ok: true,
      delivered: false,
      mode: "mock",
      skipped: "dedupe"
    });
    assert.equal(h.adapterCalls(), 0);
    assert.equal(h.events.includes("claim"), true);
    assert.equal(h.row().status, status);
  }
});

test("disabled Telegram, missing chat, and disabled category skip without claiming", async () => {
  const cases = [
    {
      artist: enabledArtist({ telegramUrgentEnabled: false }),
      skipped: "telegram_disabled"
    },
    {
      artist: enabledArtist({ telegramChatId: "   " }),
      skipped: "missing_chat_id"
    },
    {
      artist: enabledArtist({
        telegramNotifyCategories: {
          approvals: false,
          overdueTasks: true,
          staleFollowUps: true
        }
      }),
      skipped: "category_disabled"
    }
  ];
  for (const { artist, skipped } of cases) {
    const h = fixture({ artist });
    const result = await h.send();
    assert.deepEqual(result, { ok: true, delivered: false, mode: "mock", skipped });
    assert.equal(h.adapterCalls(), 0);
    assert.equal(h.row(), undefined);
    assert.equal(h.events.includes("claim"), false);
  }
});

test("missing artist does not claim or invoke the adapter", async () => {
  const h = fixture({ artist: null });
  const result = await h.send();
  assert.deepEqual(result, { ok: false, error: "artist_not_found" });
  assert.equal(h.adapterCalls(), 0);
  assert.equal(h.row(), undefined);
});
