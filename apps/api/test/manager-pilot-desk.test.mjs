import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { deterministicManagerChat, managerQuestionNeedsRecordedDeskAnswer, managerQuestionAsksAboutFourthBand } = require("../dist/manager/manager-intelligence.js");
const { recordedPilotDesk, managerEvidenceLinks, readManagerEvidenceLinks } = require("../dist/manager/manager-pilot-desk.js");
const { projectManagerConversationMessages } = require("../dist/manager/manager-conversation-visibility.js");
const { ManagerService } = require("../dist/manager/manager.service.js");

const now = new Date("2030-10-01T18:00:00Z");
const empty = {
  artist: { id: "rad-dad", name: "Rad Dad fixture" }, profile: null,
  members: [], goals: [], initiatives: [], tasks: [], opportunities: [], events: [], projects: [],
  deals: [], invoices: [], decisions: [], approvals: [], bookingReplies: [], campaignRecipients: [],
  prospects: [], settlements: [], goalMeasurements: [], recommendationHistory: [], songs: [], setlists: []
};
const task = (id, bandMemberId, extras = {}) => ({ id, bandMemberId, title: `${id} title`, dueAt: null, status: "todo", ...extras });
const member = { id: "jeff-rad", name: "Jeff", linkedOperatorId: "account-jeff" };
const otherMember = { id: "travis-rad", name: "Travis", linkedOperatorId: "account-travis" };
const event = (id, type, extras = {}) => ({ id, type, title: `${id} title`, status: "confirmed", startsAt: new Date("2030-10-03T00:00:00Z"), timezone: "America/Chicago", participants: [], ...extras });

test("pilot personal task answers require the caller's exact current-band performer link", () => {
  const facts = { ...empty, members: [member, otherMember], tasks: [task("mine", member.id), task("someone-else", otherMember.id), task("name-only", null, { ownerLabel: "Jeff" }), task("done", member.id, { status: "done" })] };
  const unlinked = deterministicManagerChat(facts, "What do I need to do?", now);
  assert.match(unlinked.answer, /not linked to an active performer/);
  assert.deepEqual(unlinked.citations, []);
  const own = deterministicManagerChat({ ...facts, currentMemberId: member.id }, "What do I need to do?", now);
  assert.match(own.answer, /Rad Dad fixture: Jeff, 1 open task/);
  assert.match(own.answer, /mine title.*no due date recorded/);
  assert.doesNotMatch(own.answer, /someone-else|name-only|done title/);
  assert.deepEqual(own.citations, [member.id, "mine"]);
  assert.equal(own.recommendation, null);
});

test("personal task blockers and prerequisites survive due-date sorting without claiming readiness", () => {
  const facts = { ...empty, currentMemberId: member.id, members: [member], tasks: [
    task("blocked", member.id, { dueAt: new Date("2030-10-01T00:00:00Z"), status: "blocked", blockedReason: "Venue must confirm", prerequisites: [{ prerequisiteTask: task("agree terms", otherMember.id) }] }),
    task("ready", member.id)
  ] };
  const answer = recordedPilotDesk(facts, "What are my tasks?", now);
  assert.match(answer.answer, /Oct 1, 2030 \(UTC calendar day, today\); blocked: Venue must confirm/);
  assert.match(answer.answer, /First resolve: agree terms title/);
  assert.doesNotMatch(answer.answer, /overdue/);
  assert.ok(answer.citations.includes("agree terms"));
});

test("next show selects the dated gig, excludes rehearsal and closed records, and names real gaps", () => {
  const gig = event("actual-show", "gig", { readiness: { gaps: [{ title: "Setlist missing", detail: "No running order is linked.", nextAction: "Attach the recorded setlist.", evidenceIds: ["actual-show"] }] } });
  const facts = { ...empty, events: [event("rehearsal", "rehearsal", { startsAt: now }), event("undated", "gig", { startsAt: null }), event("cancelled", "gig", { startsAt: now, status: "cancelled" }), gig] };
  const answer = deterministicManagerChat(facts, "What is blocking our next show?", now);
  assert.match(answer.answer, /Next recorded show: “actual-show title”/);
  assert.match(answer.answer, /CDT/);
  assert.match(answer.answer, /Setlist missing.*Attach the recorded setlist/);
  assert.doesNotMatch(answer.answer, /rehearsal title|undated title|cancelled title/);
  assert.equal(answer.recommendation, null);
});

