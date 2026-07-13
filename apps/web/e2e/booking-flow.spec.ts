import { expect, test, type Locator, type Page } from "@playwright/test";
import { instantToDateTimeLocal } from "@storyboard/shared";

const browserTestWebUrl = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const browserTestApiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";

function dateTimeLocalInZone(value: Date, timeZone: string) {
  const result = instantToDateTimeLocal(value, timeZone);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

async function signInForBrowserTest(page: Page) {
  await page.goto(browserTestWebUrl);
  const devLogin = page.getByRole("link", { name: "Dev login (local only)" });
  await expect(devLogin).toBeVisible();
  await expect(devLogin).toHaveAttribute("href", `${browserTestApiUrl}/auth/dev/login`);
  await devLogin.click();
  await expect(page.getByText("Your operational home base")).toBeVisible();
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "sb_session"), { message: "Dev login must establish the browser session cookie" }).toBe(true);
}

type BrowserTestMember = { id: string; name: string };

async function activeArtistId(page: Page) {
  const response = await page.request.get(`${browserTestApiUrl}/auth/me`);
  expect(response.ok(), await response.text()).toBe(true);
  const me = await response.json() as { currentArtistId: string | null; memberships: Array<{ artistId: string }> };
  const artistId = me.currentArtistId ?? me.memberships[0]?.artistId;
  expect(artistId, "The seeded browser-test operator must own an artist").toBeTruthy();
  return artistId!;
}

async function artistApi<T>(page: Page, artistId: string, path: string, method: "GET" | "POST" | "PUT" | "PATCH" = "GET", data?: unknown) {
  const response = await page.request.fetch(`${browserTestApiUrl}${path}`, {
    method,
    headers: {
      "x-artist-id": artistId,
      origin: browserTestWebUrl
    },
    ...(data === undefined ? {} : { data })
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function expectManagerActionReceipt(proposal: Locator, state: "needs_action" | "in_motion" | "blocked" | "completed", tone: "success" | "warning" | "danger" | "neutral" = "success") {
  const receipt = proposal.getByTestId("manager-action-receipt");
  await expect(receipt).toHaveAttribute("data-state", state);
  await expect(receipt).toHaveAttribute("data-tone", tone);
  await expect(proposal.getByTestId("manager-action-outcome")).toHaveAttribute("data-tone", tone);
  return receipt;
}

const managerFoundationProfile = {
  bandMode: "hybrid",
  careerStage: "Local working band",
  homeCity: "Chicago",
  homeRegion: "IL",
  homeCountry: "US",
  genres: ["rock", "soul"],
  businessName: "E2E Band LLC",
  revenueSources: ["Private events", "Ticketed shows"],
  currentAssets: ["Finished EP masters", "Live performance video"],
  constraints: ["Weeknight work schedules"],
  educationTopics: [],
  availabilityExpectations: null,
  budgetToleranceMinor: 50_000,
  currency: "USD",
  twelveMonthAmbition: "Release an EP and book six profitable regional shows.",
  communicationCadence: "weekly",
  decisionStyle: "guided"
} as const;

async function ensureManagerFoundation(page: Page, checkIns = false) {
  await signInForBrowserTest(page);
  const artistId = await activeArtistId(page);
  const currentProfile = await artistApi<{ intakeCompletedAt?: string | null } | null>(page, artistId, "/manager/profile");
  if (!currentProfile?.intakeCompletedAt) {
    await artistApi(page, artistId, "/manager/intake/complete", "POST", {
      profile: managerFoundationProfile,
      members: [
        { name: "Alex", roles: ["bandleader", "booking"], instruments: ["vocals", "guitar"], active: true },
        { name: "Morgan", roles: ["production", "finances"], instruments: ["drums"], active: true }
      ]
    });
  } else {
    await artistApi(page, artistId, "/manager/profile", "PUT", managerFoundationProfile);
  }

  const existingMembers = await artistApi<BrowserTestMember[]>(page, artistId, "/manager/members");
  const members: BrowserTestMember[] = [];
  for (const member of [
    { name: "Alex", roles: ["bandleader", "booking"], instruments: ["vocals", "guitar"] },
    { name: "Morgan", roles: ["production", "finances"], instruments: ["drums"] }
  ]) {
    const existing = existingMembers.find((candidate) => candidate.name === member.name);
    const saved = existing
      ? await artistApi<BrowserTestMember>(page, artistId, `/manager/members/${existing.id}`, "PATCH", { ...member, active: true })
      : await artistApi<BrowserTestMember>(page, artistId, "/manager/members", "POST", { ...member, active: true });
    members.push(saved);
  }
  await artistApi(page, artistId, "/manager/plan/ensure", "POST", {});
  if (checkIns) {
    await artistApi(page, artistId, `/manager/members/${members.find((member) => member.name === "Alex")!.id}/check-ins`, "POST", { status: "available" });
    await artistApi(page, artistId, `/manager/members/${members.find((member) => member.name === "Morgan")!.id}/check-ins`, "POST", { status: "limited" });
  }
  return { artistId, members };
}

async function ensureQualifiedProspect(page: Page, artistId: string) {
  const prospects = await artistApi<Array<{ status: string }>>(page, artistId, "/booking-prospects");
  if (prospects.some((prospect) => prospect.status === "qualified" || prospect.status === "converted")) return;
  await artistApi(page, artistId, "/booking-prospects", "POST", {
    kind: "venue",
    status: "qualified",
    name: `E2E Manager prospect ${Date.now().toString(36)}`,
    city: "Chicago"
  });
}

test("manual prospect can gain a buyer and enter an approval-ready campaign", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const prospectName = `E2E Buyer Lead ${suffix}`;
  const campaignName = `Austin outreach ${suffix}`;

  // The runner resets only the explicit test database, then seeds this owner
  // workspace so first-use flows remain deterministic across iterations.
  await signInForBrowserTest(page);

  await page.goto("/prospects");
  await page.getByLabel("Home city").fill("Austin");
  await page.getByLabel("Genres (comma separated)").fill("indie rock");
  await page.getByLabel("Capacity minimum").fill("100");
  await page.getByLabel("Capacity maximum").fill("500");
  await page.getByLabel("Short booking pitch").fill("A sharp, audience-ready live set.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Ready to book")).toBeVisible();

  const manualLead = page.getByText("Add a manual lead").locator("..");
  await manualLead.getByLabel("Name").fill(prospectName);
  await manualLead.getByLabel("City", { exact: true }).fill("Austin");
  await manualLead.getByRole("button", { name: "Save lead" }).click();
  const status = page.getByLabel(`Status for ${prospectName}`);
  await status.selectOption("qualified");
  const card = status.locator("..");
  await card.getByRole("button", { name: "Add/link buyer" }).click();
  await card.getByRole("button", { name: "New buyer/promoter" }).click();
  await card.getByLabel("Name").fill("Morgan Promoter");
  await card.getByLabel("Email").fill(`morgan-${suffix}@example.test`);
  await card.getByRole("button", { name: "Save buyer" }).click();
  await expect(card.getByText("Buyer: Morgan Promoter")).toBeVisible();

  await page.goto("/booking-campaigns");
  const deliveryMode = page.getByLabel("Delivery after approval");
  await expect(deliveryMode).toHaveValue("draft_only");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.getByLabel(`Prospect for ${campaignName}`).selectOption({ label: `${prospectName} · Austin` });
  await page.getByLabel(`Add recipient to ${campaignName}`).click();
  await expect(page.getByText("ready")).toBeVisible();
  await page.getByLabel(`Preview campaign ${campaignName}`).click();
  await expect(page.getByText("Personalized email preview")).toBeVisible();
  await expect(page.getByText(/execution creates Gmail drafts only/i)).toBeVisible();
  await expect(page.getByText(`morgan-${suffix}@example.test`, { exact: true })).toBeVisible();
});

test("booking advisor produces reviewable, non-automated guidance", async ({ page }) => {
  await signInForBrowserTest(page);

  await page.goto("/advisor");
  const generate = page.getByRole("button", { name: "Generate booking brief" });
  if (await generate.isVisible().catch(() => false)) await generate.click();
  await expect(page.getByRole("heading", { name: "Current booking brief" })).toBeVisible();
  await expect(page.getByText(/never sends or changes records/i)).toBeVisible();
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
});

test("band can build, time, annotate, and reorder a practical setlist", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const firstSong = `E2E opener ${suffix}`;
  const secondSong = `E2E closer ${suffix}`;
  const setName = `E2E running order ${suffix}`;
  await signInForBrowserTest(page);
  await page.goto("/operations");
  await page.getByRole("tab", { name: "Music & setlists" }).click();

  await page.getByPlaceholder("Song title").fill(firstSong);
  await page.getByLabel("New song duration in minutes and seconds").fill("4:05");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-testid^="song-"]').filter({ hasText: firstSong })).toBeVisible();
  await page.getByPlaceholder("Song title").fill(secondSong);
  await page.getByLabel("New song duration in minutes and seconds").fill("");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-testid^="song-"]').filter({ hasText: secondSong })).toBeVisible();

  await page.getByPlaceholder("Friday headline set").fill(setName);
  await page.getByRole("button", { name: "Create setlist" }).click();
  const builder = page.locator('details[data-testid^="setlist-"]').filter({ hasText: setName });
  await expect(builder).toBeVisible();
  await builder.locator("summary").click();
  await builder.getByLabel(`Song to add to ${setName}`).selectOption({ label: `${firstSong} · 4:05` });
  await builder.getByLabel(`Add song to ${setName}`).click();
  await builder.getByLabel(`Song to add to ${setName}`).selectOption({ label: `${secondSong} · duration unknown` });
  await builder.getByLabel(`Add song to ${setName}`).click();
  await builder.getByLabel(`Add break to ${setName}`).click();
  await expect(builder.getByText("4:05 known + 1 song duration missing", { exact: true })).toBeVisible();
  await builder.getByLabel(`Move position 2 up in ${setName}`).click();
  await expect(builder.getByLabel(`Song at position 1 in ${setName}`)).toHaveValue(await builder.getByLabel(`Song to add to ${setName}`).inputValue());
  await builder.getByLabel(`Transition after position 1 in ${setName}`).fill("Hold for count-in, then segue");
  await builder.getByLabel(`Status for setlist ${setName}`).selectOption("active");
  const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/setlists/") && response.ok());
  await builder.getByRole("button", { name: "Save running order" }).click();
  await saved;
  await expect(builder.locator("summary").getByText("active", { exact: true })).toBeVisible();

  await page.getByLabel(`Edit song ${secondSong}`).click();
  await page.getByLabel(`Duration for ${secondSong}`).fill("3:30");
  const songSaved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/songs/") && response.ok());
  await page.getByRole("button", { name: "Save song" }).click();
  await songSaved;
  await expect(builder.locator("summary").getByText(/7:35 song time/)).toBeVisible();
  if ((await builder.getAttribute("open")) === null) await builder.locator("summary").click();
  await expect(builder.getByLabel(`Transition after position 1 in ${setName}`)).toHaveValue("Hold for count-in, then segue");
});

