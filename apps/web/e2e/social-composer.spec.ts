import { expect, test } from "@playwright/test";

const api = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const web = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

test("phone Social starts a new drop, keeps approval reachable through caption review, and prevents reapproval", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.memberships.find((membership: { role: string }) => membership.role === "owner").artistId;
  const createdBand = await page.request.post(`${api}/onboarding/additional-artist`, {
    headers: { origin: web },
    data: { sourceArtistId, name: `Stalemate Social E2E ${Date.now()}` }
  });
  expect(createdBand.ok(), await createdBand.text()).toBe(true);
  const { artistId } = await createdBand.json();
  const selected = await page.request.post(`${api}/auth/session/artist`, {
    headers: { origin: web }, data: { artistId }
  });
  expect(selected.ok()).toBe(true);
  const headers = { origin: web, "x-artist-id": artistId };
  const oldDrop = await page.request.post(`${api}/social/drops`, {
    headers, data: { note: "Previous rehearsal", platforms: ["facebook"] }
  });
  expect(oldDrop.ok(), await oldDrop.text()).toBe(true);
  const oldPost = await oldDrop.json();
  const oldSend = await page.request.post(`${api}/social/approve-and-post`, {
    headers,
    data: { postId: oldPost.id, reviewFingerprint: oldPost.reviewFingerprint }
  });
  expect(oldSend.ok(), await oldSend.text()).toBe(true);
  expect((await oldSend.json()).approval.status).toBe("executed");

  const requests: Array<{ path: string; method: string }> = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${api}/social`)) {
      requests.push({ path: new URL(request.url()).pathname, method: request.method() });
    }
  });
  await page.goto("/social");
  const approve = page.getByTestId("social-approve-and-post");
  await expect(page.getByRole("button", { name: "Previous rehearsal", exact: true })).toBeVisible();
  await expect(page.getByText("No drop in review", { exact: true })).toBeVisible();
  await expect(approve).toHaveCount(0);
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");

  await page.getByLabel("Note", { exact: true }).fill("Today's rehearsal clip");
  const drafted = page.waitForResponse((response) => response.url() === `${api}/social/drops` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Draft captions", exact: true }).click();
  const draftResponse = await drafted;
  expect(draftResponse.ok(), await draftResponse.text()).toBe(true);
  const newPost = await draftResponse.json();
  expect(newPost.id).not.toBe(oldPost.id);
  await expect(approve).toBeEnabled();
  await expect(page.getByRole("button", { name: "Today's rehearsal clip", exact: true })).toHaveCount(1);

  // A sticky action inside the short preview header scrolls away from these
  // captions. Assert its actual viewport position, not just its CSS class.
  for (const platform of ["Facebook", "Instagram", "TikTok"]) {
    await page.getByRole("textbox", { name: `${platform} caption`, exact: true }).evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });
    await expect(approve).toBeInViewport({ ratio: 1 });
  }
  const sent = page.waitForResponse((response) => response.url() === `${api}/social/approve-and-post` && response.request().method() === "POST");
  await approve.click();
  const sentResponse = await sent;
  expect(sentResponse.ok(), await sentResponse.text()).toBe(true);
  const sentPost = await sentResponse.json();
  expect(sentPost.id).toBe(newPost.id);
  expect(sentPost.approval.status).toBe("executed");
  await expect(approve).toBeDisabled();
  await expect(page.getByTestId("social-already-posted")).toBeVisible();
  expect(requests.filter((request) => request.path === "/social" && request.method === "GET")).toHaveLength(0);
  expect(requests.filter((request) => request.path === "/social/approve-and-post" && request.method === "POST")).toHaveLength(1);

  await page.getByRole("button", { name: "Previous rehearsal", exact: true }).click();
  await expect(approve).toBeDisabled();
  await page.reload();
  await expect(page.getByText("No drop in review", { exact: true })).toBeVisible();
  await expect(approve).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Today's rehearsal clip", exact: true })).toHaveCount(1);
});

test("after posting an uploaded drop the composer clears media so the next drop can change kind or URL", async ({ page }) => {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.memberships.find((membership: { role: string }) => membership.role === "owner").artistId;
  const createdBand = await page.request.post(`${api}/onboarding/additional-artist`, {
    headers: { origin: web },
    data: { sourceArtistId, name: `Social media reset E2E ${Date.now()}` }
  });
  expect(createdBand.ok(), await createdBand.text()).toBe(true);
  const { artistId } = await createdBand.json();
  const selected = await page.request.post(`${api}/auth/session/artist`, {
    headers: { origin: web },
    data: { artistId }
  });
  expect(selected.ok()).toBe(true);

  await page.goto("/social");
  await page.getByTestId("social-file-input").setInputFiles({
    name: "first-drop.png",
    mimeType: "image/png",
    buffer: tinyPng
  });
  await expect(page.getByTestId("social-upload-progress")).toContainText("Stored first-drop.png");
  await page.getByLabel("Note", { exact: true }).fill("First uploaded drop");
  const firstDraft = page.waitForResponse(
    (response) => response.url() === `${api}/social/drops` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Draft captions", exact: true }).click();
  const firstDraftResponse = await firstDraft;
  expect(firstDraftResponse.ok(), await firstDraftResponse.text()).toBe(true);
  const firstPost = await firstDraftResponse.json();

  const firstSend = page.waitForResponse(
    (response) => response.url() === `${api}/social/approve-and-post` && response.request().method() === "POST"
  );
  await page.getByTestId("social-approve-and-post").click();
  expect((await firstSend).ok()).toBe(true);

  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");
  const mediaKind = page.locator('label:has-text("Media kind") select');
  await expect(mediaKind).toBeEnabled();
  await mediaKind.selectOption("video");
  await page.getByPlaceholder("Only if the file already lives on the web").fill("https://example.com/clip.mp4");
  await page.getByLabel("Note", { exact: true }).fill("Second drop via URL");
  const secondDraft = page.waitForResponse(
    (response) => response.url() === `${api}/social/drops` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Draft captions", exact: true }).click();
  const secondDraftResponse = await secondDraft;
  expect(secondDraftResponse.ok(), await secondDraftResponse.text()).toBe(true);
  const secondPost = await secondDraftResponse.json();
  expect(secondPost.id).not.toBe(firstPost.id);
  expect(secondPost.media?.kind).toBe("video");
});
