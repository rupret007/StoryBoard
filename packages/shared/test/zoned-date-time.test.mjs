import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("formats and parses an instant in the event's IANA timezone", () => {
  assert.deepEqual(shared.instantToDateTimeLocal("2026-07-12T01:30:00.000Z", "America/Chicago"), {
    ok: true,
    value: "2026-07-11T20:30"
  });
  assert.deepEqual(shared.dateTimeLocalToIso("2026-07-11T20:30", "America/Chicago"), {
    ok: true,
    value: "2026-07-12T01:30:00.000Z"
  });
});

test("rejects a daylight-saving gap instead of silently moving the event", () => {
  const result = shared.dateTimeLocalToIso("2026-03-08T02:30", "America/Chicago");
  assert.equal(result.ok, false);
  assert.equal(result.code, "nonexistent_local_time");
  assert.match(result.message, /does not exist/);
});

test("rejects a daylight-saving overlap instead of choosing an arbitrary instant", () => {
  const result = shared.dateTimeLocalToIso("2026-11-01T01:30", "America/Chicago");
  assert.equal(result.ok, false);
  assert.equal(result.code, "ambiguous_local_time");
  assert.match(result.message, /occurs twice/);
});

test("rejects invalid calendar values and IANA timezones", () => {
  assert.equal(shared.dateTimeLocalToIso("2026-02-30T19:00", "America/Chicago").code, "invalid_local_datetime");
  assert.equal(shared.dateTimeLocalToIso("2026-07-11T20:30", "Not/A_Timezone").code, "invalid_timezone");
  assert.equal(shared.instantToDateTimeLocal("2026-07-12T01:30:00.000Z", "Not/A_Timezone").code, "invalid_timezone");
  assert.equal(shared.isValidIanaTimeZone("America/Chicago"), true);
  assert.equal(shared.isValidIanaTimeZone("Not/A_Timezone"), false);
  assert.equal(shared.isValidIanaTimeZone(""), false);
});

test("retains device-local behavior only when an event timezone is absent", () => {
  const instant = "2026-07-12T01:30:00.000Z";
  const date = new Date(instant);
  const expected = `${date.getFullYear().toString().padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const formatted = shared.instantToDateTimeLocal(instant, null);
  assert.deepEqual(formatted, { ok: true, value: expected });
  assert.deepEqual(shared.dateTimeLocalToIso(formatted.value, null), {
    ok: true,
    value: new Date(formatted.value).toISOString()
  });
});
