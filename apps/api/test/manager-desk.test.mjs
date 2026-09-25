import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ManagerService } = require("../dist/manager/manager.service.js");
const { evaluateManagerDesk } = require("../dist/manager/manager-desk-evaluation.js");

for (const result of evaluateManagerDesk()) {
  test(result.name, () => assert.equal(result.passed, true, result.detail));
}

test("AI-enabled Manager service persists recorded desk answers without attempting a provider", async () => {
  const runs = [];
  const client = {
    managerConversation: { create: async () => ({ id: "conversation" }), update: async () => ({}) },
    managerMessage: { create: async ({ data }) => ({ id: "message", createdAt: new Date(), ...data }), findMany: async () => [] },
    managerMessageFeedback: { findMany: async () => [] },
    managerRun: { create: async ({ data }) => { runs.push(data); return { id: "run", recommendations: [] }; } }
  };
  client.$transaction = async (fn) => fn(client);
  let providerKeyReads = 0;
  const service = new ManagerService({ client }, { log: async () => {} }, {
    get: (key) => key === "OPENAI_ENABLED" ? true : undefined,
    getOrThrow: () => { providerKeyReads += 1; throw new Error("No provider permitted in this test"); }
  });
  const facts = {
    artist: { id: "fixture", name: "Offline fixture" }, profile: null,
    members: [], goals: [], initiatives: [], tasks: [], opportunities: [], events: [], projects: [],
    deals: [], invoices: [], decisions: [], approvals: [], bookingReplies: [], campaignRecipients: [],
    prospects: [], settlements: [], goalMeasurements: [], recommendationHistory: [], songs: [], setlists: [], memoryFacts: [],
    contextHealth: { gaps: [] }, teamLoad: { policyVersion: "test", status: "clear", suggestions: [], members: [] }, evidenceHealth: { status: "current", areas: [], priorityQuestions: [] },
    workSequence: { items: [], readyNow: [], waiting: [], policyVersion: "test", counts: { readyNow: 0, inProgress: 0, waitingOnPrerequisites: 0, conflicted: 0 } },
    goalPath: { goals: [], policyVersion: "test", counts: { ready: 0, blocked: 0, missingPlan: 0, targetMonitoring: 0 } }
  };
  facts.evidenceHealth = require("../dist/manager/manager-evidence-health.js").deterministicManagerEvidenceHealth(facts);
  service.settings = async () => ({ aiEnabled: true, fullContextEnabled: false, timezone: "America/Chicago" });
  service.facts = async () => facts;
  service.sharedFacts = (value) => value;
  service.safeFacts = () => ({});
  service.knownIds = () => new Set();
  for (const [question, expected] of [
    ["Manager desk snapshot", /Setlists: No songs or setlists/],
    ["What is today's schedule?", /No event for today is recorded/],
    ["Which invoices are unpaid?", /No unpaid invoices are recorded/],
    ["What is our setlist?", /Vault is the sole catalog/]
  ]) {
    const result = await service.chat("fixture", { message: question }, "offline@test", "operator");
    assert.match(result.message.content, expected);
    const run = runs.at(-1);
    assert.equal(run.mode, "deterministic");
    assert.equal(run.trace.recordedDesk.providerBypassed, true);
    assert.equal(run.trace.providerContext.attempted, false);
    assert.deepEqual(run.trace.toolsSelected, []);
  }
  assert.equal(providerKeyReads, 0);
});
