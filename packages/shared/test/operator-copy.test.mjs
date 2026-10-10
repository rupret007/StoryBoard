import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../..");
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function sentenceCount(value) {
  return value
    .replace(/[.!?]+["']?\s*$/g, "")
    .split(/[.!?](?:\s|$)/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

test("S05 command helper is one human sentence and keeps the silent-send fence", () => {
  assert.equal(sentenceCount(shared.COMMAND_HELPER_COPY), 1);
  assert.match(shared.COMMAND_HELPER_COPY, /nothing sends silently/);
  assert.doesNotMatch(shared.COMMAND_HELPER_COPY, /POST \/commands\/execute/);
  const commandBar = source("apps/web/src/components/command-bar.tsx");
  assert.match(commandBar, /COMMAND_HELPER_COPY/);
  assert.doesNotMatch(commandBar, /POST \/commands\/execute/);
  assert.match(commandBar, /disabled=\{loading \|\| !text\.trim\(\)\}/);
  const shell = source("apps/web/src/components/app-shell.tsx");
  assert.match(shell, /lg:pb-80/);
  assert.match(shell, /id="main"/);
});

test("S06 welcome accepts an invite URL or token and Team roles carry six-word hints", () => {
  const token = "a".repeat(43);
  assert.equal(shared.parseInviteInput(token), token);
  assert.equal(
    shared.parseInviteInput(`https://storyboard.test/onboarding?invite=${token}`),
    token
  );
  assert.equal(
    shared.parseInviteInput(`/onboarding?invite=${token}&authError=1`),
    token
  );
  assert.equal(shared.parseInviteInput("  "), "");
  assert.equal(shared.TEAM_INVITE_HEADING, "Invite a bandmate");
  for (const role of ["owner", "member", "viewer"]) {
    assert.equal(shared.countHintWords(shared.TEAM_ROLE_HINTS[role].hint), 6);
  }
  assert.equal(shared.TEAM_ROLE_HINTS.owner.label, "Owner");
  assert.equal(shared.TEAM_ROLE_HINTS.member.label, "Member");
  assert.equal(shared.TEAM_ROLE_HINTS.viewer.label, "Viewer");

  const welcome = source("apps/web/src/components/onboarding-gate.tsx");
  assert.match(welcome, /Create workspace/);
  assert.match(welcome, /parseInviteInput/);
  assert.match(welcome, /Paste an invite link or token/);

  const invite = source("apps/web/src/app/(standalone)/onboarding/invite-client.tsx");
  assert.match(invite, /hasInviteInUrl/);
  assert.match(invite, /searchParams\.has\("invite"\)/);
  assert.match(invite, /parseInviteInput/);
  assert.match(invite, /Join band/);

  const team = source("apps/web/src/app/(app)/team/team-client.tsx");
  assert.match(team, /TEAM_INVITE_HEADING/);
  assert.match(team, /No email has been sent/);
  assert.match(team, /TEAM_ROLE_HINTS/);
});

test("S07 no-auto-pitch copy, Add an event path, and Create opportunity stay pinned", () => {
  assert.equal(
    shared.NO_AUTO_PITCH_COPY,
    "StoryBoard will not send a pitch; a person still books"
  );
  assert.equal(sentenceCount(shared.NO_AUTO_PITCH_COPY), 1);
  assert.equal(shared.showControlActionLabel("record_gig"), "Add an event");

  const opsPage = source("apps/web/src/app/(app)/operations/page.tsx");
  assert.match(opsPage, /NO_AUTO_PITCH_COPY/);
  assert.doesNotMatch(opsPage, /Travis still books|Travis books/);

  const showControl = source("apps/web/src/app/(app)/operations/operations-show-control.tsx");
  assert.match(showControl, /NO_AUTO_PITCH_COPY/);
  assert.doesNotMatch(showControl, /Travis books/);
  assert.match(showControl, /Add an event/);

  const bookingPage = source("apps/web/src/app/(app)/booking/page.tsx");
  assert.match(bookingPage, /NO_AUTO_PITCH_COPY/);
  assert.doesNotMatch(bookingPage, /Travis books/);

  const bookingClient = source("apps/web/src/app/(app)/booking/booking-client.tsx");
  assert.match(bookingClient, /NO_AUTO_PITCH_COPY/);
  assert.match(bookingClient, /Create opportunity/);
  assert.doesNotMatch(bookingClient, /Travis books/);

  const events = source("apps/web/src/app/(app)/operations/operations-client.tsx");
  assert.match(events, /id="ops-add-event"/);
});
