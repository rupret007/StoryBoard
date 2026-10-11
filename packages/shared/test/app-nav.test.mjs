import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../..");
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

function hexChannel(value) {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const n = hex.replace("#", "");
  return (
    0.2126 * hexChannel(parseInt(n.slice(0, 2), 16)) +
    0.7152 * hexChannel(parseInt(n.slice(2, 4), 16)) +
    0.0722 * hexChannel(parseInt(n.slice(4, 6), 16))
  );
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const [hi, lo] = first > second ? [first, second] : [second, first];
  return (hi + 0.05) / (lo + 0.05);
}

function cssToken(css, name) {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `${name} must be a hex color in globals.css`);
  return match[1];
}

test("S03 missing approval counts are a word or number, never a mystery mark", () => {
  assert.equal(shared.approvalCountBadgeText(null), "Approvals");
  assert.equal(shared.approvalCountBadgeText(undefined), "Approvals");
  assert.equal(shared.approvalCountBadgeText({ attentionTotal: Number.NaN }), "Approvals");
  assert.equal(shared.approvalCountBadgeText({ attentionTotal: 0 }), "0");
  assert.equal(shared.approvalCountBadgeText({ attentionTotal: 3 }), "3");
  assert.notEqual(shared.approvalCountBadgeText(null), "?");
  assert.notEqual(shared.approvalCountBadgeText({ attentionTotal: 0 }), "?");
  assert.match(shared.approvalCountBadgeText(null), /^(Approvals|\d+)$/);
  assert.match(shared.approvalCountBadgeText({ attentionTotal: 12 }), /^(Approvals|\d+)$/);
});

test("S03 phone drawer first screen is eight rows or fewer after booking is clustered", () => {
  const root = shared.mobileNavRootRows();
  assert.ok(root.length <= shared.APP_NAV_MOBILE_ROOT_MAX_ROWS);
  assert.equal(root.length, 8);
  assert.ok(root.some((item) => item.kind === "cluster" && item.id === "booking" && item.label === "Booking"));
  const booking = shared.mobileNavClusterRows("booking");
  assert.deepEqual(
    booking.map((item) => item.href),
    [
      "/venues",
      "/contacts",
      "/booking",
      "/prospects",
      "/market-sprints",
      "/booking-campaigns",
      "/booking-inbox"
    ]
  );
  assert.ok(!root.some((item) => item.kind === "link" && item.href === "/prospects"));
  assert.equal(shared.mobileNavClusterActive("booking", "/booking-campaigns"), true);
  assert.equal(shared.mobileNavClusterActive("booking", "/tasks"), false);
});

test("S04 muted text at 14px or smaller meets 4.5:1 on app surfaces", () => {
  const css = readFileSync(join(repoRoot, "apps/web/src/app/globals.css"), "utf8");
  const muted = cssToken(css, "--text-muted");
  for (const surface of ["--canvas", "--surface-0", "--surface-subtle", "--surface-1", "--surface-2", "--surface-3"]) {
    const background = cssToken(css, surface);
    assert.ok(
      contrastRatio(muted, background) >= 4.5,
      `${muted} on ${surface} ${background} is ${contrastRatio(muted, background).toFixed(2)}:1`
    );
  }
});

test("S04 skip link, sign-out tap target, and approval dt size stay pinned", () => {
  const shell = readFileSync(join(repoRoot, "apps/web/src/components/app-shell.tsx"), "utf8");
  assert.match(shell, /Skip to content/);
  assert.match(shell, /href="#main"/);
  assert.match(shell, /id="main"/);

  const session = readFileSync(join(repoRoot, "apps/web/src/components/operator-session.tsx"), "utf8");
  assert.match(session, /Sign out/);
  assert.match(session, /min-h-11/);

  const sidebar = readFileSync(join(repoRoot, "apps/web/src/components/app-sidebar.tsx"), "utf8");
  assert.match(sidebar, /<dt className="text-\[11px\]/);
  assert.doesNotMatch(sidebar, /<dt className="text-\[9px\]/);
  assert.doesNotMatch(sidebar, /\?\? ["']\?["']/);
  assert.match(sidebar, /approvalCountBadgeText/);

  const signIn = readFileSync(join(repoRoot, "apps/web/src/components/sign-in-gate.tsx"), "utf8");
  assert.match(signIn, /Continue with Google[\s\S]*min-h-11|min-h-11[\s\S]*Continue with Google/);

  const onboarding = readFileSync(join(repoRoot, "apps/web/src/components/onboarding-gate.tsx"), "utf8");
  assert.match(onboarding, /Create workspace/);
  assert.match(onboarding, /min-h-11/);

  const invite = readFileSync(join(repoRoot, "apps/web/src/app/(standalone)/onboarding/invite-client.tsx"), "utf8");
  assert.match(invite, /Join band/);
  assert.match(invite, /min-h-11 w-full/);
});

test("S08 globals.css defines sb-kicker and surface-subtle between surface-0 and surface-1", () => {
  const css = readFileSync(join(repoRoot, "apps/web/src/app/globals.css"), "utf8");
  const surface0 = cssToken(css, "--surface-0");
  const subtle = cssToken(css, "--surface-subtle");
  const surface1 = cssToken(css, "--surface-1");
  const order = css.match(/--surface-0:[\s\S]*?--surface-subtle:[\s\S]*?--surface-1:/);
  assert.ok(order, "--surface-subtle must be declared between --surface-0 and --surface-1");
  assert.ok(relativeLuminance(surface0) < relativeLuminance(subtle));
  assert.ok(relativeLuminance(subtle) < relativeLuminance(surface1));

  const kicker = css.match(/\.sb-kicker\s*\{([\s\S]*?)\}/);
  assert.ok(kicker, ".sb-kicker must exist");
  assert.match(kicker[1], /11px/);
  assert.match(kicker[1], /uppercase/);
  assert.match(kicker[1], /var\(--accent\)/);
});
