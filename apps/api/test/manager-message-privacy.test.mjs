import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const [visibility, providerContext, managerMod, continuity] = await Promise.all([
  loadApi("manager/manager-conversation-visibility.js"),
  loadApi("manager/manager-provider-context.js"),
  loadApi("manager/manager.service.js"),
  loadApi("manager/manager-conversation-continuity.js")
]);

test("durable owner-only messages are hidden without a completed Manager run", () => {
  const messages = [
    {
      id: "private-in-flight-question",
      role: "user",
      visibility: "owner_only",
      content: "Use the private guarantee ceiling 98765",
      createdAt: new Date("2026-07-13T10:00:00.000Z")
    },
    {
      id: "team-question",
      role: "user",
      visibility: "team",
      content: "What should the whole band do next?",
      createdAt: new Date("2026-07-13T10:01:00.000Z")
    }
  ];

  for (const scope of ["normal", "provider_redacted"]) {
    const projected = visibility.projectManagerConversationMessages(messages, scope);
    assert.doesNotMatch(JSON.stringify(projected), /98765|private guarantee ceiling/i);
    assert.match(JSON.stringify(projected), /whole band do next/i);
  }
  assert.match(JSON.stringify(visibility.projectManagerConversationMessages(messages, "owner")), /98765/);
  assert.match(JSON.stringify(visibility.projectManagerConversationMessages(messages, "provider_full")), /98765/);
  assert.equal(visibility.managerRunIsVisible({ message: { visibility: "owner_only" } }, "normal"), false);
  assert.equal(visibility.managerRunIsVisible({ message: { visibility: "owner_only" } }, "owner"), true);
});

test("full-context fallback and rejected output stay private even when provider output was unused", () => {
  const sourceAt = new Date("2026-07-13T11:00:00.000Z");
  const run = {
    trace: {
      providerContext: {
        fullContextEnabled: true,
        attempted: true,
        outputUsed: false,
        sourceMessageId: "private-question",
        sourceMessageCreatedAt: sourceAt.toISOString()
      }
    }
  };
  assert.deepEqual(providerContext.managerRunFullContextSourceBinding(run), {
    sourceMessageId: "private-question",
    sourceMessageCreatedAt: sourceAt.toISOString()
  });
  assert.equal(visibility.managerRunIsVisible(run, "normal"), false);
  assert.equal(visibility.managerRunIsVisible(run, "provider_redacted"), false);
  assert.equal(visibility.managerRunIsVisible(run, "owner"), true);

  const projected = visibility.projectManagerConversationMessages([
    { id: "private-question", role: "user", content: "Our private ceiling is 45678", createdAt: sourceAt },
    {
      id: "fallback-answer",
      role: "assistant",
      content: "Use the deterministic fallback.",
      createdAt: new Date(sourceAt.getTime() + 1000),
      managerRun: { ...run, recommendations: [] }
    }
  ], "provider_redacted");
  assert.doesNotMatch(JSON.stringify(projected), /45678|deterministic fallback/i);
});

test("disabling full context redacts private continuity before a new team-visible turn", () => {
  const sourceAt = new Date("2026-07-13T11:30:00.000Z");
  const history = [
    {
      id: "owner-question",
      role: "user",
      visibility: "owner_only",
      content: "Should we use the private guarantee ceiling 76543?",
      createdAt: sourceAt
    },
    {
      id: "owner-answer",
      role: "assistant",
      visibility: "owner_only",
      content: "Keep the guarantee ceiling at 76543.",
      createdAt: new Date(sourceAt.getTime() + 1000),
      managerRun: {
        trace: {
          providerContext: {
            fullContextEnabled: true,
            outputUsed: true,
            sourceMessageId: "owner-question",
            sourceMessageCreatedAt: sourceAt.toISOString()
          }
        },
        recommendations: [{
          id: "private-recommendation",
          stableKey: "private-ceiling",
          title: "Keep the private ceiling",
          reason: "The owner-only ceiling is 76543.",
          nextAction: "Use 76543 in negotiation.",
          outcome: "suggested",
          evidence: [],
          proposedAction: null
        }]
      }
    },
    {
      id: "shared-follow-up",
      role: "user",
      visibility: "team",
      content: "Why that?",
      createdAt: new Date(sourceAt.getTime() + 2000)
    }
  ];

  assert.equal(visibility.managerConversationReasoningVisibility(false), "normal");
  const sharedReasoningHistory = visibility.projectManagerConversationMessages(
    history,
    visibility.managerConversationReasoningVisibility(false)
  );
  assert.doesNotMatch(JSON.stringify(sharedReasoningHistory), /76543|private ceiling/i);
  const resolved = continuity.resolveManagerConversationContinuity("Why that?", sharedReasoningHistory);
  assert.equal(resolved.status, "needs_clarification");
  assert.equal(resolved.reasonCode, "no_structured_prior_recommendation");

  const ownerReasoningHistory = visibility.projectManagerConversationMessages(
    history,
    visibility.managerConversationReasoningVisibility(true)
  );
  assert.match(JSON.stringify(ownerReasoningHistory), /76543/);
  assert.equal(continuity.resolveManagerConversationContinuity("Why that?", ownerReasoningHistory).status, "resolved");
});

test("a known owner-only response ID cannot be rated by a non-owner", async () => {
  const observedWhere = [];
  const upserts = [];
  const service = new managerMod.ManagerService({
    client: {
      managerMessage: {
        findFirst: async ({ where }) => {
          observedWhere.push(where);
          return {
            id: "private-response",
            role: "assistant",
            visibility: "owner_only",
            managerRunId: "private-run",
            managerRun: { trace: {}, recommendations: [] }
          };
        }
      },
      managerMessageFeedback: {
        upsert: async ({ create }) => {
          upserts.push(create);
          return { id: "feedback-a", ...create, createdAt: new Date(), updatedAt: new Date() };
        }
      }
    }
  }, { log: async () => undefined }, { get: () => false });

  await assert.rejects(
    () => service.messageFeedback("artist-a", "private-response", { helpful: true }, "member@test", "member-a"),
    (error) => error?.getStatus?.() === 404
  );
  const ownerResult = await service.messageFeedback("artist-a", "private-response", { helpful: true }, "owner@test", "owner-a", true);
  assert.equal(ownerResult.id, "feedback-a");
  assert.equal(observedWhere.length, 2);
  assert.equal(upserts.length, 1);
});

test("the forward migration fails closed for legacy completed and interrupted private turns", async () => {
  const migration = await readFile(
    join(dir, "..", "..", "..", "prisma", "migrations", "20260714020000_manager_message_visibility", "migration.sql"),
    "utf8"
  );
  assert.match(migration, /providerContext,fullContextEnabled/);
  assert.match(migration, /providerContext,sourceMessageId/);
  assert.match(migration, /GROUP BY candidate\."conversationId"/);
  assert.match(migration, /COUNT\(\*\) FILTER \(WHERE candidate\."role" = 'user'\)/);
  assert.match(migration, /> COUNT\(\*\) FILTER \(WHERE candidate\."role" = 'assistant'\)/);
  assert.match(migration, /SET "title" = 'Manager conversation'/);
});
