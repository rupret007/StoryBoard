import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const captions = await load("social/social-caption.service.js");

const input = {
  voice: "stalemate",
  note: "Manic live at Burlington, Friday.",
  mediaKind: "video",
  show: { name: "Stalemate at Burlington Bar", place: "Burlington Bar", startsAt: "Friday" }
};

function config(enabled, key = "sk-test") {
  return {
    get(name) {
      if (name === "OPENAI_ENABLED") return enabled;
      if (name === "OPENAI_API_KEY") return key;
      if (name === "OPENAI_MANAGER_MODEL") return "gpt-5.6-terra";
      return undefined;
    },
    getOrThrow() {
      return key;
    }
  };
}

test("socialCaptionLlmReady is false without a real manager key", () => {
  assert.equal(captions.socialCaptionLlmReady({ OPENAI_ENABLED: false, OPENAI_API_KEY: "replace-me" }), false);
  assert.equal(captions.socialCaptionLlmReady({ OPENAI_ENABLED: true, OPENAI_API_KEY: "replace-me" }), false);
  assert.equal(captions.socialCaptionLlmReady({ OPENAI_ENABLED: true, OPENAI_API_KEY: "sk-test" }), true);
});

test("caption service uses the template and says so when no LLM key is set", async () => {
  const service = new captions.SocialCaptionService(config(false, "replace-me"));
  const result = await service.draft(input);
  assert.equal(result.source, "template");
  assert.match(result.notice, /no LLM key is set/);
  assert.ok(result.drafts.every((row) => row.variants.length >= 2));
});

test("mocked LLM invented facts fall back to the template", async () => {
  const service = new captions.SocialCaptionService(config(true));
  const result = await service.draft(input, {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          platforms: ["facebook", "instagram", "youtube", "tiktok"].map((platform) => ({
            platform,
            variants: [
              { caption: "Doors $25 October 99 in Chicago", title: "October 99", tags: ["chicago"] },
              { caption: "Nashville $40", title: "", tags: ["nashville"] }
            ]
          }))
        })
      })
    }
  });
  assert.equal(result.source, "template");
  assert.match(result.notice, /invented facts|template/i);
  assert.doesNotMatch(result.drafts.find((row) => row.platform === "instagram").caption, /#chicago/i);
});

test("mocked LLM keeps Stalemate and Rad Dad voices on their own facts", async () => {
  const service = new captions.SocialCaptionService(config(true));
  const stalemate = await service.draft(input, {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          platforms: ["facebook", "instagram", "youtube", "tiktok"].map((platform) => ({
            platform,
            variants: [
              { caption: "Burlington Bar Friday.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] },
              { caption: "Playing Burlington Bar.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] }
            ]
          }))
        })
      })
    }
  });
  const radDad = await service.draft(
    {
      voice: "rad_dad",
      note: "Lincoln Hall this Saturday. We will play Mr. Brightside.",
      mediaKind: "photo",
      show: { name: "Rad Dad at Lincoln Hall", place: "Lincoln Hall" }
    },
    {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            platforms: ["facebook", "instagram", "youtube", "tiktok"].map((platform) => ({
              platform,
              variants: [
                { caption: "Lincoln Hall this Saturday. Mr. Brightside!", title: platform === "youtube" ? "Rad Dad at Lincoln Hall" : "", tags: ["raddad"] },
                { caption: "Lincoln Hall Saturday!", title: platform === "youtube" ? "Rad Dad at Lincoln Hall" : "", tags: ["raddad"] }
              ]
            }))
          })
        })
      }
    }
  );
  assert.equal(stalemate.source, "llm");
  assert.equal(radDad.source, "llm");
  assert.match(stalemate.drafts.find((row) => row.platform === "facebook").caption, /Burlington/);
  assert.doesNotMatch(stalemate.drafts.find((row) => row.platform === "facebook").caption, /Lincoln Hall/);
  assert.match(radDad.drafts.find((row) => row.platform === "facebook").caption, /Lincoln Hall/);
  assert.ok(stalemate.drafts.find((row) => row.platform === "tiktok").caption.length <= 150);
  assert.ok(stalemate.drafts.find((row) => row.platform === "instagram").caption.length <= 300);
});