test("novice manager intake produces grounded work and band operations records", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await signInForBrowserTest(page);
  await ensureQualifiedProspect(page, await activeArtistId(page));
  await page.goto("/manager");
  const intake = page.getByRole("heading", { name: "Tell StoryBoard enough to manage the tradeoffs" });
  if (await intake.isVisible().catch(() => false)) {
    await page.getByLabel("What kind of band?").selectOption("hybrid");
    await page.getByLabel("Career stage").fill("Local working band");
    await page.getByLabel("Home market").fill("Chicago, IL");
    await page.getByLabel("Genres").fill("rock, soul");
    await page.getByLabel("What would a great next 12 months look like?").fill("Release an EP and book six profitable regional shows.");
    await page.getByLabel("Band member names").fill("Alex\nMorgan");
    await page.getByLabel("Constraints").fill("Weeknight work schedules");
    await page.getByRole("button", { name: "Build my 90-day operating plan" }).click();
  }
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
  const briefPriorities = page.getByTestId("manager-brief-priorities");
  const briefReview = page.getByTestId("manager-brief-review");
  await expect(briefPriorities.getByText("Weekly operating brief", { exact: true })).toBeVisible();
  await expect(briefReview.getByRole("heading", { name: "Work connected to the operating plan" })).toBeVisible();
  await expect(briefReview.getByRole("heading", { name: "Decisions needed" })).toBeVisible();
  await expect(briefReview.getByRole("heading", { name: "Waiting on" })).toBeVisible();
  await expect(briefReview.getByRole("heading", { name: "Risks and opportunities" })).toBeVisible();
  await briefPriorities.getByRole("button", { name: "daily" }).click();
  await expect(briefPriorities.getByText("Daily operating brief", { exact: true })).toBeVisible();
  await briefPriorities.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Daily manager brief refreshed.", { exact: true })).toBeVisible();
  await briefPriorities.getByRole("button", { name: "weekly" }).click();
  await expect(briefPriorities.getByText("Weekly operating brief", { exact: true })).toBeVisible();
  await expect(page.getByTestId("manager-priority-explanation")).toContainText("Ranked first because");
  const cadenceCard = page.getByTestId("manager-cadence");
  await expect(cadenceCard.getByText("On request only", { exact: true })).toBeVisible();
  const providerPolicy = cadenceCard.getByTestId("manager-provider-context-policy");
  await expect(providerPolicy.getByText("Provider context: disabled", { exact: true })).toBeVisible();
  await expect(providerPolicy.getByText(/No Manager snapshot is sent to the model.*Restricted memory never leaves StoryBoard/)).toBeVisible();
  await cadenceCard.getByLabel("Prepare Manager briefs on schedule").check();
  await cadenceCard.getByLabel("Manager schedule timezone").fill("America/Chicago");
  await cadenceCard.getByLabel("Manager schedule hour").selectOption("9");
  await cadenceCard.getByLabel("Manager schedule audience").selectOption("owners");
  await cadenceCard.getByRole("button", { name: "Save cadence" }).click();
  await expect(cadenceCard.getByText("Manager cadence saved.", { exact: true })).toBeVisible();
  await expect(cadenceCard.getByText(/Mondays after 9:00 AM in America\/Chicago/)).toBeVisible();
  const planCard = page.getByRole("heading", { name: "90-day plan" }).locator("xpath=ancestor::div[contains(@class,'shadow-')][1]");
  await expect(planCard).toBeVisible();
  await expect(page.getByText(/\d+\/100 · At risk/i)).toBeVisible();
  await expect(planCard.getByText("Grow dependable show revenue", { exact: true })).toHaveCount(1);
  await expect(planCard.getByText("Complete the next release cycle", { exact: true })).toHaveCount(1);
  const liveGoalCard = planCard.getByText("Grow dependable show revenue", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg') and contains(@class,'border')][1]");
  await expect(liveGoalCard.getByLabel("Progress source")).toHaveValue("qualified_prospects");
  const liveGoalMeasurement = liveGoalCard.getByLabel("Progress source").locator("xpath=ancestor::div[@data-testid][1]");
  await expect(liveGoalMeasurement.getByText(/StoryBoard can verify 1/i)).toBeVisible();
  await liveGoalMeasurement.getByRole("button", { name: "Reconcile to 1" }).click();
  await expect(liveGoalMeasurement.getByText(/Recorded progress matches 1 current qualified or converted prospect/i)).toBeVisible();
  await expect(page.getByText("Finish the booking profile and define what a good-fit show means", { exact: true }).first()).toBeVisible();
  const context = page.getByTestId("manager-context");
  await expect(context.getByText(/45\/100 · Thin/i)).toBeVisible();
  await context.getByRole("button", { name: "Edit context" }).click();
  const alexContext = context.getByLabel("Responsibilities for Alex").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await context.getByLabel("Responsibilities for Alex").fill("bandleader, booking");
  await context.getByLabel("Instruments for Alex").fill("vocals, guitar");
  const alexSaved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/manager/members/") && response.ok());
  const alexContextRefreshed = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/manager/context-health") && response.ok());
  await alexContext.getByRole("button", { name: "Save" }).click();
  await Promise.all([alexSaved, alexContextRefreshed]);
  await expect(context.getByLabel("Responsibilities for Alex")).toHaveValue("bandleader, booking");
  await expect(context.getByLabel("Instruments for Alex")).toHaveValue("vocals, guitar");
  const morganContext = context.getByLabel("Responsibilities for Morgan").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await context.getByLabel("Responsibilities for Morgan").fill("production, finances");
  await context.getByLabel("Instruments for Morgan").fill("drums");
  const morganSaved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/manager/members/") && response.ok());
  const morganContextRefreshed = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/manager/context-health") && response.ok());
  await morganContext.getByRole("button", { name: "Save" }).click();
  await Promise.all([morganSaved, morganContextRefreshed]);
  await expect(context.getByLabel("Responsibilities for Morgan")).toHaveValue("production, finances");
  await expect(context.getByLabel("Instruments for Morgan")).toHaveValue("drums");
  await context.getByLabel("Current revenue sources (one per line)").fill("Private events\nTicketed shows");
  await context.getByLabel("Usable assets (one per line)").fill("Finished EP masters\nLive performance video");
  await context.getByRole("spinbutton").fill("500");
  await context.getByLabel("Business or payment name").fill("E2E Band LLC");
  const profileSaved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/manager/profile") && response.ok());
  const profileContextRefreshed = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/manager/context-health") && response.ok());
  await context.getByRole("button", { name: "Save operating profile" }).click();
  await Promise.all([profileSaved, profileContextRefreshed]);
  await expect(context.getByText(/75\/100 · Usable/i)).toBeVisible();
  await page.getByRole("button", { name: "Fill missing steps" }).click();
  await expect(planCard.getByText("Grow dependable show revenue", { exact: true })).toHaveCount(1);
});

