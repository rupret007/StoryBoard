import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const api = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const web = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";

test("phone invitation survives sign-in and joins the separately created band", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const requireFixture = createRequire(__filename);
  const { requireTestDatabaseUrl } = requireFixture("../../../scripts/test-database.mjs");
  const { Client } = requireFixture("pg");
  const db = new Client({ connectionString: requireTestDatabaseUrl() });
  const memberId = `invite-player-${Date.now()}`;
  const memberEmail = `${memberId}@example.test`;
  await db.connect();
  try {
    await db.query('INSERT INTO "Operator" (id, email, "updatedAt") VALUES ($1,$2,NOW())', [memberId, memberEmail]);
  } finally { await db.end(); }
  const source = me.currentArtistId ?? me.memberships[0].artistId;
  await page.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: source } });
  await page.goto("/team");
  const band = `Pilot second band ${Date.now()}`;
  await page.getByLabel("New band name").fill(band);
  const bandSaved = page.waitForResponse((r) => r.url().endsWith("/onboarding/additional-artist") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Create separate band" }).click();
  expect((await bandSaved).ok()).toBeTruthy();
  await expect.poll(async () => {
    const fresh = await (await page.request.get(`${api}/auth/me`)).json();
    return fresh.memberships.find((m: { artistName: string }) => m.artistName === band)?.artistId;
  }).toBeTruthy();
  await page.reload();
  await page.getByLabel("Email", { exact: true }).fill(memberEmail);
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("member");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText(`No email has been sent. Share this link with ${memberEmail}.`)).toBeVisible();
  const inviteUrl = await page.getByLabel("Invitation link").inputValue();
  const token = new URL(inviteUrl).searchParams.get("invite")!;
  const signedOut = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recipient = await signedOut.newPage();
  await recipient.goto(inviteUrl);
  await expect(recipient.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", `${api}/auth/operator/google/start?invite=${token}`);
  await recipient.getByRole("link", { name: "Dev login (local only)" }).click();
  await expect(recipient).toHaveURL(new RegExp(`/onboarding\\?invite=${token}`));
  await expect(recipient.getByText(`Signed in as ${me.operator.email}.`, { exact: false })).toBeVisible();
  const wrong = recipient.waitForResponse((r) => r.url().endsWith("/memberships/invites/accept") && r.request().method() === "POST");
  await recipient.getByRole("button", { name: "Join band", exact: true }).click();
  expect((await wrong).status()).toBe(400);
  await recipient.getByRole("button", { name: "Use another account", exact: true }).click();
  await expect(recipient).toHaveURL(new RegExp(`/onboarding\\?invite=${token}`));
  await expect(recipient.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", `${api}/auth/operator/google/start?invite=${token}`);
  // Google exchange is covered by nonce/controller tests; this synthetic session
  // proves a different invited account creates membership, never live OAuth.
  const secret = process.env.SESSION_SECRET;
  expect(secret).toBeTruthy();
  const payload = Buffer.from(JSON.stringify({ v: 1, operatorId: memberId, currentArtistId: null, iat: Date.now(), exp: Date.now() + 3600000 })).toString("base64url");
  const signed = `${payload}.${createHmac("sha256", secret!).update(payload).digest("base64url")}`;
  await signedOut.addCookies([{ name: "sb_session", value: signed, url: web, httpOnly: true, sameSite: "Lax" }]);
  await recipient.reload();
  await expect(recipient.getByText(`Signed in as ${memberEmail}.`, { exact: false })).toBeVisible();
  await recipient.getByRole("button", { name: "Join band", exact: true }).click();
  await expect(recipient).toHaveURL(/\/dashboard$/);
  const recipientMe = await (await recipient.request.get(`${api}/auth/me`)).json();
  expect(recipientMe.memberships).toHaveLength(1);
  expect(recipientMe.operator.id).toBe(memberId);
  expect(recipientMe.memberships.find((m: { artistName: string }) => m.artistName === band)?.artistId).toBe(recipientMe.currentArtistId);
  await expect(recipient.locator("header").getByText(band, { exact: true })).toBeVisible();
  expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await recipient.screenshot({ path: test.info().outputPath("pilot-band-phone.png"), fullPage: true });
  await signedOut.close();
  await page.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: source } });
});

test("band switching and sign-out failures stay visible and preserve the active session", async ({ page }) => {
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const source = me.currentArtistId ?? me.memberships[0].artistId;
  const created = await page.request.post(`${api}/onboarding/additional-artist`, { headers: { origin: web }, data: { name: `Switch test ${Date.now()}`, sourceArtistId: source } });
  expect(created.ok()).toBeTruthy();
  await page.goto("/dashboard");
  await page.route("**/auth/session/artist", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Band switch unavailable. Try again." }) }));
  await page.getByRole("combobox", { name: "Band", exact: true }).selectOption(source);
  await expect(page.getByRole("alert").filter({ hasText: "Band switch unavailable" })).toBeVisible();
  const beforeLogout = await page.context().cookies();
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 503, body: JSON.stringify({ message: "Sign-out unavailable. Try again." }) }));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sign-out unavailable" })).toBeVisible();
  expect((await page.context().cookies()).find((c) => c.name === "sb_session")?.value).toBe(beforeLogout.find((c) => c.name === "sb_session")?.value);
});
