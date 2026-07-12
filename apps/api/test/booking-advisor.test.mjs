import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const advisorImport = await import(pathToFileURL(join(dir, "..", "dist", "advisor", "booking-advisor.service.js")).href);
const advisorMod = advisorImport.default ?? advisorImport;

test("booking advisor is deterministic and reviewable when OpenAI is disabled", async () => {
  let persisted;
  const service = new advisorMod.BookingAdvisorService(
    { client: {
      artist: { findUniqueOrThrow: async () => ({ name: "Test Band" }) },
      bookingProspect: { groupBy: async () => [{ status: "qualified", _count: { _all: 3 } }] },
      bookingCampaignRecipient: { groupBy: async () => [{ status: "ready", _count: { _all: 2 } }] },
      bookingCampaignDelivery: { groupBy: async () => [{ status: "sent", _count: { _all: 1 } }] },
      bookingMarketSprint: { findMany: async () => [{ name: "Austin", city: "Austin" }] },
      bookingAdvisorFeedback: { groupBy: async () => [{ helpful: true, _count: { _all: 2 } }] },
      bookingAdvisorRecommendation: { groupBy: async () => [] },
      bookingAdvisorRun: { create: async ({ data }) => { persisted = data; return { id: "advisor-a", ...data, recommendations: [] }; } }
    } },
    { log: async () => undefined },
    { get: () => false }
  );
  const run = await service.generate("artist-a", "manager@test.invalid", "operator-a");
  assert.equal(run.mode, "deterministic");
  assert.equal(persisted.promptVersion, "booking_advisor_v2");
  assert.equal(persisted.advice.opportunities.length, 3);
  assert.equal(persisted.inputFacts.artistName, "Test Band");
});

test("booking advisor only includes CRM records when full context is explicitly enabled", async () => {
  let persisted;
  const client = {
    artist: { findUniqueOrThrow: async () => ({ name: "Test Band" }) },
    bookingProspect: {
      groupBy: async () => [],
      findMany: async () => [{ id: "prospect-a", name: "Known lead", contact: { email: "buyer@example.test" } }]
    },
    bookingCampaignRecipient: { groupBy: async () => [] },
    bookingCampaignDelivery: { groupBy: async () => [] },
    bookingMarketSprint: { findMany: async () => [] },
    bookingAdvisorFeedback: { groupBy: async () => [] },
    bookingAdvisorRecommendation: { groupBy: async () => [] },
    bookingAdvisorRun: { create: async ({ data }) => { persisted = data; return { id: "advisor-b", ...data, recommendations: [] }; } }
  };
  const service = new advisorMod.BookingAdvisorService(
    { client },
    { log: async () => undefined },
    { get: (key) => key === "OPENAI_ADVISOR_CONTEXT" ? "full" : false }
  );
  await service.generate("artist-a", "manager@test.invalid", "operator-a");
  assert.equal(persisted.inputFacts.contextPolicy, "full_crm");
  assert.equal(persisted.inputFacts.records[0].id, "prospect-a");
  assert.equal(persisted.advice.opportunities[0].evidenceIds[0], "prospect-a");
});
