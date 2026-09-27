import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);

const { DFW_VENUE_PACK_CANONICAL, VENUE_PACK_REGISTRY } = await load("dfw-venue-packs.js");

test("DFW venue pack canonical list covers every packed room", () => {
  assert.equal(DFW_VENUE_PACK_CANONICAL.length, 12);
  const names = DFW_VENUE_PACK_CANONICAL.map((row) => row.name);
  assert.ok(names.includes("Birdie's Social Club"));
  assert.ok(names.includes("Club Dada"));
});

test("venue pack registry keeps alias keys for manager lookup", () => {
  assert.equal(VENUE_PACK_REGISTRY["birdies social club"]?.email, "hiring@birdiessocialclub.com");
  assert.equal(VENUE_PACK_REGISTRY["kessler theater"]?.email, "booking@kesslerpresents.com");
  assert.equal(VENUE_PACK_REGISTRY["granada theater"]?.email, "booking@granadatheater.com");
});