test("next-show answer includes a blocked task even when the show assessment has no gap", () => {
  const facts = { ...empty, members: [otherMember], events: [event("tonight", "gig", { readiness: { gaps: [] } })], tasks: [task("rider", otherMember.id, { eventId: "tonight", blockedReason: "Need input list", waitingOn: "Engineer" })] };
  const answer = recordedPilotDesk(facts, "What is blocking our next show?", now);
  assert.match(answer.answer, /blocked: Need input list; waiting on Engineer/);
  assert.match(answer.answer, /Owner: Travis/);
  assert.ok(answer.citations.includes("rider"));
});

test("separate Stalemate workspace is not forbidden by Vault's parked-catalog policy", () => {
  assert.equal(managerQuestionAsksAboutFourthBand("Can Stalemate be a band workspace?"), false);
  const workspace = deterministicManagerChat({ ...empty, songs: [{ id: "vault:recorded-stalemate", title: "Recorded Stalemate song", sourceKey: "vault:recorded-stalemate", active: true }] }, "Should Stalemate be a live band?", now);
  assert.match(workspace.answer, /Stalemate can have its own band workspace, separate from Rad Dad/);
  assert.match(workspace.answer, /The current artist is Rad Dad fixture/);
  assert.match(workspace.answer, /Recorded Stalemate song/);
  assert.match(workspace.answer, /No workspace or catalog change was made/);
  assert.deepEqual(workspace.citations, ["vault:recorded-stalemate"]);
  assert.equal(managerQuestionNeedsRecordedDeskAnswer("Should Stalemate be a live band?"), true);
  const answer = deterministicManagerChat(empty, "What about the Stalemate catalog import?", now);
  assert.match(answer.answer, /Rad Dad and Stalemate can have separate band workspaces/);
  assert.match(answer.answer, /Catalogs marked parked by Vault remain excluded/);
  assert.match(answer.answer, /does not authorize importing Rad Dad's default slice/);
  assert.match(answer.answer, /Review an approved local Vault file/);
  assert.equal(answer.recommendation, null);
});

test("availability names no-answer, tentative, and unavailable separately for the next recorded event", () => {
  const facts = { ...empty, members: [member, otherMember, { id: "pat", name: "Pat" }, { id: "lee", name: "Lee" }], events: [event("rehearsal", "rehearsal", { participants: [
    { id: "p1", bandMemberId: otherMember.id, response: "tentative" },
    { id: "p2", bandMemberId: "pat", response: "unavailable" },
    { id: "p3", bandMemberId: "lee", response: "available" }
  ] })] };
  const answer = deterministicManagerChat(facts, "Who has not responded?", now);
  assert.match(answer.answer, /No availability answer recorded: Jeff\./);
  assert.match(answer.answer, /Tentative: Travis\. These people have responded/);
  assert.match(answer.answer, /Unavailable: Pat/);
  assert.doesNotMatch(answer.answer, /Lee/);
  assert.match(answer.answer, /No reminder has been sent/);
  assert.ok(answer.citations.includes("rehearsal"));
  assert.match(recordedPilotDesk({ ...facts, members: [] }, "Who has not responded?", now).answer, /no active lineup/);
});

test("Travis waiting-on uses assigned recorded blockers and treats drafts as undelivered", () => {
  const facts = { ...empty, members: [member, otherMember], tasks: [task("confirm load-in", otherMember.id, { waitingOn: "Venue production" }), task("Jeff private guess", member.id, { waitingOn: "Someone" }), task("finished follow-up", otherMember.id, { status: "done" })], opportunities: [{ id: "op", title: "Recorded booking", stage: "hold", targetDate: new Date("2030-12-01") }], campaignRecipients: [
    { id: "old", status: "sent", followUpTaskId: "finished follow-up", followUpDueAt: now },
    { id: "draft", opportunityId: "op", status: "drafted", followUpTaskId: null, followUpDueAt: null }
  ] };
  const answer = deterministicManagerChat(facts, "What is Travis waiting on?", now);
  assert.match(answer.answer, /waiting on Venue production/);
  assert.match(answer.answer, /Recorded booking.*no due date recorded/);
  assert.match(answer.answer, /a draft is not proof of delivery/);
  assert.doesNotMatch(answer.answer, /Jeff private guess|Dec 1|finished follow-up/);
  assert.ok(!answer.citations.includes("old"));
  assert.match(recordedPilotDesk({ ...facts, members: [otherMember, { id: "other-travis", name: "Travis Smith" }] }, "What is Travis waiting on?", now).answer, /More than one active performer/);
});

test("outstanding money keeps currency balances distinct and settlement review separate from debt", () => {
  const invoice = { id: "usd", number: "RD-01", status: "issued", currency: "USD", totalMinor: 15000, paidMinor: 5000, dueAt: new Date("2030-10-01") };
  const answer = deterministicManagerChat({ ...empty, invoices: [invoice, { ...invoice, id: "eur", number: "RD-02", currency: "EUR", paidMinor: 0, dueAt: null }, { ...invoice, id: "voided", status: "voided" }, { ...invoice, id: "paid", paidMinor: 15000 }], settlements: [{ id: "settle", status: "draft", currency: "USD", grossMinor: 900000, netMinor: 900000, expenseMinor: 0, event: { title: "Unreviewed show" } }] }, "What money is outstanding?", now);
  assert.match(answer.answer, /USD 100.00; EUR 150.00/);
  assert.match(answer.answer, /UTC calendar day, today/);
  assert.match(answer.answer, /1 draft settlement needs review/);
  assert.match(answer.answer, /not an unpaid invoice or proof that performers were paid/);
  assert.doesNotMatch(answer.answer, /9000|overdue/);
  assert.deepEqual(answer.citations, ["usd", "eur", "settle"]);
});

test("empty pilot answers remain missing-record answers and all five questions bypass a provider", () => {
  for (const question of ["What do I need to do?", "What is blocking our next show?", "Who has not responded?", "What is Travis waiting on?", "What money is outstanding?"]) {
    assert.equal(managerQuestionNeedsRecordedDeskAnswer(question), true);
    const result = deterministicManagerChat(empty, question, now);
    assert.equal(result.recommendation, null);
    assert.deepEqual(result.citations, []);
    assert.match(result.answer, /not linked|No current|cannot be established|does not establish/);
  }
  assert.equal(recordedPilotDesk(empty, "Send a reminder to everyone who has not responded", now), null);
});

test("evidence destinations are code-owned and cannot resurrect hidden or unknown evidence", () => {
  const facts = { ...empty, members: [member], tasks: [task("t", member.id, { title: "https://untrusted.example/" })], events: [event("a/b", "gig")] };
  const evidenceLinks = managerEvidenceLinks(facts, ["t", "a/b", "foreign-id", "t"]);
  assert.deepEqual(evidenceLinks.map((link) => link.href), ["/tasks", "/operations?tab=events&event=a%2Fb"]);
  const malicious = { id: "t", label: "unsafe", href: "https://untrusted.example/" };
  assert.deepEqual(readManagerEvidenceLinks({ evidenceLinks: [...evidenceLinks, malicious] }, ["t"]), [evidenceLinks[0]]);
  const [hidden] = projectManagerConversationMessages([{ id: "m", role: "assistant", visibility: "owner_only", content: "Private", citations: ["t"], proposedActions: [], managerRun: { output: { evidenceLinks }, trace: {}, recommendations: [] } }], "normal");
  assert.deepEqual(readManagerEvidenceLinks(hidden.managerRun.output, hidden.citations), []);
});

test("AI-enabled chat binds My tasks to the authenticated account separately in both bands", async () => {
  const runs = [];
  const client = {
    managerConversation: { create: async () => ({ id: "conversation" }), update: async () => ({}) },
    managerMessage: { create: async ({ data }) => ({ id: "message", createdAt: now, ...data }), findMany: async () => [] },
    managerMessageFeedback: { findMany: async () => [] },
    managerRun: { create: async ({ data }) => { runs.push(data); return { id: "run", recommendations: [] }; } }
  };
  client.$transaction = async (fn) => fn(client);
  let providerKeyReads = 0;
  const service = new ManagerService({ client }, { log: async () => {} }, { get: (key) => key === "OPENAI_ENABLED" ? true : undefined, getOrThrow: () => { providerKeyReads += 1; throw new Error("Provider forbidden"); } });
  service.settings = async () => ({ aiEnabled: true, fullContextEnabled: false, timezone: "America/Chicago" });
  service.facts = async (artistId) => {
    const bandMember = { ...member, id: `member-${artistId}` };
    return { ...empty, artist: { id: artistId, name: artistId }, members: [bandMember], tasks: [task(`task-${artistId}`, bandMember.id)], memoryFacts: [],
      contextHealth: { gaps: [] }, teamLoad: { policyVersion: "test", status: "clear", suggestions: [], members: [] }, evidenceHealth: { status: "strong", areas: [], priorityQuestions: [], evidenceIds: [] },
      workSequence: { items: [], readyNow: [], waiting: [], policyVersion: "test", counts: { readyNow: 0, inProgress: 0, waitingOnPrerequisites: 0, conflicted: 0 } },
      goalPath: { goals: [], policyVersion: "test", counts: { ready: 0, blocked: 0, missingPlan: 0, targetMonitoring: 0 } }
    };
  };
  service.sharedFacts = (value) => value;
  service.safeFacts = () => ({});
  service.knownIds = () => new Set();
  for (const band of ["Rad Dad", "Stalemate"]) {
    const result = await service.chat(band, { message: "What do I need to do?" }, "caller", "account-jeff");
    assert.match(result.message.content, new RegExp(`task-${band}`));
    assert.ok(!result.message.content.includes(band === "Rad Dad" ? "Stalemate" : "Rad Dad"));
    assert.ok(result.message.evidenceLinks.some((row) => row.id === `task-${band}`));
    assert.equal(runs.at(-1).trace.recordedDesk.providerBypassed, true);
    assert.equal(runs.at(-1).trace.providerContext.attempted, false);
    assert.deepEqual(runs.at(-1).output.evidenceLinks, result.message.evidenceLinks);
  }
  const unlinked = await service.chat("Rad Dad", { message: "What do I need to do?" }, "Jeff", "unlinked-account");
  assert.match(unlinked.message.content, /not linked/);
  assert.equal(providerKeyReads, 0);
});

test("Manager facts queries retain band scope and exclude completed follow-ups in the database", async () => {
  for (const artistId of ["rad-dad", "stalemate"]) {
    const queries = new Map();
    const client = new Proxy({}, { get: (_, model) => model === "artist" ? { findUniqueOrThrow: async (input) => {
      assert.equal(input.where.id, artistId);
      return { id: artistId, name: artistId };
    } } : { findMany: async (input) => { queries.set(model, input); return []; } } });
    const service = new ManagerService({ client }, { log: async () => {} }, {});
    service.profile = async () => null;
    service.outcomeReview = async () => ({ recordedLessons: [] });
    service.measurementsForGoals = async () => [];
    service.followThrough = async () => ({ items: [] });
    const facts = await service.facts(artistId);
    assert.equal(facts.artist.id, artistId);
    for (const [model, query] of queries) {
      const scope = model === "bookingCampaignRecipient" ? query.where.campaign : model === "managerRecommendation" ? query.where.managerRun : query.where;
      assert.equal(scope.artistId, artistId, `${model} must remain scoped to the requested band`);
    }
    assert.equal(queries.get("bandMember").select.linkedOperatorId, true);
    assert.deepEqual(queries.get("bookingCampaignRecipient").where.NOT, { followUpTask: { is: { artistId, status: "done" } } });
    assert.equal(queries.get("bookingCampaignRecipient").select.opportunityId, true);
  }
});
