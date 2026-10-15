import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("Stalemate drafts stay dry, keep show facts, and never hardcode Chicago", () => {
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
  assert.doesNotMatch(instagram.caption, /#chicago/i);
  assert.ok(!instagram.tags.includes("chicago"));
  assert.ok(youtube.title);
  assert.ok(tiktok.caption.length <= facebook.caption.length);
  assert.ok(instagram.variants.length >= 2);
  assert.ok(tiktok.caption.length <= shared.SOCIAL_CAPTION_LIMITS.tiktok.caption);
});

test("Rad Dad drafts stay crowd-first and do not inherit Stalemate dryness", () => {
  const drafts = shared.draftPlatformCaptions({
    voice: "rad_dad",
    note: "Lincoln Hall this Saturday. We will play Mr. Brightside.",
    mediaKind: "photo",
    show: { name: "Rad Dad at Lincoln Hall", place: "Lincoln Hall" }
  });
  const facebook = drafts.find((row) => row.platform === "facebook");
  const instagram = drafts.find((row) => row.platform === "instagram");
  assert.match(facebook.caption, /Lincoln Hall/i);
  assert.match(facebook.caption, /!/);
  assert.doesNotMatch(instagram.caption, /#chicago/i);
  assert.equal(shared.instagramUsesReel("video"), true);
  assert.equal(shared.instagramUsesReel("photo"), false);
});

test("Chicago hashtags appear only when Chicago is in the confirmed facts", () => {
  const withCity = shared.draftPlatformCaptions({
    voice: "rad_dad",
    note: "Friday at Lincoln Hall.",
    mediaKind: "photo",
    show: { name: "Rad Dad in Chicago", place: "Lincoln Hall, Chicago" }
  });
  const instagram = withCity.find((row) => row.platform === "instagram");
  assert.ok(instagram.tags.includes("chicago") || /#chicago/i.test(instagram.caption));
});

test("completeSocialCaptionDrafts drops invented prices, dates, and cities", () => {
  const result = shared.completeSocialCaptionDrafts(
    {
      voice: "stalemate",
      note: "Manic live at Burlington, Friday.",
      mediaKind: "video",
      show: { name: "Stalemate at Burlington Bar", place: "Burlington Bar", startsAt: "Friday" }
    },
    {
      platforms: [
        {
          platform: "facebook",
          variants: [
            { caption: "Doors $25 October 99 in Chicago", title: "", tags: ["chicago"] },
            { caption: "Secret venue in Nashville $40", title: "", tags: ["nashville"] }
          ]
        },
        {
          platform: "instagram",
          variants: [
            { caption: "$25 Chicago October 99", title: "", tags: ["chicago"] },
            { caption: "Nashville $40", title: "", tags: ["nashville"] }
          ]
        },
        {
          platform: "youtube",
          variants: [
            { caption: "$25 Chicago", title: "October 99", tags: ["chicago"] },
            { caption: "Nashville", title: "Secret show", tags: [] }
          ]
        },
        {
          platform: "tiktok",
          variants: [
            { caption: "$25 Chicago", title: "", tags: ["chicago"] },
            { caption: "Nashville", title: "", tags: [] }
          ]
        }
      ]
    }
  );
  assert.equal(result.source, "template");
  assert.match(result.notice, /template/i);
  for (const draft of result.drafts) {
    assert.equal(
      shared.inventedFactsInText(`${draft.caption} ${draft.title ?? ""} ${draft.tags.join(" ")}`, {
        voice: "stalemate",
        note: "Manic live at Burlington, Friday.",
        mediaKind: "video",
        show: { name: "Stalemate at Burlington Bar", place: "Burlington Bar", startsAt: "Friday" }
      }).length,
      0
    );
  }
});

test("social caption evals cover facts, voice, and length with a mocked LLM", () => {
  const evals = shared.runSocialCaptionEvaluation();
  assert.equal(evals.passed, true, evals.results.filter((row) => !row.passed).map((row) => row.name).join(", "));
  assert.deepEqual(
    evals.results.map((row) => row.name).sort(),
    ["length-limits", "no-invented-facts", "template-has-no-hardcoded-chicago", "voice-separation"].sort()
  );
});
