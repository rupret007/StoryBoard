import { expect, test } from "@playwright/test";

test("manual prospect can gain a buyer and enter an approval-ready campaign", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const prospectName = `E2E Buyer Lead ${suffix}`;

  // The opt-in test database is deliberately migration-only, not reset on
  // every run. Dev login therefore enters its seeded owner workspace directly.
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
  await page.getByPlaceholder("What should we focus on this week, and why?").fill("Explain our next priority in plain language.");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/Manager brief for|recommended next step/i)).toBeVisible();

  await page.goto("/operations");
  await page.getByLabel("Title").fill(`E2E rehearsal ${suffix}`);
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText(`E2E rehearsal ${suffix}`)).toBeVisible();
  await page.getByRole("tab", { name: "Music & setlists" }).click();
  await page.getByPlaceholder("Song title").fill(`E2E song ${suffix}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`E2E song ${suffix}`)).toBeVisible();
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.getByPlaceholder("Project name").fill(`E2E release ${suffix}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText(`E2E release ${suffix}`)).toBeVisible();
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
});