test("manager conversations retain context and guide team ownership", async ({ page }) => {
  await ensureManagerFoundation(page);
  await page.goto("/manager");
  const newConversation = page.getByRole("button", { name: "New", exact: true });
  if (await newConversation.isVisible().catch(() => false)) await newConversation.click();
  const managerMessage = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  const evidenceCard = page.getByTestId("manager-evidence-health");
  await expect(evidenceCard.getByRole("heading", { name: "What the Manager can trust right now" })).toBeVisible();
  await expect(evidenceCard).toContainText("Deals and money");
  await expect(evidenceCard).toContainText("Missing");
  await managerMessage.fill("How sure are you, and what records are missing?");
  await page.getByRole("button", { name: "Send message" }).click();
  const evidenceReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "operating coverage" }).last();
  await expect(evidenceReply).toContainText(/not a rating of the band/i);
  await expect(evidenceReply).toContainText(/Check these first:/i);
  const conversationHistory = page.getByLabel("Manager conversation history");
  await expect(conversationHistory).toBeVisible();
  const firstConversationId = await conversationHistory.inputValue();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(conversationHistory).toHaveValue("__new__");
  await managerMessage.fill("What needs my attention today?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(conversationHistory).not.toHaveValue("__new__");
  const secondConversationId = await conversationHistory.inputValue();
  expect(secondConversationId).not.toBe(firstConversationId);
  const conversationMessages = page.getByTestId("manager-conversation-messages");
  await conversationHistory.selectOption(firstConversationId);
  await expect(conversationMessages.getByText("How sure are you, and what records are missing?", { exact: true })).toBeVisible();
  await expect(conversationMessages.getByText("What needs my attention today?", { exact: true })).toHaveCount(0);
  await conversationHistory.selectOption(secondConversationId);
  await expect(conversationMessages.getByText("What needs my attention today?", { exact: true })).toBeVisible();
  await expect(conversationMessages.getByText("How sure are you, and what records are missing?", { exact: true })).toHaveCount(0);
  const checkIns = page.getByTestId("manager-capacity-check-ins");
  await expect(checkIns.getByRole("heading", { name: "Who has room for work right now?" })).toBeVisible();
  await checkIns.getByLabel("Capacity for Alex").selectOption("available");
  const alexCheckInSaved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/members/") && response.url().endsWith("/check-ins") && response.ok());
  await checkIns.getByRole("button", { name: "Save check-in" }).first().click();
  await alexCheckInSaved;
  await expect(page.getByText("Alex's capacity check-in was saved.", { exact: true })).toBeVisible();
  await checkIns.getByLabel("Capacity for Morgan").selectOption("limited");
  const morganCheckInSaved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/members/") && response.url().endsWith("/check-ins") && response.ok());
  await checkIns.getByRole("button", { name: "Save check-in" }).nth(1).click();
  await morganCheckInSaved;
  await expect(page.getByText("Morgan's capacity check-in was saved.", { exact: true })).toBeVisible();
  const teamLoad = page.getByTestId("manager-team-load");
  await expect(teamLoad.getByRole("heading", { name: "Team workload" })).toBeVisible();
  await expect(teamLoad).toContainText(/recorded tasks plus voluntary capacity check-ins/i);
  await expect(teamLoad).toContainText(/available/i);
  await managerMessage.fill("Who should own the unassigned work?");
  await page.getByRole("button", { name: "Send message" }).click();
  const assignmentProposal = page.getByText("Suggested task owner", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(assignmentProposal).toContainText(/role match/i);
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: /current voluntary check-ins/i }).last()).toBeVisible();
  await managerMessage.fill("Why that?");
  await page.getByRole("button", { name: "Send message" }).click();
  const continuityReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "I recommended" }).last();
  await expect(continuityReply).toContainText(/role match/i);
  await expect(page.getByText("Suggested task owner", { exact: true })).toHaveCount(1);
  await assignmentProposal.getByRole("button", { name: "Assign task" }).click();
  await expectManagerActionReceipt(assignmentProposal, "in_motion");
  const coachingPrompts = page.getByTestId("manager-coaching-prompts");
  await expect(coachingPrompts.getByRole("button", { name: "How does a show settlement work?" })).toBeVisible();
  await coachingPrompts.getByRole("button", { name: "How does a show settlement work?" }).click();
  await expect(managerMessage).toHaveValue("How does a show settlement work?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "A settlement is the post-show money check" })).toContainText(/In StoryBoard:/);
});

