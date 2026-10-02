import { expect, test } from "@playwright/test";

const api = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const web = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

test("phone tracks an unfinished undated project and keeps failed-save drafts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${api}/auth/dev/login`);
  const me = await (await page.request.get(`${api}/auth/me`)).json();
  const sourceArtistId = me.currentArtistId ?? me.memberships[0].artistId;
  const suffix = Date.now().toString(36);
  const workspace = await page.request.post(`${api}/onboarding/additional-artist`, { headers: { origin: web }, data: { sourceArtistId, name: `E2E project band ${suffix}` } });
  expect(workspace.ok(), await workspace.text()).toBe(true);
  const { artistId } = await workspace.json();
  const headers = { "x-artist-id": artistId, origin: web };
  const memberResponse = await page.request.post(`${api}/manager/members`, { headers, data: { name: `E2E project owner ${suffix}` } });
  expect(memberResponse.ok(), await memberResponse.text()).toBe(true);
  const member = await memberResponse.json();

  await page.goto("/operations");
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  const addEvent = page.getByRole("heading", { name: "Add an event", exact: true }).locator("..");
  const eventTitle = `E2E unsaved practice ${suffix}`;
  await addEvent.getByLabel("Title", { exact: true }).fill(eventTitle);
  await page.route(`${api}/events`, (route) => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Event save unavailable. Try again." }) }) : route.continue());
  await addEvent.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Event save unavailable" })).toBeVisible();
  await expect(addEvent.getByLabel("Title", { exact: true })).toHaveValue(eventTitle);
  await page.unroute(`${api}/events`);

  await page.getByRole("tab", { name: "Projects", exact: true }).click();
  const name = `E2E unfinished lyric video ${suffix}`;
  await page.getByRole("combobox", { name: "Project type", exact: true }).selectOption("content_campaign");
  await page.getByPlaceholder("Project name", { exact: true }).fill(name);
  await expect(page.getByLabel("Project due date", { exact: true })).toHaveValue("");
  let attempts = 0;
  await page.route(`${api}/projects`, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Project save unavailable. Try again." }) });
  });
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Project save unavailable" })).toBeVisible();
  await expect(page.getByPlaceholder("Project name", { exact: true })).toHaveValue(name);
  expect(attempts).toBe(1);
  await page.unroute(`${api}/projects`);
  const created = page.waitForResponse((response) => response.url() === `${api}/projects` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  const saved = await created;
  expect(saved.ok(), await saved.text()).toBe(true);
  expect(saved.request().headers()["x-artist-id"]).toBe(artistId);
  const project = await saved.json();
  expect(project.dueAt).toBeNull();
  expect(project.assets).toEqual([]);
  await expect(page.getByPlaceholder("Project name", { exact: true })).toHaveValue("");
  await page.locator(`a[href="/operations/projects/${project.id}"]`).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Project target date", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Generate missing milestones", exact: true })).toBeDisabled();

  const milestone = `Review the unfinished video ${suffix}`;
  const form = page.getByRole("form", { name: "Add project milestone", exact: true });
  await form.getByLabel("Milestone title", { exact: true }).fill(milestone);
  await form.getByRole("combobox", { name: "Milestone owner (optional)", exact: true }).selectOption(member.id);
  const milestoneSaved = page.waitForResponse((response) => response.url() === `${api}/tasks` && response.request().method() === "POST");
  await form.getByRole("button", { name: "Add milestone", exact: true }).click();
  const milestoneResponse = await milestoneSaved;
  expect(milestoneResponse.ok(), await milestoneResponse.text()).toBe(true);
  expect(milestoneResponse.request().headers()["x-artist-id"]).toBe(artistId);
  const task = await milestoneResponse.json();
  expect(task.projectId).toBe(project.id);
  expect(task.bandMemberId).toBe(member.id);
  expect(task.dueAt).toBeNull();
  await expect(page.getByRole("combobox", { name: `Owner for project milestone ${milestone}`, exact: true })).toHaveValue(member.id);
  await expect(form.getByLabel("Milestone title", { exact: true })).toHaveValue("");

  const milestoneStatus = page.getByRole("combobox", { name: `Status for project milestone ${milestone}`, exact: true });
  await expect(milestoneStatus).toHaveValue("todo");
  await expect(page.getByRole("link", { name: "Set or resolve blockers in Tasks", exact: true })).toHaveAttribute("href", "/tasks");
  for (const status of ["in_progress", "done"]) {
    const statusSaved = page.waitForResponse((response) => response.url() === `${api}/tasks/${task.id}` && response.request().method() === "PATCH");
    await milestoneStatus.selectOption(status);
    const response = await statusSaved;
    expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().headers()["x-artist-id"]).toBe(artistId);
    expect(response.request().postDataJSON()).toEqual({ status });
    expect((await response.json()).status).toBe(status);
    await expect(milestoneStatus).toHaveValue(status);
    const stored = await page.request.get(`${api}/tasks`, { headers });
    expect(stored.ok()).toBe(true);
    expect((await stored.json()).find((row: { id: string }) => row.id === task.id)?.status).toBe(status);
  }

  await page.getByLabel("Asset label", { exact: true }).fill("Synthetic review draft");
  await page.getByLabel("Asset URL", { exact: true }).fill("https://example.test/unfinished-video");
  await page.route(`${api}/projects/${project.id}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Asset save unavailable. Try again." }) }) : route.continue());
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Asset save unavailable" })).toBeVisible();
  await expect(page.getByLabel("Asset label", { exact: true })).toHaveValue("Synthetic review draft");
  await expect(page.getByLabel("Asset URL", { exact: true })).toHaveValue("https://example.test/unfinished-video");
  await page.unroute(`${api}/projects/${project.id}`);
  const assetSaved = page.waitForResponse((response) => response.url() === `${api}/projects/${project.id}` && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  const assetResponse = await assetSaved;
  expect(assetResponse.ok(), await assetResponse.text()).toBe(true);
  expect(assetResponse.request().headers()["x-artist-id"]).toBe(artistId);
  await expect(page.getByRole("link", { name: "Synthetic review draft", exact: true })).toBeVisible();
  await expect(page.getByLabel("Asset label", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Asset URL", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Project target date", { exact: true })).toHaveValue("");
  const current = await page.request.get(`${api}/projects/${project.id}`, { headers });
  expect(current.ok()).toBe(true);
  expect((await current.json()).dueAt).toBeNull();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("pilot-project-phone.png"), fullPage: true });
});
