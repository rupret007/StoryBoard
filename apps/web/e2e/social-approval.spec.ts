import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { createHmac, randomUUID } from "node:crypto";

const api = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const web = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";

async function setup(page: Page) {
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const result = await page.request.post(`${api}/onboarding/additional-artist`, {
    headers: { origin: web },
    data: { name: `Social review ${randomUUID()}`, sourceArtistId: me.currentArtistId ?? me.memberships[0].artistId }
  });
  expect(result.ok(), await result.text()).toBe(true);
  const fresh = await (await page.request.get(`${api}/auth/me`)).json();
  const artistId = fresh.currentArtistId;
  expect(artistId).toBeTruthy();
  await page.goto("/social");
  return artistId as string;
}

test("owner approval with a lost response remains a single simulated send after refresh and replay", async ({ page }) => {
  const artistId = await setup(page);
  await page.getByLabel("Note", { exact: true }).fill("Rehearsal clip");
  await page.getByRole("button", { name: "Draft captions", exact: true }).click();
  await expect(page.getByTestId("social-approve-and-post")).toBeEnabled();
  const before = await (await page.request.get(`${api}/social`, { headers: { "x-artist-id": artistId } })).json();
  expect(before.posts).toHaveLength(1);
  const draft = before.posts[0];
  expect(draft.sendLogs).toHaveLength(0);
  let submitted: unknown;
  await page.route("**/social/approve-and-post", async (route) => {
    submitted = route.request().postDataJSON();
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    await route.abort("failed");
  });
  await page.getByTestId("social-approve-and-post").click();
  await expect(page.locator("p[role='alert']")).toContainText("A send may have started");
  await expect(page.getByTestId("social-approve-and-post")).toBeDisabled();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  for (const platform of ["facebook", "instagram", "youtube", "tiktok"]) {
    await expect(page.getByTestId(`social-receipt-${platform}`)).toContainText("Simulated — nothing sent");
  }
  await expect(page.getByTestId("social-approve-and-post")).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Facebook caption" })).toBeDisabled();
  const replay = await page.request.post(`${api}/social/approve-and-post`, {
    headers: { origin: web, "x-artist-id": artistId }, data: submitted
  });
  expect(replay.ok(), await replay.text()).toBe(true);
  const posted = await replay.json();
  expect(posted.status).toBe("simulated");
  expect(posted.sendLogs).toHaveLength(4);
  expect(posted.sendLogs.every((log: { outcome: string }) => log.outcome === "simulated")).toBe(true);
  await page.reload();
  await expect(page.getByTestId("social-receipt-facebook")).toContainText("Simulated — nothing sent");
});

test("members can review drafts but neither Social nor Approval Center accepts their approval", async ({ page, browser }) => {
  const artistId = await setup(page);
  const created = await page.request.post(`${api}/social/drops`, {
    headers: { origin: web, "x-artist-id": artistId }, data: { note: "Band rehearsal", platforms: ["facebook"] }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const draft = await created.json();
  const requireFixture = createRequire(__filename);
  const { requireTestDatabaseUrl } = requireFixture("../../../scripts/test-database.mjs");
  const { Client } = requireFixture("pg");
  const db = new Client({ connectionString: requireTestDatabaseUrl() });
  const memberId = `social-member-${randomUUID()}`;
  await db.connect();
  try {
    await db.query('INSERT INTO "Operator" (id,email,"updatedAt") VALUES ($1,$2,NOW())', [memberId, `${memberId}@example.test`]);
    await db.query('INSERT INTO "ArtistMembership" (id,"artistId","operatorId",role) VALUES ($1,$2,$3,\'member\')', [randomUUID(), artistId, memberId]);
  } finally { await db.end(); }
  const secret = process.env.SESSION_SECRET;
  expect(secret).toBeTruthy();
  const payload = Buffer.from(JSON.stringify({ v: 1, operatorId: memberId, currentArtistId: artistId, iat: Date.now(), exp: Date.now() + 3600000 })).toString("base64url");
  const signature = createHmac("sha256", secret!).update(payload).digest("base64url");
  const context = await browser.newContext();
  try {
    await context.addCookies([{ name: "sb_session", value: `${payload}.${signature}`, url: web, httpOnly: true, sameSite: "Lax" }]);
    const member = await context.newPage();
    await member.goto(`${web}/social`);
    await expect(member.getByText("Only an owner can approve and post.")).toBeVisible();
    await expect(member.getByTestId("social-approve-and-post")).toBeDisabled();
    for (const path of ["/social/approve-and-post", `/approvals/${draft.approvalRequestId}/approve`]) {
      const denied = await member.request.post(`${api}${path}`, {
        headers: { origin: web, "x-artist-id": artistId }, data: { postId: draft.id }
      });
      expect(denied.status()).toBe(403);
    }
    const unchanged = await (await member.request.get(`${api}/social/posts/${draft.id}`, { headers: { "x-artist-id": artistId } })).json();
    expect(unchanged.approval.status).toBe("pending");
    expect(unchanged.sendLogs).toHaveLength(0);
  } finally { await context.close(); }
});
