import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loaded = await import(pathToFileURL(join(dir, "..", "dist", "integrations", "adapters", "calendar", "real-google-calendar.adapter.js")).href);
const adapter = loaded.default ?? loaded;
const input = { title: "Bluebird show", start: "2027-01-02T01:00:00.000Z", end: "2027-01-02T03:00:00.000Z", timeZone: "America/Chicago" };

test("confirmed gigs become busy Calendar events while legacy holds remain transparent", () => {
  assert.deepEqual(adapter.googleCalendarEventBody({ ...input, kind: "confirmed" }), {
    summary: "Bluebird show",
    start: { dateTime: input.start, timeZone: input.timeZone },
    end: { dateTime: input.end, timeZone: input.timeZone },
    transparency: "opaque"
  });
  assert.deepEqual(adapter.googleCalendarEventBody(input), {
    summary: "HOLD: Bluebird show",
    start: { dateTime: input.start, timeZone: input.timeZone },
    end: { dateTime: input.end, timeZone: input.timeZone },
    transparency: "transparent"
  });
});
