import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const modulePath = require.resolve("../dist/recorded-show-time.js");
const { formatRecordedShowTime } = require(modulePath);

function onDevice(timezone, recordedZone) {
  return execFileSync(process.execPath, ["-e", `console.log(require(${JSON.stringify(modulePath)}).formatRecordedShowTime("2030-06-16T00:30:00Z", ${JSON.stringify(recordedZone)}))`], { env: { ...process.env, TZ: timezone }, encoding: "utf8" }).trim();
}

test("recorded evening keeps its date on UTC and Tokyo devices", () => {
  for (const device of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
    const display = onDevice(device, "America/Chicago");
    assert.match(display, /Jun 15, 2030/);
    assert.match(display, /7:30 PM CDT/);
    assert.equal(display, onDevice("UTC", "America/Chicago"));
  }
});

test("daylight-saving offsets distinguish repeated recorded clock times", () => {
  assert.match(formatRecordedShowTime("2026-11-01T06:30:00Z", "America/Chicago"), /1:30 AM CDT/);
  assert.match(formatRecordedShowTime("2026-11-01T07:30:00Z", "America/Chicago"), /1:30 AM CST/);
});

test("missing and invalid timezone use labeled UTC identically during SSR and on a device", () => {
  for (const zone of [null, "", "Not/A_Timezone"]) {
    const display = onDevice("Asia/Tokyo", zone);
    assert.equal(display, onDevice("America/Chicago", zone));
    assert.match(display, /Jun 16, 2030.*12:30 AM UTC/);
    assert.match(display, zone ? /recorded timezone is invalid/ : /timezone not recorded/);
  }
});

test("missing and invalid dates remain explicit without a fabricated time", () => {
  assert.equal(formatRecordedShowTime(null, "America/Chicago"), "Date not recorded");
  assert.equal(formatRecordedShowTime(undefined), "Date not recorded");
  assert.equal(formatRecordedShowTime("bad-date", "America/Chicago"), "Recorded date is invalid");
});
