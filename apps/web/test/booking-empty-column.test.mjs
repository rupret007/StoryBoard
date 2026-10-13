import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/booking/booking-client.tsx"), "utf8");

test("empty booking stages stay labeled on desktop, with mobile-only stage-switcher copy", () => {
  assert.match(
    client,
    /No opportunities in \{stage\}\.<span className="sm:hidden"> Choose another stage to see this band's recorded deals\.<\/span>/
  );
  assert.doesNotMatch(client, /sm:hidden">No opportunities in \{stage\}/);
});
