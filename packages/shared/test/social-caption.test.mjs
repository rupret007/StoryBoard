import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("Stalemate drafts stay dry and suggest a Facebook Event for a show", () => {
  const drafts = shared.draftPlatformCaptions({
    voice: "stalemate",
    note: "Manic live at Burlington, Friday. Excited to announce it!",
    mediaKind: "video",
    show: {
      name: "Stalemate at Burlington Bar",
      startsAt: "Friday 9pm",
      place: "Burlington Bar",
      ticketUrl: "https://example.com/tickets"
    }
  });
  const facebook = drafts.find((row) => row.platform === "facebook");
  const instagram = drafts.find((row) => row.platform === "instagram");
  const youtube = drafts.find((row) => row.platform === "youtube");
  const tiktok = drafts.find((row) => row.platform === "tiktok");
  assert.ok(facebook.includeFacebookEvent);
  assert.doesNotMatch(facebook.caption, /excited to announce/i);
  assert.match(facebook.caption, /Burlington/);
  assert.match(instagram.caption, /#stalemate/);
  assert.ok(youtube.title);
  assert.ok(tiktok.caption.length <= facebook.caption.length);
});

test("Rad Dad drafts stay crowd-first and do not inherit Stalemate dryness", () => {
  const drafts = shared.draftPlatformCaptions({
    voice: "rad_dad",
    note: "Lincoln Hall this Saturday. We will play Mr. Brightside.",
    mediaKind: "photo",
    show: { name: "Rad Dad at Lincoln Hall", place: "Lincoln Hall" }
  });
  const facebook = drafts.find((row) => row.platform === "facebook");
  assert.match(facebook.caption, /group chat|Lincoln Hall/i);
  assert.equal(shared.instagramUsesReel("video"), true);
  assert.equal(shared.instagramUsesReel("photo"), false);
});
