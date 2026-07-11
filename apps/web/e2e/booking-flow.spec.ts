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
