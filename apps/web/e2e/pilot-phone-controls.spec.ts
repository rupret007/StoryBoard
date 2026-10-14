import { expect, test } from "@playwright/test";

const api = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
// Well-formed (43 base64url characters) but never issued, so the API rejects it
// without creating any membership.
const unissuedToken = "a".repeat(43);

async function expectFitsPhoneWidth(page: import("@playwright/test").Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, "page must not scroll horizontally at 375px").toBeTruthy();
}

async function expectTapTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0, "tap target height").toBeGreaterThanOrEqual(44);
}

test.describe("phone member controls at 375px", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("signed-out invitation page fits the phone with 44px sign-in targets", async ({ page }) => {
    await page.goto(`/onboarding?invite=${unissuedToken}`);
    const google = page.getByRole("link", { name: "Continue with Google" });
    await expect(google).toBeVisible();
    await expectTapTarget(google);
    await expectFitsPhoneWidth(page);
  });

  test("invitation acceptance announces a rejected token and keeps token entry usable on a phone", async ({ page }) => {
    await page.goto(`${api}/auth/dev/login?invite=${unissuedToken}`);
    await expect(page).toHaveURL(new RegExp(`/onboarding\\?invite=${unissuedToken}`));
    await expect(page.getByLabel("Token", { exact: true })).toHaveCount(0);
    const join = page.getByRole("button", { name: "Join band", exact: true });
    await expectTapTarget(join);
    const rejected = page.waitForResponse((r) => r.url().endsWith("/memberships/invites/accept") && r.request().method() === "POST");
    await join.click();
    expect((await rejected).ok()).toBeFalsy();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid or expired invite" })).toBeVisible();
    await expectFitsPhoneWidth(page);
  });

  test("team invite controls meet the phone tap-target size without horizontal page scroll", async ({ page }) => {
    await page.goto(`${api}/auth/dev/login`);
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Invite a bandmate" }).first()).toBeVisible();
    await expectTapTarget(page.getByLabel("Email", { exact: true }));
    await expectTapTarget(page.getByRole("combobox", { name: "Role", exact: true }));
    await expectTapTarget(page.getByRole("button", { name: "Invite", exact: true }));
    await expectFitsPhoneWidth(page);
  });
});
