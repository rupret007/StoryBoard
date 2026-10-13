import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

test("S07 muted token is not the failing #64748b and meets 4.5:1 on every surface", () => {
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const muted = cssToken(css, "--text-muted");
  assert.notEqual(muted.toLowerCase(), "#64748b");
  for (const surface of ["--canvas", "--surface-0", "--surface-subtle", "--surface-1", "--surface-2", "--surface-3"]) {
    const background = cssToken(css, surface);
    const ratio = contrastRatio(muted, background);
    assert.ok(ratio >= 4.5, `${muted} on ${surface} ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test("S07 skip link is the first chrome control and lands on main", () => {
  const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
  assert.match(shell, /<div className="flex min-h-screen">\s*<a[\s\S]*?href="#main"[\s\S]*?>[\s\S]*?Skip to content/);
  assert.match(shell, /<main id="main"/);
  assert.match(shell, /focus:min-h-11/);
  const skipIndex = shell.indexOf("Skip to content");
  const sidebarIndex = shell.indexOf("<AppSidebar");
  const mainIndex = shell.indexOf('<main id="main"');
  assert.ok(skipIndex !== -1 && sidebarIndex !== -1 && skipIndex < sidebarIndex);
  assert.ok(mainIndex !== -1 && skipIndex < mainIndex);
});

test("S07 Sign out is a min-h-11 target and approval labels stay at 11px", () => {
  const session = readFileSync(join(root, "src/components/operator-session.tsx"), "utf8");
  assert.match(session, /min-h-11[\s\S]{0,240}Sign out/);

  const sidebar = readFileSync(join(root, "src/components/app-sidebar.tsx"), "utf8");
  assert.match(sidebar, /<dt className="text-\[11px\]/);
  assert.doesNotMatch(sidebar, /<dt className="text-\[9px\]/);
  assert.match(
    sidebar,
    /text-\[11px\] font-semibold uppercase tracking-wider text-\[var\(--text-muted\)\]">Approvals</
  );

  const signIn = readFileSync(join(root, "src/components/sign-in-gate.tsx"), "utf8");
  assert.match(signIn, /min-h-11[\s\S]{0,280}Continue with Google/);

  const onboarding = readFileSync(join(root, "src/components/onboarding-gate.tsx"), "utf8");
  assert.match(onboarding, /min-h-11[\s\S]{0,280}Create workspace/);

  const invite = readFileSync(join(root, "src/app/(standalone)/onboarding/invite-client.tsx"), "utf8");
  assert.match(invite, /min-h-11 w-full[\s\S]{0,240}Join band/);
});
