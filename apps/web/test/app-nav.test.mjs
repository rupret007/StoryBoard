import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidebar = readFileSync(join(root, "src/components/app-sidebar.tsx"), "utf8");

test("S03 phone header badge uses the shared word-or-number helper, never a mystery mark", () => {
  assert.match(sidebar, /approvalCountBadgeText/);
  assert.match(sidebar, /const headerBadge = approvalCountBadgeText\(approvalAttention\)/);
  assert.match(sidebar, /data-testid="approval-count-badge"/);
  assert.match(sidebar, /\{headerBadge\}/);
  assert.doesNotMatch(sidebar, /\?\? ["']\?["']/);
  assert.doesNotMatch(sidebar, /attentionTotal \?\? /);
  assert.doesNotMatch(sidebar, />\s*\?\s*</);
});

test("S03 phone drawer renders clustered booking rows, not the flat 16-item list", () => {
  assert.match(sidebar, /mobileNavRootRows\(\)\.map/);
  assert.match(sidebar, /mobileNavClusterRows\(screen, Boolean\(showTeamLink\)\)/);
  assert.match(sidebar, /variant="mobile"/);
  assert.match(sidebar, /onOpenCluster/);
  assert.match(sidebar, /Back to main navigation/);
  assert.match(sidebar, /aria-haspopup="true"/);
  assert.match(sidebar, /data-testid="mobile-nav-root-rows"/);
  assert.match(sidebar, /data-testid=\{`mobile-nav-\$\{screen\}-rows`\}/);
  assert.match(sidebar, /item\.kind === "cluster"/);
  assert.match(sidebar, /APP_NAV_LINKS\.map/);
});
