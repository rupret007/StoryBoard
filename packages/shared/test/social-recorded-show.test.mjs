import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("drop schema rejects a client-invented show object", () => {
  const invented = shared.socialDropInputSchema.safeParse({
    note: "Manic live tonight",
    show: {
      name: "Secret Chicago headline",
      startsAt: "October 99",
      place: "Nashville",
      ticketUrl: "https://example.com/tickets"
    }
  });
  assert.equal(invented.success, false);
  assert.match(JSON.stringify(invented.error.issues), /unrecognized|show/i);
});

test("drop schema accepts a recorded event id and no show object", () => {
  const parsed = shared.socialDropInputSchema.parse({
    note: "Manic live at Burlington",
    eventId: "evt-burlington"
  });
  assert.equal(parsed.eventId, "evt-burlington");
  assert.equal("show" in parsed, false);
});

test("recorded show facts copy only title, start, and place", () => {
  const show = shared.recordedSocialShowFromEvent({
    title: " Stalemate at Burlington Bar ",
    startsAt: new Date("2026-10-17T02:30:00.000Z"),
    locationName: " Burlington Bar "
  });
  assert.deepEqual(show, {
    name: "Stalemate at Burlington Bar",
    startsAt: "2026-10-17T02:30:00.000Z",
    place: "Burlington Bar"
  });
  assert.equal("ticketUrl" in show, false);
});

test("a missing or unknown event id never invents a show", () => {
  assert.equal(shared.resolveRecordedSocialShow({ eventId: undefined, event: null }), null);
  assert.equal(
    shared.resolveRecordedSocialShow({
      eventId: "",
      event: { title: "Should not be used" }
    }),
    null
  );
  assert.throws(
    () => shared.resolveRecordedSocialShow({ eventId: "evt-missing", event: null }),
    (error) =>
      error instanceof Error && error.message === shared.SOCIAL_SHOW_NOT_RECORDED
  );
});

test("invalid recorded timestamps stay omitted instead of becoming a caption date", () => {
  const show = shared.recordedSocialShowFromEvent({
    title: "Practice",
    startsAt: "not-a-date",
    locationName: ""
  });
  assert.deepEqual(show, { name: "Practice" });
});
