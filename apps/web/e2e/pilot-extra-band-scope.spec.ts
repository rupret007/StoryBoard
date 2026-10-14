import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const api = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const web = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

test("older venue, sprint, inbox and advisor tabs keep writes in their original band", async ({ page, context }) => {
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.memberships.find((membership: { role: string }) => membership.role === "owner").artistId;
  const suffix = Date.now().toString(36);
  async function createWorkspace(name: string) {
    const response = await page.request.post(`${api}/onboarding/additional-artist`, {
      headers: { origin: web }, data: { sourceArtistId, name }
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).artistId as string;
  }
  const bandA = await createWorkspace(`E2E extra scope A ${suffix}`);
  const bandB = await createWorkspace(`E2E extra scope B ${suffix}`);
  // Exercise consent withdrawal with providers still disabled. Both synthetic
  // bands start opted in, so changing the wrong band cannot satisfy the checks.
  const requireFixture = createRequire(__filename);
  const { requireTestDatabaseUrl } = requireFixture("../../../scripts/test-database.mjs");
  const { Client } = requireFixture("pg");
  const db = new Client({ connectionString: requireTestDatabaseUrl() });
  await db.connect();
  try {
    await db.query(
      'INSERT INTO "ArtistBookingReplySettings" (id, "artistId", "aiAnalysisEnabled", "updatedAt") VALUES ($1,$2,true,NOW()),($3,$4,true,NOW())',
      [`scope-settings-${bandA}`, bandA, `scope-settings-${bandB}`, bandB]
    );
  } finally { await db.end(); }
  const selected = await page.request.post(`${api}/auth/session/artist`, {
    headers: { origin: web }, data: { artistId: bandA }
  });
  expect(selected.ok()).toBe(true);

  const sprintTab = await context.newPage();
  const inboxTab = await context.newPage();
  const advisorTab = await context.newPage();
  const otherTab = await context.newPage();
  async function scopedRead(path: string, artistId: string) {
    const response = await page.request.get(`${api}${path}`, { headers: { "x-artist-id": artistId } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  async function expectPinnedWrite(tab: Page, path: string, method: string, action: () => Promise<unknown>) {
    const [response] = await Promise.all([
      tab.waitForResponse((response) => response.url() === `${api}${path}` && response.request().method() === method),
      action()
    ]);
    expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().headers()["x-artist-id"]).toBe(bandA);
    return response.json();
  }

  try {
    // New workspaces are independent of the seeded band's records and settings.
    await Promise.all([
      page.goto("/venues"), sprintTab.goto("/market-sprints"),
      inboxTab.goto("/booking-inbox"), advisorTab.goto("/advisor")
    ]);
    const venueName = `E2E original venue ${suffix}`;
    const sprintName = `E2E original sprint ${suffix}`;
    await page.getByLabel("Name", { exact: true }).fill(venueName);
    await page.getByLabel("City", { exact: true }).fill("Austin");
    await sprintTab.getByLabel("Sprint name", { exact: true }).fill(sprintName);
    await sprintTab.getByLabel("City", { exact: true }).fill("Austin");
    await expect(inboxTab.getByLabel("Allow AI analysis of a selected reply")).toBeChecked();
    await expect(advisorTab.getByRole("button", { name: "Generate booking brief", exact: true })).toBeEnabled();
    for (const tab of [page, sprintTab, inboxTab, advisorTab]) {
      await expect(tab.getByRole("combobox", { name: "Band", exact: true })).toHaveValue(bandA);
    }

    const switched = await otherTab.request.post(`${api}/auth/session/artist`, {
      headers: { origin: web }, data: { artistId: bandB }
    });
    expect(switched.ok()).toBe(true);
    expect((await (await otherTab.request.get(`${api}/auth/me`)).json()).currentArtistId).toBe(bandB);
    // Do not reload or navigate the old tabs: their forms still belong to A.
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(venueName);
    await expect(sprintTab.getByLabel("Sprint name", { exact: true })).toHaveValue(sprintName);
    const venue = await expectPinnedWrite(page, "/venues", "POST", () =>
      page.getByRole("button", { name: "Create venue", exact: true }).click());
    const sprint = await expectPinnedWrite(sprintTab, "/market-sprints", "POST", () =>
      sprintTab.getByRole("button", { name: "Create sprint", exact: true }).click());
    // This controlled checkbox changes only after the API confirms the save.
    // Withdraw consent, then verify the response and rendered state; uncheck()
    // assumes an immediate DOM change before this controlled save completes.
    await expectPinnedWrite(inboxTab, "/booking-replies/settings", "PATCH", () =>
      inboxTab.getByLabel("Allow AI analysis of a selected reply").click());
    await expect(inboxTab.getByLabel("Allow AI analysis of a selected reply")).not.toBeChecked();
    const run = await expectPinnedWrite(advisorTab, "/booking-advisor/generate", "POST", () =>
      advisorTab.getByRole("button", { name: "Generate booking brief", exact: true }).click());

    expect(venue.artistId).toBe(bandA);
    expect(sprint.artistId).toBe(bandA);
    expect(run.artistId).toBe(bandA);
    expect(run.mode).toBe("deterministic");
    const [venuesA, venuesB, sprintsA, sprintsB, settingsA, settingsB, latestA, latestB] = await Promise.all([
      scopedRead("/venues", bandA), scopedRead("/venues", bandB),
      scopedRead("/market-sprints", bandA), scopedRead("/market-sprints", bandB),
      scopedRead("/booking-replies/settings", bandA), scopedRead("/booking-replies/settings", bandB),
      scopedRead("/booking-advisor/latest", bandA), scopedRead("/booking-advisor/latest", bandB)
    ]);
    expect(venuesA.map((row: { id: string }) => row.id)).toContain(venue.id);
    expect(venuesB).toHaveLength(0);
    expect(sprintsA.map((row: { id: string }) => row.id)).toContain(sprint.id);
    expect(sprintsB).toHaveLength(0);
    expect(settingsA.aiAnalysisEnabled).toBe(false);
    expect(settingsB.aiAnalysisEnabled).toBe(true);
    expect(latestA.id).toBe(run.id);
    expect(latestB).toBeNull();
  } finally {
    await Promise.all([sprintTab.close(), inboxTab.close(), advisorTab.close(), otherTab.close()]);
  }
});