test("manager feedback and reviewed memory feed the release gate", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await ensureManagerFoundation(page);
  await page.goto("/manager");
  const context = page.getByTestId("manager-context");
  const managerMessage = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  const conversationMessages = page.getByTestId("manager-conversation-messages");
  const planCard = page.getByRole("heading", { name: "90-day plan" }).locator("xpath=ancestor::div[contains(@class,'shadow-')][1]");
  await managerMessage.fill("What do you still need to know about our band?");
  await page.getByRole("button", { name: "Send message" }).click();
  const contextQuestionReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "Context coverage is 75/100" }).last();
  await expect(contextQuestionReply).toContainText(/not the band's quality or potential/i);
  await expect(contextQuestionReply).toContainText(/How far ahead should members respond to shows, rehearsals, and travel/i);
  await managerMessage.fill("Members should respond within 48 hours and protect two weekends each month.");
  await page.getByRole("button", { name: "Send message" }).click();
  const contextProposal = page.getByText("Suggested band context", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(contextProposal).toContainText(/availability expectations: Members should respond within 48 hours/i);
  const contextSaved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/accept") && response.ok());
  await contextProposal.getByRole("button", { name: "Save context" }).click();
  await contextSaved;
  await expectManagerActionReceipt(contextProposal, "completed");
  await expect(context.getByText(/82\/100 · Strong/i)).toBeVisible();
  await managerMessage.fill("Explain our next priority in plain language.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Explain our next priority in plain language.", { exact: true })).toBeVisible();
  const plainLanguageReply = conversationMessages
    .getByText("Explain our next priority in plain language.", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]/following-sibling::div[1]");
  await expect(plainLanguageReply).toBeVisible();
  await managerMessage.fill("That answer was helpful because it explained the next step.");
  const naturalFeedbackSaved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/manager/chat") && response.ok());
  await page.getByRole("button", { name: "Send message" }).click();
  await naturalFeedbackSaved;
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "I marked that answer as helpful" }).last()).toContainText(/does not mark any task or real-world result complete/i);
  await expect(plainLanguageReply.getByText("Saved", { exact: true })).toBeVisible();
  await plainLanguageReply.getByRole("button", { name: "Add answer to evals", exact: true }).click();
  await expect(plainLanguageReply.getByText("answer in eval set", { exact: true })).toBeVisible();
  const responseReview = page.getByTestId("manager-response-review");
  await expect(responseReview.getByText("Review a recent Manager answer", { exact: true })).toBeVisible();
  await expect(responseReview).toContainText(/unrated/);
  const reviewedQuestion = await responseReview.getByText(/You asked:/).textContent();
  const reviewSaved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/messages/") && response.url().endsWith("/feedback") && response.ok());
  await responseReview.getByRole("button", { name: "Helpful", exact: true }).click();
  await reviewSaved;
  await expect(responseReview.getByText(/You asked:/)).not.toHaveText(reviewedQuestion ?? "");
  const responseEvalReview = page.getByTestId("manager-response-eval-review");
  await expect(responseEvalReview.getByText("Add reviewed answers to release checks", { exact: true })).toBeVisible();
  await expect(responseEvalReview).toContainText(reviewedQuestion ?? "You asked:");
  const evalPromoted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/messages/") && response.url().endsWith("/promote-eval") && response.ok());
  await responseEvalReview.getByRole("button", { name: "Add helpful answer to evals" }).click();
  await evalPromoted;
  await expect(responseEvalReview).toContainText("No rated answers are waiting for evaluation review.");
  const recommendationEvalReview = page.getByTestId("manager-recommendation-eval-review");
  await expect(recommendationEvalReview.getByText("Review a Manager outcome", { exact: true })).toBeVisible();
  await expect(recommendationEvalReview).toContainText(/Save availability expectations|Assign .* to Alex/i);
  const reviewedRecommendationTitle = await recommendationEvalReview.locator("p.font-semibold").textContent();
  const recommendationPromoted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/promote-eval") && response.ok());
  await recommendationEvalReview.getByRole("button", { name: "Keep as useful" }).click();
  await recommendationPromoted;
  if (reviewedRecommendationTitle) await expect(recommendationEvalReview).not.toContainText(reviewedRecommendationTitle);
  await expect(page.getByText("Advice reviewed", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("1");
  const dismissedTaskTitle = `Skip this E2E task ${suffix}`;
  await managerMessage.fill(`Add a task to ${dismissedTaskTitle}`);
  await page.getByRole("button", { name: "Send message" }).click();
  const dismissedProposal = page.getByText("Suggested shared task", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(dismissedProposal).toContainText(dismissedTaskTitle);
  const dismissed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/dismiss") && response.ok());
  await dismissedProposal.getByRole("button", { name: "Not useful" }).click();
  await dismissed;
  await expect(dismissedProposal.getByText("Dismissed", { exact: true })).toBeVisible();
  await expect(dismissedProposal.getByTestId("manager-action-outcome")).toHaveAttribute("data-tone", "neutral");
  await dismissedProposal.getByRole("button", { name: "Add to eval set" }).click();
  await expect(dismissedProposal.getByText("in eval set", { exact: true })).toBeVisible();
  await managerMessage.fill("Where does our money stand?");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Where does our money stand?", { exact: true })).toBeVisible();
  const moneyReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: /books currently show/i }).last().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  await expect(moneyReply).toBeVisible();
  await moneyReply.getByRole("button", { name: "Needs work", exact: true }).click();
  await moneyReply.getByLabel("What should improve?").selectOption("too_vague");
  await moneyReply.getByLabel("Correction (optional)").fill("Lead with the current balance and one next step.");
  await moneyReply.getByRole("button", { name: "Save feedback" }).click();
  await expect(moneyReply.getByText("Saved", { exact: true })).toBeVisible();
  await managerMessage.fill("Are we on track with the 90-day plan?");
  await page.getByRole("button", { name: "Send message" }).click();
  const planReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "plan-health score is" });
  await expect(planReply).toBeVisible();
  await expect(planReply).toContainText(/real owner/i);
  const adaptationProbeTitle = `Review the E2E Manager answer ${suffix}`;
  await managerMessage.fill(`Add a task to ${adaptationProbeTitle}`);
  await page.getByRole("button", { name: "Send message" }).click();
  const adaptedTaskReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "I can add that to the shared band task board" }).last();
  await expect(adaptedTaskReply).toContainText(/Next: Review the task and add it without a due date/i);
  const releaseGoalCard = planCard.getByText("Complete the next release cycle", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg') and contains(@class,'border')][1]");
  const targetDirection = releaseGoalCard.getByLabel("Target means");
  await targetDirection.selectOption("at_most");
  await expect(page.getByText("Goal target meaning updated. Manager advice now uses this direction everywhere.", { exact: true })).toBeVisible();
  await expect(page.getByText(/final result is not known before the deadline/i).first()).toBeVisible();
  await managerMessage.fill("Are we on track with Complete the next release cycle?");
  await page.getByRole("button", { name: "Send message" }).click();
  const targetReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "not elapsed-time pace or probability" }).last();
  await expect(targetReply).toContainText(/final result is not known before the deadline/i);
  await managerMessage.fill("Remember that Morgan handles production advances");
  await page.getByRole("button", { name: "Send message" }).click();
  const memoryProposal = page.getByText("Suggested band memory", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(memoryProposal.getByTestId("manager-memory-preview")).toHaveText("Morgan handles production advances");
  await memoryProposal.getByRole("button", { name: "Remember this" }).click();
  await expectManagerActionReceipt(memoryProposal, "completed");
  await page.reload();
  await expect(page.getByText(/plan-health score is/i).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What your manager remembers" })).toBeVisible();
  await expect(page.getByText("Morgan handles production advances", { exact: true }).last()).toBeVisible();
  await expect(page.getByTestId("manager-knowledge-health")).toContainText(/healthy/i);
  await expect(page.getByText("Profile source", { exact: true }).first()).toBeVisible();
  const correctAmbition = page.getByRole("button", { name: "Correct Twelve month ambition" });
  if (await correctAmbition.isVisible().catch(() => false)) {
    const correctedAmbition = `Release an EP before the regional run ${suffix}`;
    await correctAmbition.click();
    await page.getByLabel("Correct Twelve month ambition").fill(correctedAmbition);
    await page.getByRole("button", { name: "Save Twelve month ambition" }).click();
    await expect(page.getByText(correctedAmbition, { exact: true })).toBeVisible();
  }
  const updateProgress = page.getByRole("button", { name: "Update progress" }).first();
  if (await updateProgress.isVisible().catch(() => false)) {
    await updateProgress.click();
    await page.getByLabel("Current value").fill("1");
    await page.getByLabel("What changed? (optional)").fill(`E2E progress ${suffix}`);
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByText(/plan-health score|active goal|needs attention|on track/i).first()).toBeVisible();
  }
  const runChecks = page.getByRole("button", { name: "Run checks" });
  if (await runChecks.isVisible().catch(() => false)) {
    await runChecks.click();
    await expect(page.getByText("manager_os_v33", { exact: true })).toBeVisible();
    await expect(page.getByText("passed", { exact: true })).toBeVisible();
  }

});

