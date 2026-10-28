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
  assert.throws(() => shared.completeSocialCaptionDrafts(
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
  ), /No draft was created/);
  const result = shared.completeSocialCaptionDrafts({
    voice: "stalemate",
    note: "Manic live at Burlington, Friday.",
    mediaKind: "video",
    show: { name: "Stalemate at Burlington Bar", place: "Burlington Bar", startsAt: "Friday" }
  });
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

test("caption grounding rejects fabricated links, relative dates, times, and substring price matches", () => {
  const facts = {
    voice: "stalemate",
    note: "Friday, $25, 9pm at Burlington Bar.",
    mediaKind: "video",
    show: { name: "Stalemate at Burlington Bar", ticketUrl: "https://example.com/tickets" }
  };
  for (const caption of [
    "Tickets https://invented.example/tickets",
    "Tickets https://example.com/tickets/surprise",
    "Tickets invented.example/tickets",
    "See you Saturday",
    "Playing tomorrow",
    "Doors 8pm",
    "Show 20:00",
    "See you 10/15",
    "Tickets $2"
  ]) {
    assert.ok(shared.inventedFactsInText(caption, facts).length > 0, caption);
  }
  assert.deepEqual(shared.inventedFactsInText("Friday, 9pm, $25. https://example.com/tickets", facts), []);
});

test("configured caption output requires all platforms and validates every variant and hashtag", () => {
  const input = { voice: "stalemate", note: "Friday at Burlington Bar.", mediaKind: "video" };
  const valid = () => ({
    platforms: ["facebook", "instagram", "youtube", "tiktok"].map((platform) => ({
      platform,
      variants: [
        { caption: "Burlington Bar Friday.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] },
        { caption: "Playing Burlington Bar.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] }
      ]
    }))
  });
  assert.equal(shared.completeSocialCaptionDrafts(input, valid()).source, "llm");
  const partial = valid();
  partial.platforms.pop();
  const duplicate = valid();
  duplicate.platforms[3] = duplicate.platforms[0];
  const inventedThird = valid();
  inventedThird.platforms[0].variants.push({ caption: "Tickets $30", title: "", tags: [] });
  const inventedTag = valid();
  inventedTag.platforms[1].variants[0].tags.push("milwaukee");
  const inventedInlineTag = valid();
  inventedInlineTag.platforms[1].variants[0].caption += " #milwaukee";
  const emptyTitle = valid();
  emptyTitle.platforms[2].variants[0].title = "";
  for (const output of [null, {}, partial, duplicate, inventedThird, inventedTag, inventedInlineTag, emptyTitle]) {
    assert.throws(() => shared.completeSocialCaptionDrafts(input, output), /No draft was created/);
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
