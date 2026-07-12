import { expect, test } from "@playwright/test";

test("manual prospect can gain a buyer and enter an approval-ready campaign", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const prospectName = `E2E Buyer Lead ${suffix}`;

  // The runner resets only the explicit test database, then seeds this owner
  // workspace so first-use flows remain deterministic across iterations.
  await page.goto("http://127.0.0.1:4000/auth/dev/login");
  await expect(page.getByText("Your operational home base")).toBeVisible();

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
  await page.getByLabel("Campaign name").fill(`Austin outreach ${suffix}`);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.getByLabel(`Prospect for Austin outreach ${suffix}`).selectOption({ label: `${prospectName} · Austin` });
  await page.getByLabel(`Add recipient to Austin outreach ${suffix}`).click();
  await expect(page.getByText("ready")).toBeVisible();
  await page.getByLabel(`Preview campaign Austin outreach ${suffix}`).click();
  await expect(page.getByText("Personalized draft preview")).toBeVisible();
  await expect(page.getByText(`morgan-${suffix}@example.test`, { exact: true })).toBeVisible();
});

test("booking advisor produces reviewable, non-automated guidance", async ({ page }) => {
  await page.goto("http://127.0.0.1:4000/auth/dev/login");
  await expect(page.getByText("Your operational home base")).toBeVisible();

  await page.goto("/advisor");
  const generate = page.getByRole("button", { name: "Generate booking brief" });
  if (await generate.isVisible().catch(() => false)) await generate.click();
  await expect(page.getByRole("heading", { name: "Current booking brief" })).toBeVisible();
  await expect(page.getByText(/never sends or changes records/i)).toBeVisible();
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
});