test("manager decisions and dependencies stay connected to the operating plan", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await ensureManagerFoundation(page);
  await page.goto("/manager");
  const managerMessage = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");

  const decisionTitle = `Choose E2E market ${suffix}`;
  await managerMessage.fill("Should we book Milwaukee or Detroit?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Suggested open decision", { exact: true })).toBeVisible();
  await expect(page.getByText(/tradeoffs are still unknown/i)).toBeVisible();
  await page.getByRole("button", { name: "Add decision draft" }).click();
  const draftCard = page.getByRole("heading", { name: "Should we book Milwaukee or Detroit" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(draftCard.getByText("needs framing", { exact: true })).toBeVisible();
  await draftCard.getByLabel("Decision framing title").fill(decisionTitle);
  await draftCard.getByLabel("Decision framing context").fill("The band has one open travel weekend.");
  await draftCard.getByLabel("Framing option 1", { exact: true }).fill("Milwaukee");
  await draftCard.getByLabel("Framing option 1 tradeoff").fill("Lower travel cost and a smaller venue list.");
  await draftCard.getByLabel("Framing option 2", { exact: true }).fill("Detroit");
  await draftCard.getByLabel("Framing option 2 tradeoff").fill("Higher travel cost and a stronger genre fit.");
  await draftCard.getByRole("button", { name: "Save framing" }).click();
  const decisionCard = page.getByRole("heading", { name: decisionTitle }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(decisionCard).toBeVisible();
  await decisionCard.getByRole("radio", { name: /Milwaukee/ }).check();
  await decisionCard.getByLabel("Why this choice?").fill("It fits the lineup's work schedules.");
  await decisionCard.getByLabel("What result do you expect?").fill("Draw 75 people and earn a return invitation.");
  await decisionCard.getByLabel("Check the result on").fill("2026-07-01");
  await decisionCard.getByRole("button", { name: "Record the choice" }).click();
  await expect(decisionCard.getByText("review due", { exact: true })).toBeVisible();
  await decisionCard.getByRole("button", { name: "Review the result" }).click();
  await decisionCard.getByLabel("What was the result?").selectOption("mixed");
  await decisionCard.getByLabel("What actually happened, and what should the band carry forward?").fill("Attendance reached 80, but the return invitation is still unknown.");
  await decisionCard.getByRole("button", { name: "Save the lesson" }).click();
  await expect(page.getByText("Recently reviewed", { exact: true })).toBeVisible();
  await expect(page.getByText("Attendance reached 80, but the return invitation is still unknown.", { exact: false })).toBeVisible();
  await managerMessage.fill("What did we learn from that decision?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "recorded result is mixed" })).toContainText("Attendance reached 80");

  await page.goto("/tasks");
  const downstreamTaskTitle = "Choose one target market and qualify real prospects";
  const prerequisiteTaskTitle = "Finish the booking profile and define what a good-fit show means";
  await page.getByLabel(`Prerequisite for ${downstreamTaskTitle}`).selectOption({ label: prerequisiteTaskTitle });
  const downstreamTaskRow = page.getByLabel(`Prerequisite for ${downstreamTaskTitle}`).locator("xpath=ancestor::tr");
  await downstreamTaskRow.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: `Remove prerequisite ${prerequisiteTaskTitle} from ${downstreamTaskTitle}` })).toBeVisible();
  const firstPlanOwner = page.getByLabel("Owner for Finish the booking profile and define what a good-fit show means");
  const firstPlanTaskRow = firstPlanOwner.locator("xpath=ancestor::tr");
  await firstPlanOwner.selectOption({ label: "Alex" });
  await firstPlanTaskRow.getByLabel("Status for Finish the booking profile and define what a good-fit show means").selectOption("blocked");
  await firstPlanTaskRow.getByLabel("Waiting on for Finish the booking profile and define what a good-fit show means").fill("Bandleader");
  await firstPlanTaskRow.getByLabel("Blocker for Finish the booking profile and define what a good-fit show means").fill("The band has not agreed on the target room size.");
  const deferredDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await firstPlanTaskRow.getByLabel("Due date for Finish the booking profile and define what a good-fit show means").fill(deferredDate);
  await firstPlanTaskRow.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Owner for Finish the booking profile and define what a good-fit show means").locator("option:checked")).toHaveText("Alex");
  await expect(page.getByRole("heading", { name: "Blocked", exact: true })).toBeVisible();
  await expect(page.getByLabel("Blocker for Finish the booking profile and define what a good-fit show means")).toHaveValue("The band has not agreed on the target room size.");

  await page.goto("/manager");
  const goalPath = page.getByTestId("manager-goal-path");
  await expect(goalPath.getByRole("heading", { name: "Goals connected to real work" })).toBeVisible();
  await expect(goalPath).toContainText(/linked goal task|ready prerequisite|next:/i);
  const workSequence = page.getByTestId("manager-work-sequence");
  await expect(workSequence.getByRole("heading", { name: "What can move now" })).toBeVisible();
  await expect(workSequence).toContainText(downstreamTaskTitle);
  await expect(workSequence).toContainText(/waiting for.*Finish the booking profile/i);
  const followThrough = page.getByTestId("manager-commitments");
  await expect(followThrough.getByText(/open commitment.*intervention now/i)).toBeVisible();
  await expect(followThrough.getByText("The band has not agreed on the target room size.", { exact: false }).first()).toBeVisible();
  const blockedQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await blockedQuestion.fill("What is blocked or slipping?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "target room size" })).toContainText("Bandleader");
  await blockedQuestion.fill("What can we do now, and what is waiting on another task?");
  await page.getByRole("button", { name: "Send message" }).click();
  const sequenceReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "Ready now:" }).last();
  await expect(sequenceReply).toContainText("Waiting:");
  await expect(sequenceReply).toContainText(downstreamTaskTitle);
  await blockedQuestion.fill("What is the next move for our goal?");
  await page.getByRole("button", { name: "Send message" }).click();
  const goalPathReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: /goal path|active goal path/i }).last();
  await expect(goalPathReply).toContainText(/does not estimate effort, conversion, duration, or private capacity/i);
});

