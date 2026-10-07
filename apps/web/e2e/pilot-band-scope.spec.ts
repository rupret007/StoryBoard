import { expect, test } from "@playwright/test";

const api = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const web = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

test("a contact saved from an older tab stays in the band that tab opened", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.memberships.find((membership: { role: string }) => membership.role === "owner").artistId;
  const suffix = Date.now().toString(36);
  async function createWorkspace(name: string) {
    const response = await page.request.post(`${api}/onboarding/additional-artist`, { headers: { origin: web }, data: { sourceArtistId, name } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).artistId as string;
  }
  const bandAName = `E2E contacts band A ${suffix}`;
  const bandA = await createWorkspace(bandAName);
  const bandB = await createWorkspace(`E2E contacts band B ${suffix}`);
  const selectA = await page.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: bandA } });
  expect(selectA.ok()).toBe(true);
  await page.goto("/contacts");
  const name = `E2E band A contact ${suffix}`;
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await expect(page.getByTitle(bandAName, { exact: true }).filter({ visible: true })).toBeVisible();

  const otherTab = await context.newPage();
  try {
    const selectB = await otherTab.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: bandB } });
    expect(selectB.ok()).toBe(true);
    const current = await (await otherTab.request.get(`${api}/auth/me`)).json();
    expect(current.currentArtistId).toBe(bandB);
    // The first tab still contains the original band's draft. No reload or
    // navigation is allowed before saving: that is the stale-cookie regression.
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(name);
    await expect(page.getByTitle(bandAName, { exact: true }).filter({ visible: true })).toBeVisible();
    const written = page.waitForResponse((response) => response.url() === `${api}/contacts` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create contact", exact: true }).click();
    const response = await written;
    expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().headers()["x-artist-id"]).toBe(bandA);
    const contact = await response.json();
    expect(contact.artistId).toBe(bandA);
    const [contactsAResponse, contactsBResponse] = await Promise.all([
      page.request.get(`${api}/contacts`, { headers: { "x-artist-id": bandA } }),
      page.request.get(`${api}/contacts`, { headers: { "x-artist-id": bandB } })
    ]);
    expect(contactsAResponse.ok()).toBe(true);
    expect(contactsBResponse.ok()).toBe(true);
    expect((await contactsAResponse.json()).filter((row: { id: string }) => row.id === contact.id)).toHaveLength(1);
    expect((await contactsBResponse.json()).some((row: { fullName: string }) => row.fullName === name)).toBe(false);
  } finally { await otherTab.close(); }
});

test("booking profile and campaign drafts stay in their open band after another tab switches bands", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.memberships.find((membership: { role: string }) => membership.role === "owner").artistId;
  const suffix = Date.now().toString(36);
  async function createWorkspace(name: string) {
    const response = await page.request.post(`${api}/onboarding/additional-artist`, { headers: { origin: web }, data: { sourceArtistId, name } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).artistId as string;
  }
  const bandAName = `E2E booking band A ${suffix}`;
  const bandA = await createWorkspace(bandAName);
  const bandB = await createWorkspace(`E2E booking band B ${suffix}`);
  const profile = await page.request.put(`${api}/booking-profile`, {
    headers: { origin: web, "x-artist-id": bandA },
    data: { homeCity: "Chicago", homeCountry: "US", genres: ["rock"], targetCapacityMin: 50, targetCapacityMax: 150, bookingPitch: "Synthetic band A starting pitch." }
  });
  expect(profile.ok(), await profile.text()).toBe(true);
  const selected = await page.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: bandA } });
  expect(selected.ok()).toBe(true);
  await page.goto("/prospects");
  const pitch = `Synthetic band A edited pitch ${suffix}`;
  await page.getByRole("textbox", { name: "Short booking pitch", exact: true }).fill(pitch);

  const campaignTab = await context.newPage();
  try {
    await campaignTab.setViewportSize({ width: 390, height: 844 });
    await campaignTab.goto("/booking-campaigns");
    const campaignName = `E2E band A campaign ${suffix}`;
    await campaignTab.getByRole("textbox", { name: "Campaign name", exact: true }).fill(campaignName);
    const switched = await campaignTab.request.post(`${api}/auth/session/artist`, { headers: { origin: web }, data: { artistId: bandB } });
    expect(switched.ok()).toBe(true);
    expect((await (await campaignTab.request.get(`${api}/auth/me`)).json()).currentArtistId).toBe(bandB);

    // Both already-open forms still belong to A; neither navigates after the
    // shared cookie changes, and the create must not inherit that cookie's band.
    await expect(page.getByTitle(bandAName, { exact: true }).filter({ visible: true })).toBeVisible();
    const savedProfile = page.waitForResponse((response) => response.url() === `${api}/booking-profile` && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    const profileResponse = await savedProfile;
    expect(profileResponse.ok(), await profileResponse.text()).toBe(true);
    expect(profileResponse.request().headers()["x-artist-id"]).toBe(bandA);

    await expect(campaignTab.getByTitle(bandAName, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(campaignTab.getByRole("textbox", { name: "Campaign name", exact: true })).toHaveValue(campaignName);
    const savedCampaign = campaignTab.waitForResponse((response) => response.url() === `${api}/booking-campaigns` && response.request().method() === "POST");
    await campaignTab.getByRole("button", { name: "Create campaign", exact: true }).click();
    const campaignResponse = await savedCampaign;
    expect(campaignResponse.ok(), await campaignResponse.text()).toBe(true);
    expect(campaignResponse.request().headers()["x-artist-id"]).toBe(bandA);
    const campaign = await campaignResponse.json();
    expect(campaign.artistId).toBe(bandA);
    expect(campaign.status).toBe("draft");

    const responses = await Promise.all([
      page.request.get(`${api}/booking-profile`, { headers: { "x-artist-id": bandA } }),
      page.request.get(`${api}/booking-profile`, { headers: { "x-artist-id": bandB } }),
      page.request.get(`${api}/booking-campaigns`, { headers: { "x-artist-id": bandA } }),
      page.request.get(`${api}/booking-campaigns`, { headers: { "x-artist-id": bandB } })
    ]);
    for (const response of responses) expect(response.ok(), await response.text()).toBe(true);
    const [profileA, profileB, campaignsA, campaignsB] = await Promise.all(responses.map((response) => response.json()));
    expect(profileA.profile.bookingPitch).toBe(pitch);
    expect(profileB.profile).toBeNull();
    expect(campaignsA.filter((row: { id: string }) => row.id === campaign.id)).toHaveLength(1);
    expect(campaignsB).toHaveLength(0);
  } finally { await campaignTab.close(); }
});