test("novice manager intake produces grounded work and band operations records", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("http://127.0.0.1:4000/auth/dev/login");
  await expect(page.getByText("Your operational home base")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "90-day plan" })).toBeVisible();
  await expect(page.getByText(/65\/100 · At risk/i)).toBeVisible();
  await expect(page.getByText("Grow dependable show revenue", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Complete the next release cycle", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Finish the booking profile and define what a good-fit show means", { exact: true }).first()).toBeVisible();
  const context = page.getByTestId("manager-context");
  await expect(context.getByText(/45\/100 · Thin/i)).toBeVisible();
  await context.getByRole("button", { name: "Edit context" }).click();
  const alexContext = context.getByLabel("Responsibilities for Alex").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await context.getByLabel("Responsibilities for Alex").fill("bandleader, booking");
  await context.getByLabel("Instruments for Alex").fill("vocals, guitar");
  await alexContext.getByRole("button", { name: "Save" }).click();
  await expect(alexContext.getByRole("button", { name: "Save" })).toBeEnabled();
  const morganContext = context.getByLabel("Responsibilities for Morgan").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await context.getByLabel("Responsibilities for Morgan").fill("production, finances");
  await context.getByLabel("Instruments for Morgan").fill("drums");
  await expect(morganContext.getByRole("button", { name: "Save" })).toBeEnabled();
  await morganContext.getByRole("button", { name: "Save" }).click();
  await expect(morganContext.getByRole("button", { name: "Save" })).toBeEnabled();
  await context.getByLabel("Availability expectations").fill("Respond to holds within 48 hours and protect two weekends each month.");
  await context.getByLabel("Current revenue sources (one per line)").fill("Private events\nTicketed shows");
  await context.getByLabel("Usable assets (one per line)").fill("Finished EP masters\nLive performance video");
  await context.getByRole("spinbutton").fill("500");
  await context.getByLabel("Business or payment name").fill("E2E Band LLC");
  await context.getByRole("button", { name: "Save operating profile" }).click();
  await expect(context.getByText(/82\/100 · Strong/i)).toBeVisible();
  await page.getByRole("button", { name: "Fill missing steps" }).click();
  await expect(page.getByText("Grow dependable show revenue", { exact: true })).toHaveCount(1);
  const newConversation = page.getByRole("button", { name: "New", exact: true });
  if (await newConversation.isVisible().catch(() => false)) await newConversation.click();
  const managerMessage = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await managerMessage.fill("What do you still need to know about our band?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "Context coverage is 82/100" })).toContainText(/not the band's quality or potential/i);
  await managerMessage.fill("Explain our next priority in plain language.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Explain our next priority in plain language.", { exact: true })).toBeVisible();
  await expect(page.getByText(/I would keep this simple|first move is/i)).toBeVisible();
  await page.getByRole("button", { name: "Helpful", exact: true }).last().click();
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Add answer to evals", exact: true }).last().click();
  await expect(page.getByText("answer in eval set", { exact: true }).last()).toBeVisible();
  const notUseful = page.getByRole("button", { name: "Not useful" });
  if (await notUseful.isVisible().catch(() => false)) {
    await notUseful.click();
    await expect(page.getByText("dismissed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add to eval set" }).click();
    await expect(page.getByText("in eval set", { exact: true })).toBeVisible();
  }
  await managerMessage.fill("Where does our money stand?");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Where does our money stand?", { exact: true })).toBeVisible();
  await expect(page.getByText(/books currently show/i)).toBeVisible();
  await page.getByRole("button", { name: "Needs work", exact: true }).last().click();
  await page.getByLabel("What should improve?").selectOption("too_vague");
  await page.getByLabel("Correction (optional)").fill("Lead with the current balance and one next step.");
  await page.getByRole("button", { name: "Save feedback" }).click();
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();
  await managerMessage.fill("Are we on track with the 90-day plan?");
  await page.getByRole("button", { name: "Send message" }).click();
  const planReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "plan-health score is" });
  await expect(planReply).toBeVisible();
  await expect(planReply).toContainText(/real owner/i);
  await page.reload();
  await expect(page.getByText(/plan-health score is/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What your manager remembers" })).toBeVisible();
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
    await expect(page.getByText("manager_os_v10", { exact: true })).toBeVisible();
    await expect(page.getByText("passed", { exact: true })).toBeVisible();
  }

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
  const firstPlanOwner = page.getByLabel("Owner for Finish the booking profile and define what a good-fit show means");
  const firstPlanTaskRow = firstPlanOwner.locator("xpath=ancestor::tr");
  await firstPlanOwner.selectOption("Alex");
  await firstPlanTaskRow.getByLabel("Status for Finish the booking profile and define what a good-fit show means").selectOption("blocked");
  await firstPlanTaskRow.getByLabel("Waiting on for Finish the booking profile and define what a good-fit show means").fill("Bandleader");
  await firstPlanTaskRow.getByLabel("Blocker for Finish the booking profile and define what a good-fit show means").fill("The band has not agreed on the target room size.");
  const deferredDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  await firstPlanTaskRow.getByLabel("Due date for Finish the booking profile and define what a good-fit show means").fill(deferredDate);
  await firstPlanTaskRow.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Owner for Finish the booking profile and define what a good-fit show means")).toHaveValue("Alex");
  await expect(page.getByRole("heading", { name: "Blocked", exact: true })).toBeVisible();
  await expect(page.getByLabel("Blocker for Finish the booking profile and define what a good-fit show means")).toHaveValue("The band has not agreed on the target room size.");

  await page.goto("/manager");
  const followThrough = page.getByTestId("manager-commitments");
  await expect(followThrough.getByText(/open commitment.*intervention now/i)).toBeVisible();
  await expect(followThrough.getByText("The band has not agreed on the target room size.", { exact: false }).first()).toBeVisible();
  const blockedQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await blockedQuestion.fill("What is blocked or slipping?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: "target room size" })).toContainText("Bandleader");

  await page.goto("/operations");
  await page.getByLabel("Title").fill(`E2E rehearsal ${suffix}`);
  const eventStart = new Date(Date.now() + 90 * 86400000);
  const localEventStart = new Date(eventStart.getTime() - eventStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel("Starts").fill(localEventStart);
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText(`E2E rehearsal ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/not show-ready yet/i)).toBeVisible();
  await expect(page.getByText(/confidence/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Generate advance checklist" }).click();
  await expect(page.getByRole("button", { name: "Generate advance checklist" })).toHaveCount(0);
  await page.getByText("Manage readiness details", { exact: true }).click();
  await page.getByLabel(`Availability for Alex at E2E rehearsal ${suffix}`).selectOption("available");
  await expect(page.getByLabel(`Availability for Alex at E2E rehearsal ${suffix}`)).toHaveValue("available");
  await page.getByLabel(`Availability for Morgan at E2E rehearsal ${suffix}`).selectOption("available");
  await page.getByLabel(`Location name for E2E rehearsal ${suffix}`).fill("E2E Working Room");
  const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  await expect(page.getByRole("heading", { name: "Lineup and assignments" })).toBeVisible();
  await expect(page.getByText("4 open · 0 overdue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).first().click();
  await expect(page.getByText("3 open · 0 overdue", { exact: true })).toBeVisible();

  await page.goto("/manager");
  const showQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await showQuestion.fill("Are we ready for our next show?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: `E2E rehearsal ${suffix}` })).toContainText(/\d+\/100/);

  await page.goto("/operations");
  await page.getByRole("tab", { name: "Music & setlists" }).click();
  await page.getByPlaceholder("Song title").fill(`E2E song ${suffix}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`E2E song ${suffix}`)).toBeVisible();
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.getByPlaceholder("Project name").fill(`E2E release ${suffix}`);
  const projectDue = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Project due date").fill(projectDue);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText(`E2E release ${suffix}`, { exact: true })).toBeVisible();
  await page.goto("/manager");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Build milestone plan" })).toBeVisible();
  await page.getByRole("button", { name: "Build milestone plan" }).click();
  await expect(page.getByText("Milestone plan created.", { exact: true })).toBeVisible();
  await page.goto("/operations");
  await page.getByRole("tab", { name: "Projects" }).click();
  const openProject = page.getByRole("link", { name: "Open project" });
  await openProject.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await openProject.click();
  await expect(page.getByRole("heading", { name: "Milestone plan", exact: true })).toBeVisible();
  await expect(page.getByText(/0\/6 milestones complete/)).toBeVisible();
  const firstReleaseMilestone = "Lock the release goal, audience, and story";
  await page.getByLabel(`Owner for project milestone ${firstReleaseMilestone}`).selectOption("Alex");
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
  await expect(page.locator("p.whitespace-pre-wrap").filter({ hasText: `E2E release ${suffix}` })).toContainText(/\d+\/100/);

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
  await page.getByLabel("Expense event or project").selectOption({ label: `E2E rehearsal ${suffix}` });
  await expenseForm.getByPlaceholder("Expense description").fill("Fuel");
  await expenseForm.getByPlaceholder("Amount (USD)").fill("25");
  await expenseForm.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByText(/^Fuel/).first()).toBeVisible();
  await page.getByLabel("Settlement event").selectOption({ label: `E2E rehearsal ${suffix}` });
  await page.getByPlaceholder("Gross USD").fill("500");
  await page.getByRole("button", { name: "Calculate" }).click();
  await page.getByRole("button", { name: "Finalize PDF" }).last().click();
  await expect(page.getByText("finalized", { exact: true }).last()).toBeVisible();

  await page.getByRole("tab", { name: "Events" }).click();
  const completedShow = page.locator("article").filter({ hasText: `E2E rehearsal ${suffix}` });
  await completedShow.getByText("Manage readiness details", { exact: true }).click();
  const completedSetAt = new Date(Date.now() - 2 * 3600000);
  await page.getByLabel(`Event start for E2E rehearsal ${suffix}`).fill(localTime(completedSetAt));
  await page.getByLabel(`Load-in for E2E rehearsal ${suffix}`).fill(localTime(new Date(completedSetAt.getTime() - 3 * 3600000)));
  await page.getByLabel(`Soundcheck for E2E rehearsal ${suffix}`).fill(localTime(new Date(completedSetAt.getTime() - 2 * 3600000)));
  await page.getByLabel(`Doors for E2E rehearsal ${suffix}`).fill(localTime(new Date(completedSetAt.getTime() - 3600000)));
  await page.getByLabel(`Set time for E2E rehearsal ${suffix}`).fill(localTime(completedSetAt));
  await page.getByLabel(`Curfew for E2E rehearsal ${suffix}`).fill(localTime(new Date(completedSetAt.getTime() + 3600000)));
  await page.getByLabel(`Status for E2E rehearsal ${suffix}`).selectOption("completed");
  await page.getByLabel(`Attendance for E2E rehearsal ${suffix}`).fill("135");
  await page.getByLabel(`Gross revenue for E2E rehearsal ${suffix}`).fill("500");
  await page.getByLabel(`Post-show notes for E2E rehearsal ${suffix}`).fill("Strong audience response; tighten the changeover next time.");
  await page.getByLabel(`Relationship outcome for E2E rehearsal ${suffix}`).fill("Buyer invited a return pitch.");
  await completedShow.getByRole("button", { name: "Save event details" }).click();
  await expect(completedShow.locator("span").filter({ hasText: /^completed$/ })).toBeVisible();

  await page.goto("/manager");
  const outcomes = page.getByTestId("manager-outcome-review");
  await expect(outcomes.getByRole("heading", { name: "Recent outcomes" })).toBeVisible();
  await expect(outcomes.getByText("135", { exact: true })).toBeVisible();
  await expect(outcomes.getByText(/Finalized net \$475\.00/)).toBeVisible();
  const outcomeQuestion = page.getByPlaceholder("Ask about priorities, shows, booking, money, or the band...");
  await outcomeQuestion.fill("What did we learn from our recent shows?");
  await page.getByRole("button", { name: "Send message" }).click();
  const outcomeReply = page.locator("p.whitespace-pre-wrap").filter({ hasText: "Recorded attendance totals 135" });
  await expect(outcomeReply).toContainText(/finalized net USD 475\.00/);
});