test("manager-created gigs become practical day-of workspaces", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await ensureManagerFoundation(page);
  await page.goto("/manager");
  const blockedQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  const eventTitle = `E2E rehearsal ${suffix}`;
  await blockedQuestion.fill(`Record a confirmed gig called "${eventTitle}" on 2026-09-15 at 7:00 PM at "E2E Working Room"`);
  await page.getByRole("button", { name: "Send message" }).click();
  const eventProposal = page.getByText("Suggested band event", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(eventProposal).toContainText(`Event: ${eventTitle}`);
  await expect(eventProposal).toContainText("Status: confirmed");
  await expect(eventProposal).toContainText("2 active members will start as unknown");
  await expect(eventProposal).toContainText("does not contact anyone or add an external calendar event");
  const eventCreated = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/accept") && response.ok());
  await eventProposal.getByRole("button", { name: "Create event" }).click();
  await eventCreated;
  await expectManagerActionReceipt(eventProposal, "in_motion");
  await expect(page.getByText("Event and availability list created.", { exact: true })).toBeVisible();
  await blockedQuestion.fill(`Mark Morgan available for "${eventTitle}"`);
  await page.getByRole("button", { name: "Send message" }).click();
  const availabilityProposal = page.getByText("Suggested availability update", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(availabilityProposal).toContainText(`Event: ${eventTitle}`);
  await expect(availabilityProposal).toContainText("Member: Morgan");
  await expect(availabilityProposal).toContainText("Unknown → Available");
  await expect(availabilityProposal).toContainText("does not notify the member or save a private explanation");
  const availabilityUpdated = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/accept") && response.ok());
  await availabilityProposal.getByRole("button", { name: "Update availability" }).click();
  await availabilityUpdated;
  await expectManagerActionReceipt(availabilityProposal, "in_motion");
  await expect(page.getByText("Member availability updated.", { exact: true })).toBeVisible();

  await page.goto("/operations");
  const eventStart = new Date("2026-09-16T00:00:00.000Z");
  const localTime = (date: Date) => dateTimeLocalInZone(date, "America/Chicago");
  const localEventStart = localTime(eventStart);
  await expect(page.getByText(eventTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(/not show-ready yet/i)).toBeVisible();
  await expect(page.getByText(/confidence/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Generate advance checklist" }).click();
  await expect(page.getByRole("button", { name: "Generate advance checklist" })).toHaveCount(0);
  await page.getByText("Manage readiness details", { exact: true }).click();
  await page.getByLabel(`Availability for Alex at E2E rehearsal ${suffix}`).selectOption("available");
  await expect(page.getByLabel(`Availability for Alex at E2E rehearsal ${suffix}`)).toHaveValue("available");
  await expect(page.getByLabel(`Availability for Morgan at E2E rehearsal ${suffix}`)).toHaveValue("available");
  await page.getByLabel(`Location name for E2E rehearsal ${suffix}`).fill("E2E Working Room");
  await page.getByLabel(`Load-in for E2E rehearsal ${suffix}`).fill(localTime(new Date(eventStart.getTime() - 3 * 3600000)));
  await page.getByLabel(`Soundcheck for E2E rehearsal ${suffix}`).fill(localTime(new Date(eventStart.getTime() - 2 * 3600000)));
  await page.getByLabel(`Doors for E2E rehearsal ${suffix}`).fill(localTime(new Date(eventStart.getTime() - 1 * 3600000)));
  await page.getByLabel(`Set time for E2E rehearsal ${suffix}`).fill(localEventStart);
  await page.getByLabel(`Curfew for E2E rehearsal ${suffix}`).fill(localTime(new Date(eventStart.getTime() + 2 * 3600000)));
  await page.getByLabel(`Guarantee for E2E rehearsal ${suffix}`).fill("500");
  await page.getByLabel(`Deposit for E2E rehearsal ${suffix}`).fill("100");
  await page.getByLabel(`Production notes for E2E rehearsal ${suffix}`).fill("House PA, four vocal microphones, and shared backline.");
  await page.getByRole("button", { name: "Save event details" }).click();
  await expect(page.getByText(/E2E Working Room/)).toBeVisible();
  await expect(page.getByText("Availability: 2/2 active members available", { exact: true })).toBeVisible();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open day-of view" }).click();
  await expect(page.getByRole("heading", { name: "Run of show" })).toBeVisible();
  await expect(page.getByText(/Next checkpoint: Load-in/i)).toBeVisible();
  await page.getByRole("button", { name: "Add checkpoint" }).click();
  await page.getByLabel("Checkpoint title").fill(`Band meal ${suffix}`);
  await page.getByLabel("Location (optional)").fill("Green room");
  await page.getByLabel("Checkpoint starts").fill(localTime(new Date(eventStart.getTime() - 2.5 * 3600000)));
  await page.getByLabel("Checkpoint ends (optional)").fill(localTime(new Date(eventStart.getTime() - 2.25 * 3600000)));
  await page.getByLabel("Checkpoint notes (optional)").fill("Confirm dietary order with the venue.");
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  const checkpointEditor = page.getByTestId("run-of-show-editor");
  await expect(checkpointEditor.getByText(`Band meal ${suffix}`, { exact: true })).toBeVisible();
  await checkpointEditor.getByRole("button", { name: `Edit Band meal ${suffix}` }).click();
  await checkpointEditor.getByLabel(`Location for Band meal ${suffix}`).fill("Artist lounge");
  await checkpointEditor.getByRole("button", { name: "Save changes" }).click();
  await expect(checkpointEditor.getByText(/Artist lounge/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("run-of-show-editor").getByText(`Band meal ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByTestId("run-of-show-editor").getByText(/Artist lounge/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lineup and assignments" })).toBeVisible();
  await expect(page.getByText("4 open · 0 overdue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).first().click();
  await expect(page.getByText("3 open · 0 overdue", { exact: true })).toBeVisible();

  await page.goto("/manager");
  const showQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await showQuestion.fill("Are we ready for our next show?");
  await page.getByRole("button", { name: "Send message" }).click();
  const liveCalendarAnswer = page.getByTestId("manager-conversation-messages").locator("p.whitespace-pre-wrap").filter({ hasText: "Here is the live calendar I would manage first:" });
  await expect(liveCalendarAnswer).toContainText(`E2E rehearsal ${suffix}`);
  await expect(liveCalendarAnswer).toContainText(/\d+\/100/);
});

test("manager-created release projects stay grounded in operations", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await ensureManagerFoundation(page);
  await page.goto("/manager");
  const showQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  const projectDue = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  await showQuestion.fill(`Create a release project called "E2E release ${suffix}" due ${projectDue}`);
  await page.getByRole("button", { name: "Send message" }).click();
  const projectProposal = page.getByText("Suggested band project", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(projectProposal).toContainText(`Project: E2E release ${suffix}`);
  await expect(projectProposal).toContainText("Milestones (6)");
  const projectCreated = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/accept") && response.ok());
  await projectProposal.getByRole("button", { name: "Create project and plan" }).click();
  await projectCreated;
  await expectManagerActionReceipt(projectProposal, "in_motion");
  await expect(page.getByText("Project and milestone plan created.", { exact: true })).toBeVisible();

  await page.goto("/operations");
  await page.getByRole("tab", { name: "Music & setlists" }).click();
  await page.getByPlaceholder("Song title").fill(`E2E song ${suffix}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-testid^="song-"]').filter({ hasText: `E2E song ${suffix}` })).toBeVisible();
  await page.getByRole("tab", { name: "Projects" }).click();
  await expect(page.getByText(`E2E release ${suffix}`, { exact: true })).toBeVisible();
  const openProject = page.getByRole("link", { name: "Open project" });
  await openProject.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await openProject.click();
  await expect(page.getByRole("heading", { name: "Milestone plan", exact: true })).toBeVisible();
  await expect(page.getByText(/0\/6 milestones complete/)).toBeVisible();
  const firstReleaseMilestone = "Lock the release goal, audience, and story";
  await page.getByLabel(`Owner for project milestone ${firstReleaseMilestone}`).selectOption({ label: "Alex" });
  await page.getByLabel(`Status for project milestone ${firstReleaseMilestone}`).selectOption("done");
  await expect(page.getByText(/1\/6 milestones complete/)).toBeVisible();
  await page.getByLabel("Project budget").fill("750");
  await page.getByLabel("Project success metrics").fill("100 first-week saves\n25 mailing-list signups");
  await page.getByLabel("Project description").fill("Release the finished EP with a focused regional campaign.");
  await page.getByRole("button", { name: "Save project facts" }).click();
  await page.getByLabel("Asset label").fill("Working folder");
  await page.getByLabel("Asset URL").fill("https://example.test/e2e-release");
  await page.getByRole("button", { name: "Add asset" }).click();
  await expect(page.getByRole("link", { name: "Working folder" })).toBeVisible();

  await page.goto("/manager");
  const releaseQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await releaseQuestion.fill("How is our release project going?");
  await page.getByRole("button", { name: "Send message" }).click();
  const projectAnswer = page.getByTestId("manager-conversation-messages").locator("p.whitespace-pre-wrap").filter({ hasText: "Here is the recorded project picture:" });
  await expect(projectAnswer).toContainText(`E2E release ${suffix}`);
  await expect(projectAnswer).toContainText(/\d+\/100/);
});

test("show finance records produce grounded outcome answers", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const eventTitle = `E2E finance show ${suffix}`;
  const localTime = (date: Date) => dateTimeLocalInZone(date, "America/Chicago");
  const { artistId } = await ensureManagerFoundation(page);
  const financeEvent = await artistApi<{ id: string }>(page, artistId, "/events", "POST", {
    type: "gig",
    status: "confirmed",
    title: eventTitle,
    startsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    timezone: "America/Chicago",
    locationName: "E2E Working Room"
  });
  await page.goto("/operations");
  await page.getByRole("tab", { name: "Deals" }).click();
  await page.getByPlaceholder("Show or deal").fill(`E2E offer ${suffix}`);
  await page.getByPlaceholder("Buyer name").fill("E2E Buyer");
  await page.getByPlaceholder("Buyer email").fill(`buyer-${suffix}@example.test`);
  await page.getByPlaceholder("Offer amount (USD)").fill("500");
  await page.getByRole("button", { name: "Record offer" }).click();
  await expect(page.getByText(`E2E offer ${suffix}`, { exact: true }).first()).toBeVisible();

  const currentDeal = page.getByText(`E2E offer ${suffix}`, { exact: true }).first().locator("..").locator("..").locator("..");
  const generateAgreement = currentDeal.getByRole("button", { name: "Generate agreement PDF" });
  if (await generateAgreement.isDisabled()) {
    await page.getByPlaceholder("Template name").fill(`E2E agreement ${suffix}`);
    await page.getByRole("button", { name: "Create reviewed version" }).click();
    await page.getByRole("button", { name: "Activate" }).last().click();
  }
  await generateAgreement.click();
  await expect(currentDeal.getByText(/agreement v1/i)).toBeVisible();

  const invoiceForm = page.getByLabel("Invoice deal").locator("..");
  await page.getByLabel("Invoice deal").selectOption({ label: `E2E offer ${suffix}` });
  await invoiceForm.getByPlaceholder("Invoice number").fill(`E2E-${suffix}`);
  await invoiceForm.getByPlaceholder("Recipient").fill("E2E Buyer");
  await invoiceForm.getByPlaceholder("Amount (USD)").fill("500");
  await invoiceForm.getByRole("button", { name: "Create invoice" }).click();
  await page.getByPlaceholder("Payment").last().fill("100");
  await page.getByRole("button", { name: "Record", exact: true }).last().click();
  await expect(page.getByText("Balance USD 400.00")).toBeVisible();

  const expenseForm = page.getByLabel("Expense event or project").locator("..");
  await page.getByLabel("Expense event or project").selectOption({ label: eventTitle });
  await expenseForm.getByPlaceholder("Expense description").fill("Fuel");
  await expenseForm.getByPlaceholder("Amount (USD)").fill("25");
  await expenseForm.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByText(/^Fuel/).first()).toBeVisible();
  await page.getByLabel("Settlement event").selectOption({ label: eventTitle });
  await page.getByPlaceholder("Gross USD").fill("500");
  await page.getByRole("button", { name: "Calculate" }).click();
  await page.getByRole("button", { name: "Finalize PDF" }).last().click();
  await expect(page.getByText("finalized", { exact: true }).last()).toBeVisible();

  await page.getByRole("tab", { name: "Events" }).click();
  const completedShow = page.locator("article").filter({ hasText: eventTitle });
  await completedShow.getByText("Manage readiness details", { exact: true }).click();
  const completedSetAt = new Date(Date.now() - 2 * 3600000);
  await page.getByLabel(`Event start for ${eventTitle}`).fill(localTime(completedSetAt));
  await page.getByLabel(`Load-in for ${eventTitle}`).fill(localTime(new Date(completedSetAt.getTime() - 3 * 3600000)));
  await page.getByLabel(`Soundcheck for ${eventTitle}`).fill(localTime(new Date(completedSetAt.getTime() - 2 * 3600000)));
  await page.getByLabel(`Doors for ${eventTitle}`).fill(localTime(new Date(completedSetAt.getTime() - 3600000)));
  await page.getByLabel(`Set time for ${eventTitle}`).fill(localTime(completedSetAt));
  await page.getByLabel(`Curfew for ${eventTitle}`).fill(localTime(new Date(completedSetAt.getTime() + 3600000)));
  await page.getByLabel(`Status for ${eventTitle}`).selectOption("completed");
  await page.getByLabel(`Attendance for ${eventTitle}`).fill("135");
  await page.getByLabel(`Gross revenue for ${eventTitle}`).fill("500");
  await page.getByLabel(`Post-show notes for ${eventTitle}`).fill("Strong audience response; tighten the changeover next time.");
  await page.getByLabel(`Relationship outcome for ${eventTitle}`).fill("Buyer invited a return pitch.");
  const eventSaved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/events/${financeEvent.id}`) && response.ok());
  await completedShow.getByRole("button", { name: "Save event details" }).click();
  const savedEvent = await (await eventSaved).json() as { attendance: number | null; grossRevenueMinor: number | null; status: string };
  expect(savedEvent).toMatchObject({ attendance: 135, grossRevenueMinor: 50_000, status: "completed" });
  await expect(completedShow.locator("span").filter({ hasText: /^completed$/ })).toBeVisible();

  await page.goto("/manager");
  const outcomes = page.getByTestId("manager-outcome-review");
  await expect(outcomes.getByRole("heading", { name: "Recent outcomes" })).toBeVisible();
  await expect(outcomes.getByText("135", { exact: true })).toBeVisible();
  await expect(outcomes.getByText(/Finalized net \$475\.00/)).toBeVisible();
  const outcomeQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await outcomeQuestion.fill(`What is the balance on Invoice E2E-${suffix}?`);
  await page.getByRole("button", { name: "Send message" }).click();
  const invoiceReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: `Invoice E2E-${suffix} is` }).last();
  await expect(invoiceReply).toContainText(/remaining balance is USD 400\.00/);
  await expect(invoiceReply).not.toContainText(/An invoice is a request for payment/);
  await outcomeQuestion.fill("What did we learn from our recent shows?");
  await page.getByRole("button", { name: "Send message" }).click();
  const outcomeReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "Recorded attendance totals 135" });
  await expect(outcomeReply).toContainText(/finalized net USD 475\.00/);
});

test("manager task proposals remain idempotent, assignable, and reviewable", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await ensureManagerFoundation(page, true);
  await page.goto("/manager");
  const outcomeQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  const capturedTaskTitle = `Confirm the E2E rehearsal debrief ${suffix}`;
  await outcomeQuestion.fill(`Add a task to ${capturedTaskTitle} by 2099-12-31`);
  await page.getByRole("button", { name: "Send message" }).click();
  const capturedTaskProposal = page.getByText("Suggested shared task", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(capturedTaskProposal).toContainText(`Task: ${capturedTaskTitle}`);
  await expect(capturedTaskProposal).toContainText("Due: Dec 31, 2099");
  await expect(capturedTaskProposal).toContainText("Owner: Unassigned");
  await capturedTaskProposal.getByRole("button", { name: "Add task" }).click();
  const acceptedReceipt = await expectManagerActionReceipt(capturedTaskProposal, "in_motion");
  await expect(acceptedReceipt).toContainText(/Linked task ready/i);
  await expect(acceptedReceipt.getByTestId("manager-action-receipt-destination")).toHaveAttribute("href", "/tasks");
  const acceptedWork = page.getByTestId("manager-follow-through-item").filter({ hasText: capturedTaskTitle }).first();
  await expect(acceptedWork).toHaveAttribute("data-state", "in_motion");
  await expect(acceptedWork.getByTestId("manager-follow-through-destination")).toHaveAttribute("href", "/tasks");

  await page.reload();
  const reloadedTaskProposal = page.getByText("Suggested shared task", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(reloadedTaskProposal.getByRole("button", { name: "Add task" })).toHaveCount(0);
  const reloadedReceipt = await expectManagerActionReceipt(reloadedTaskProposal, "in_motion");
  await expect(reloadedReceipt).toContainText(/Linked task ready/i);
  await expect(page.getByTestId("manager-follow-through-item").filter({ hasText: capturedTaskTitle }).first()).toHaveAttribute("data-state", "in_motion");
  await outcomeQuestion.fill(`Create a task: ${capturedTaskTitle}!`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "already open" }).last()).toContainText("will not add a duplicate task");
  await outcomeQuestion.fill(`Assign "${capturedTaskTitle}" to Morgan`);
  await page.getByRole("button", { name: "Send message" }).click();
  const capturedTaskAssignment = page.getByText("Suggested task owner", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(capturedTaskAssignment).toContainText(`Task: ${capturedTaskTitle}`);
  await expect(capturedTaskAssignment).toContainText("Owner: Unassigned → Morgan");
  await expect(capturedTaskAssignment).toContainText("Availability: Limited");
  await capturedTaskAssignment.getByRole("button", { name: "Assign task" }).click();
  await expectManagerActionReceipt(capturedTaskAssignment, "in_motion");
  await outcomeQuestion.fill(`Mark "${capturedTaskTitle}" done`);
  await page.getByRole("button", { name: "Send message" }).click();
  const capturedTaskUpdate = page.getByText("Suggested task update", { exact: true }).last().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(capturedTaskUpdate).toContainText(`Task: ${capturedTaskTitle}`);
  await expect(capturedTaskUpdate).toContainText("Change: Mark done");
  await capturedTaskUpdate.getByRole("button", { name: "Update task" }).click();
  await expectManagerActionReceipt(capturedTaskUpdate, "completed");
  await page.goto("/tasks");
  const capturedTaskRow = page.getByRole("row", { name: new RegExp(capturedTaskTitle) });
  await expect(capturedTaskRow).toBeVisible();
  await expect(capturedTaskRow.getByLabel(`Due date for ${capturedTaskTitle}`)).toHaveValue("2099-12-31");
  await expect(capturedTaskRow.getByLabel(`Owner for ${capturedTaskTitle}`).locator("option:checked")).toHaveText("Morgan");
  await expect(capturedTaskRow.getByLabel(`Status for ${capturedTaskTitle}`).locator("option:checked")).toHaveText("done");
  await page.goto("/manager");
  await expect(page.getByTestId("manager-follow-through-item").filter({ hasText: capturedTaskTitle }).first()).toHaveAttribute("data-state", "completed");
});

test("confirmed event logistics move through approvals before provider execution", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const eventTitle = `E2E logistics ${suffix}`;
  const eventStart = new Date(Date.now() + 10 * 86400000);
  eventStart.setMinutes(0, 0, 0);
  const eventEnd = new Date(eventStart.getTime() + 3 * 3600000);
  const localTime = (date: Date) => dateTimeLocalInZone(date, "America/Chicago");

  await ensureManagerFoundation(page);
  await page.goto("/operations");
  await page.getByLabel("Title", { exact: true }).fill(eventTitle);
  await page.getByLabel("Starts", { exact: true }).fill(localTime(eventStart));
  await page.getByRole("button", { name: "Add event" }).click();

  let eventCard = page.locator("article").filter({ hasText: eventTitle });
  await expect(eventCard).toBeVisible();
  await eventCard.getByText("Manage readiness details", { exact: true }).click();
  await eventCard.getByLabel(`Status for ${eventTitle}`).selectOption("confirmed");
  await eventCard.getByLabel(`Event end for ${eventTitle}`).fill(localTime(eventEnd));
  await eventCard.getByLabel(`Event timezone for ${eventTitle}`).fill("America/Chicago");
  await expect(eventCard.getByRole("button", { name: /Prepare .* approval/ })).toHaveCount(0);
  const eventSaved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/events/") && response.ok());
  await eventCard.getByRole("button", { name: "Save event details" }).click();
  await eventSaved;

  eventCard = page.locator("article").filter({ hasText: eventTitle });
  if ((await eventCard.locator("details").getAttribute("open")) === null) await eventCard.getByText("Manage readiness details", { exact: true }).click();
  const logistics = eventCard.locator('[data-testid^="event-logistics-"]');
  await expect(logistics.getByText("No external Calendar event is linked yet.", { exact: true })).toBeVisible();
  await expect(logistics.getByText("No Drive folder is linked yet.", { exact: true })).toBeVisible();

  await page.goto("/manager");
  const recommendationTitle = `Prepare ${eventTitle} logistics`;
  const logisticsRecommendation = page.getByText(recommendationTitle, { exact: true }).locator("xpath=ancestor::div[contains(@class,'sm:flex-row')][1]");
  await expect(logisticsRecommendation).toContainText(/Nothing is written to Google until/i);
  const prepared = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/accept") && response.ok());
  await logisticsRecommendation.getByRole("button", { name: "Prepare approvals" }).click();
  await prepared;
  await expect(logisticsRecommendation.getByTestId("manager-recommendation-outcome")).toHaveAttribute("data-tone", "warning");
  let logisticsFollowThrough = page.getByTestId("manager-follow-through-item").filter({ hasText: recommendationTitle }).first();
  await expect(logisticsFollowThrough).toHaveAttribute("data-state", "needs_action");
  await expect(logisticsFollowThrough).toHaveAttribute("data-stage", "awaiting_approval");
  await expect(logisticsFollowThrough).toHaveAttribute("data-tone", "warning");

  await page.goto("/approvals");
  const calendarTitle = `Add ${eventTitle} to Google Calendar`;
  const driveTitle = `Create Drive folder for ${eventTitle}`;
  const pendingCard = (title: string) => page.getByRole("heading", { name: title }).locator("xpath=ancestor::*[contains(@class,'border-violet-500')][1]");
  const readyCard = (title: string) => page.getByRole("heading", { name: title }).locator("xpath=ancestor::*[contains(@class,'border-cyan-500')][1]");
  for (const title of [calendarTitle, driveTitle]) {
    const card = pendingCard(title);
    await expect(card.getByRole("link", { name: "Open event" })).toHaveAttribute("href", /\/operations\/events\//);
    const approved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/approve") && response.ok());
    await card.getByRole("button", { name: "Approve" }).click();
    await approved;
    await expect(pendingCard(title)).toHaveCount(0);
    await expect(readyCard(title)).toBeVisible();
  }

  const calendarExecuted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/execute") && response.ok());
  await readyCard(calendarTitle).getByRole("button", { name: "Execute", exact: true }).click();
  await calendarExecuted;
  await expect(readyCard(calendarTitle)).toHaveCount(0);
  const driveExecuted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/execute") && response.ok());
  await readyCard(driveTitle).getByRole("button", { name: "Execute", exact: true }).click();
  await driveExecuted;
  await expect(readyCard(driveTitle)).toHaveCount(0);

  await page.goto("/operations");
  eventCard = page.locator("article").filter({ hasText: eventTitle });
  await eventCard.getByText("Manage readiness details", { exact: true }).click();
  const completedLogistics = eventCard.locator('[data-testid^="event-logistics-"]');
  await expect(completedLogistics.getByText("simulated", { exact: true })).toHaveCount(2);
  await expect(completedLogistics.getByText(/mock execution for local testing/i)).toBeVisible();
  await expect(completedLogistics.getByText(/Event ID: mock-cal-/)).toBeVisible();
  await expect(completedLogistics.getByRole("link", { name: "Open Drive folder" })).toHaveAttribute("href", /^https:\/\/drive\.mock\/folder\//);
  await expect(completedLogistics.getByRole("button", { name: /Prepare .* approval/ })).toBeVisible();

  await page.goto("/manager");
  logisticsFollowThrough = page.getByTestId("manager-follow-through-item").filter({ hasText: recommendationTitle }).first();
  await expect(logisticsFollowThrough).toHaveAttribute("data-state", "blocked");
  await expect(logisticsFollowThrough).toHaveAttribute("data-stage", "approval_simulated");
  await expect(logisticsFollowThrough).toHaveAttribute("data-tone", "warning");
  await expect(logisticsFollowThrough).toHaveAttribute("data-can-mutate", "true");
  await expect(logisticsFollowThrough).toContainText(/not a real Calendar or Drive result/i);
  page.once("dialog", (dialog) => dialog.accept("Verified that only mock adapters ran; no external result exists."));
  const reconciled = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/manager/recommendations/") && response.url().endsWith("/complete") && response.ok());
  await logisticsFollowThrough.getByRole("button", { name: "Close after review" }).click();
  await reconciled;
  logisticsFollowThrough = page.getByTestId("manager-follow-through-item").filter({ hasText: recommendationTitle }).first();
  await expect(logisticsFollowThrough).toHaveAttribute("data-state", "completed");
  await expect(logisticsFollowThrough).toHaveAttribute("data-stage", "reconciled");
  await expect(logisticsFollowThrough).toHaveAttribute("data-tone", "neutral");
  await expect(logisticsFollowThrough).toContainText(/not evidence that a provider action ran or succeeded/i);
});

test("approved immediate-send campaigns remain executable and create follow-up work", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const prospectName = `E2E immediate buyer ${suffix}`;
  const campaignName = `E2E immediate campaign ${suffix}`;
  await signInForBrowserTest(page);
  const artistId = await activeArtistId(page);

  await artistApi(page, artistId, "/booking-profile", "PUT", {
    homeCity: "Chicago",
    homeRegion: "IL",
    homeCountry: "US",
    genres: ["rock"],
    targetCapacityMin: 100,
    targetCapacityMax: 500,
    bookingPitch: "A sharp, audience-ready live set."
  });
  const prospect = await artistApi<{ id: string }>(page, artistId, "/booking-prospects", "POST", {
    kind: "venue",
    status: "qualified",
    name: prospectName,
    city: "Chicago"
  });
  await artistApi(page, artistId, `/booking-prospects/${prospect.id}/contact`, "PUT", {
    contact: {
      fullName: "Immediate Buyer",
      email: `immediate-${suffix}@example.test`,
      role: "Talent buyer"
    }
  });
  const campaign = await artistApi<{ id: string }>(page, artistId, "/booking-campaigns", "POST", {
    name: campaignName,
    subjectTemplate: "Booking inquiry — {{artistName}}",
    bodyTemplate: "Hi {{contactName}}, {{bookingPitch}}",
    defaultFollowUpDays: 7,
    deliveryMode: "send_on_execution"
  });
  await artistApi(page, artistId, `/booking-campaigns/${campaign.id}/recipients`, "POST", {
    prospectId: prospect.id
  });
  await artistApi(page, artistId, `/booking-campaigns/${campaign.id}/prepare-approval`, "POST", {});

  await page.goto("/approvals");
  const approvalTitle = `Send 1 pitch email(s) — ${campaignName}`;
  const pendingCard = page.getByRole("heading", { name: approvalTitle }).locator("xpath=ancestor::*[contains(@class,'border-violet-500')][1]");
  await expect(pendingCard).toBeVisible();
  const approved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/approve") && response.ok());
  await pendingCard.getByRole("button", { name: "Approve" }).click();
  await approved;

  const readyCard = page.getByRole("heading", { name: approvalTitle }).locator("xpath=ancestor::*[contains(@class,'border-cyan-500')][1]");
  await expect(readyCard).toBeVisible();
  await expect(readyCard.getByText("outbound_email_send_batch", { exact: true })).toBeVisible();
  const executed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/execute") && response.ok());
  await readyCard.getByRole("button", { name: "Execute", exact: true }).click();
  await executed;
  await expect(readyCard).toHaveCount(0);

  await page.goto("/booking-campaigns");
  const campaignCard = page.getByRole("heading", { name: campaignName }).locator("xpath=ancestor::div[contains(@class,'shadow-[var(--shadow-sm)]')][1]");
  await expect(campaignCard).toContainText("sent");
  await expect(campaignCard.getByRole("button", { name: "Replied", exact: true })).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByRole("cell", { name: `Follow up with ${prospectName}`, exact: true })).toBeVisible();
});
