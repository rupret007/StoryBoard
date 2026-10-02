import { expect, test } from "@playwright/test";

const api = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const web = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

test("a stale Manager tab keeps intake, chat, reads, and cadence in its displayed band", async ({ page, context }) => {
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.currentArtistId ?? me.memberships[0].artistId;
  const suffix = Date.now().toString(36);
  const bandIds: string[] = [];
  for (const label of ["A", "B"]) {
    const created = await page.request.post(`${api}/onboarding/additional-artist`, {
      headers: { origin: web }, data: { sourceArtistId, name: `E2E Manager scope ${label} ${suffix}` }
    });
    expect(created.ok(), await created.text()).toBe(true);
    bandIds.push((await created.json()).artistId);
  }
  const [artistA, artistB] = bandIds;
  if (!artistA || !artistB) throw new Error("Both isolated band fixtures are required");
  const otherTab = await context.newPage();
  async function selectBand(artistId: string) {
    const selected = await otherTab.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId } });
    expect(selected.ok(), await selected.text()).toBe(true);
    expect((await (await otherTab.request.get(`${api}/auth/me`)).json()).currentArtistId).toBe(artistId);
  }
  async function readBand(artistId: string, path: string) {
    const response = await page.request.get(`${api}${path}`, { headers: { "x-artist-id": artistId } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }

  await selectBand(artistA);
  await page.goto("/manager");
  await expect(page.getByRole("heading", { name: "Tell StoryBoard enough to manage the tradeoffs", exact: true })).toBeVisible();
  await page.getByLabel("Home market", { exact: true }).fill("Chicago, IL");
  const ambition = `Keep band A's pilot facts separate ${suffix}`;
  const memberName = `E2E Manager performer ${suffix}`;
  await page.getByLabel("What would a great next 12 months look like?", { exact: true }).fill(ambition);
  await page.getByLabel("Band member names", { exact: true }).fill(memberName);
  await selectBand(artistB);
  await otherTab.goto("/manager");
  await expect(otherTab.getByRole("combobox", { name: "Band", exact: true })).toHaveValue(artistB);
  await expect(page.getByRole("combobox", { name: "Band", exact: true })).toHaveValue(artistA);

  const intakeSaved = page.waitForResponse((response) => response.url() === `${api}/manager/intake/complete` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Build my 90-day operating plan", exact: true }).click();
  const intakeResponse = await intakeSaved;
  expect(intakeResponse.ok(), await intakeResponse.text()).toBe(true);
  expect(intakeResponse.request().headers()["x-artist-id"]).toBe(artistA);
  expect(await readBand(artistA, "/manager/profile")).toMatchObject({ artistId: artistA, twelveMonthAmbition: ambition });
  expect((await readBand(artistA, "/manager/members")).map((member: { name: string }) => member.name)).toEqual([memberName]);
  expect(await readBand(artistB, "/manager/profile")).toBeNull();
  expect(await readBand(artistB, "/manager/members")).toEqual([]);

  // Intake refreshes the page. Capture band A again before making its second tab stale.
  await selectBand(artistA);
  await page.goto("/manager");
  await expect(page.getByTestId("manager-cadence")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Band", exact: true })).toHaveValue(artistA);
  const settingsB = await readBand(artistB, "/manager/settings");
  await selectBand(artistB);
  const timezone = settingsB.timezone === "Pacific/Honolulu" ? "America/Los_Angeles" : "Pacific/Honolulu";
  await page.getByLabel("Manager schedule timezone", { exact: true }).fill(timezone);
  await expect(page.getByLabel("Enable Manager AI reasoning", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Prepare Manager briefs on schedule", { exact: true })).not.toBeChecked();
  const cadenceSaved = page.waitForResponse((response) => response.url() === `${api}/manager/settings` && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save cadence", exact: true }).click();
  const cadenceResponse = await cadenceSaved;
  expect(cadenceResponse.ok(), await cadenceResponse.text()).toBe(true);
  expect(cadenceResponse.request().headers()["x-artist-id"]).toBe(artistA);
  expect(await readBand(artistA, "/manager/settings")).toMatchObject({ timezone, aiEnabled: false, scheduleEnabled: false });
  expect(await readBand(artistB, "/manager/settings")).toEqual(settingsB);

  const question = "What do I need to do?";
  await page.getByLabel("Message your manager", { exact: true }).fill(question);
  const chatSaved = page.waitForResponse((response) => response.url() === `${api}/manager/chat` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const chatResponse = await chatSaved;
  expect(chatResponse.ok(), await chatResponse.text()).toBe(true);
  expect(chatResponse.request().headers()["x-artist-id"]).toBe(artistA);
  const { conversationId } = await chatResponse.json();
  expect((await readBand(artistA, "/manager/conversations?limit=10")).map((row: { id: string }) => row.id)).toContain(conversationId);
  expect(await readBand(artistB, "/manager/conversations?limit=10")).toEqual([]);
  await page.getByRole("button", { name: "New", exact: true }).click();
  const conversationRead = page.waitForResponse((response) => response.url() === `${api}/manager/conversations/${conversationId}` && response.request().method() === "GET");
  await page.getByLabel("Manager conversation history", { exact: true }).selectOption(conversationId);
  const readResponse = await conversationRead;
  expect(readResponse.ok(), await readResponse.text()).toBe(true);
  expect(readResponse.request().headers()["x-artist-id"]).toBe(artistA);
  await expect(page.getByTestId("manager-conversation-messages").getByText(question, { exact: true })).toBeVisible();
  await otherTab.close();
});
