import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const apiUrl = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const webUrl = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

// Separate synthetic accounts exercise identity and roles without Google or sends.
test("owner links a performer; their phone shows assigned work and records their availability", async ({ page, browser }) => {
  const secret = process.env.SESSION_SECRET;
  expect(secret, "The synthetic browser fixture requires the test API session secret").toBeTruthy();
  const requireFixture = createRequire(__filename);
  const { requireTestDatabaseUrl } = requireFixture("../../../scripts/test-database.mjs");
  const { Client } = requireFixture("pg");
  const db = new Client({ connectionString: requireTestDatabaseUrl() });
  await db.connect();
  const suffix = Date.now().toString(36);
  const playerId = `account-player-${suffix}`;
  const playerName = `E2E linked player ${suffix}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Dev login (local only)" }).click();
    const me = await (await page.request.get(`${apiUrl}/auth/me`)).json();
    const sourceArtistId = me.currentArtistId ?? me.memberships[0].artistId;
    const workspace = await page.request.post(`${apiUrl}/onboarding/additional-artist`, { headers: { origin: webUrl }, data: { sourceArtistId, name: `E2E member account band ${suffix}` } });
    expect(workspace.ok(), await workspace.text()).toBe(true);
    const { artistId } = await workspace.json();
    const headers = { "x-artist-id": artistId, origin: webUrl };
    await db.query('INSERT INTO "Operator" (id, email, name, "updatedAt") VALUES ($1,$2,$3,NOW())', [playerId, `${playerId}@example.test`, playerName]);
    await db.query('INSERT INTO "ArtistMembership" (id, "operatorId", "artistId", role) VALUES ($1,$2,$3,$4)', [`membership-${suffix}`, playerId, artistId, "member"]);
    const memberResponse = await page.request.post(`${apiUrl}/manager/members`, { headers, data: { name: playerName } });
    expect(memberResponse.ok(), await memberResponse.text()).toBe(true);
    const member = await memberResponse.json();
    const taskResponse = await page.request.post(`${apiUrl}/tasks`, { headers, data: { title: `E2E own rehearsal prep ${suffix}`, bandMemberId: member.id } });
    expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
    const task = await taskResponse.json();
    const eventResponse = await page.request.post(`${apiUrl}/events`, { headers, data: { title: `E2E own rehearsal ${suffix}`, type: "rehearsal", status: "confirmed", startsAt: "2030-10-12T17:00:00Z", timezone: "America/Chicago" } });
    expect(eventResponse.ok(), await eventResponse.text()).toBe(true);
    const event = await eventResponse.json();
    const initialAvailability = await page.request.post(`${apiUrl}/events/${event.id}/participants`, { headers, data: { bandMemberId: member.id, response: "unknown", assignment: "Lead vocals", notes: "Bring guitar" } });
    expect(initialAvailability.ok()).toBe(true);

    await page.goto("/manager#member-accounts");
    await page.getByRole("combobox", { name: `Account for ${playerName}`, exact: true }).selectOption(playerId);
    const linked = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/manager/members/${member.id}`));
    await page.getByRole("button", { name: `Save account for ${playerName}`, exact: true }).click();
    expect((await linked).ok()).toBe(true);

    const payload = Buffer.from(JSON.stringify({ v: 1, operatorId: playerId, currentArtistId: artistId, iat: Date.now(), exp: Date.now() + 3600000 })).toString("base64url");
    const token = `${payload}.${createHmac("sha256", secret!).update(payload).digest("base64url")}`;
    await context.addCookies([{ name: "sb_session", value: token, url: webUrl, httpOnly: true, sameSite: "Lax" }]);
    const player = await context.newPage();
    await player.goto("/tasks");
    await expect(player.getByRole("combobox", { name: "Task view", exact: true })).toHaveValue("mine");
    const mine = player.getByRole("region", { name: "My tasks" });
    await expect(mine).toContainText(task.title);
    const completed = player.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/tasks/${task.id}`));
    await mine.getByRole("button", { name: "Mark done", exact: true }).click();
    const completion = await completed;
    expect(completion.ok(), await completion.text()).toBe(true);
    expect(completion.request().headers()["x-artist-id"]).toBe(artistId);
    await expect(mine).not.toContainText(task.title);

    await player.goto("/operations");
    const recorded = player.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/events/${event.id}/my-availability`));
    await player.getByRole("combobox", { name: `My availability for ${event.title}`, exact: true }).selectOption("available");
    const availabilityResponse = await recorded;
    expect(availabilityResponse.ok()).toBe(true);
    const availability = await availabilityResponse.json();
    expect(availability.assignment).toBe("Lead vocals");
    expect(availability.notes).toBe("Bring guitar");
    await expect(player.getByRole("status").filter({ hasText: event.title })).toContainText("recorded as available");
    const audit = await db.query('SELECT "actorOperatorId", metadata FROM "AuditEvent" WHERE "aggregateId" = $1 AND action = $2 ORDER BY "createdAt" DESC LIMIT 1', [availability.id, "event.availability_recorded"]);
    expect(audit.rows[0].actorOperatorId).toBe(playerId);
    expect(audit.rows[0].metadata.recordedForSelf).toBe(true);

    await player.goto("/manager");
    await expect(player.getByRole("heading", { name: "Member accounts", exact: true })).toHaveCount(0);
    const relink = await player.request.patch(`${apiUrl}/manager/members/${member.id}`, { headers, data: { linkedOperatorId: null } });
    expect(relink.status()).toBe(403);
    const foreign = await player.request.get(`${apiUrl}/tasks`, { headers: { ...headers, "x-artist-id": "unrelated-band" } });
    expect(foreign.status()).toBe(403);
  } finally {
    await context.close();
    await db.end();
  }
});
