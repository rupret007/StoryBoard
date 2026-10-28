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

test("mocked LLM invented facts fail closed without fallback drafts", async () => {
  const service = new captions.SocialCaptionService(config(true), { reserve: async () => {} });
  await assert.rejects(service.draft(input, {
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
  }), (error) => error.getStatus() === 503 && /No draft was created/.test(error.message));
});

test("caption provider errors, refusals, and incomplete or malformed responses fail closed with sanitized errors", async () => {
  const service = new captions.SocialCaptionService(config(true), { reserve: async () => {} });
  const responses = [
    async () => { throw new Error("Provider error with sk-synthetic-private-token"); },
    async () => ({ output_text: "" }),
    async () => ({ output_text: "not json" }),
    async () => ({ output_text: "null" }),
    async () => ({ output_text: "{}" }),
    async () => ({ output_text: JSON.stringify({ platforms: [] }) }),
    async () => ({ status: "incomplete", output_text: JSON.stringify(validOutput()) })
  ];
  for (const create of responses) {
    await assert.rejects(service.draft(input, { responses: { create } }), (error) => {
      assert.equal(error.getStatus(), 503);
      assert.match(error.message, /No draft was created/);
      assert.doesNotMatch(JSON.stringify(error.getResponse()), /synthetic-private-token|template/i);
      return true;
    });
  }
});

function validOutput() {
  return {
    platforms: ["facebook", "instagram", "youtube", "tiktok"].map((platform) => ({
      platform,
      variants: [
        { caption: "Burlington Bar Friday.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] },
        { caption: "Playing Burlington Bar.", title: platform === "youtube" ? "Stalemate at Burlington Bar" : "", tags: ["stalemate"] }
      ]
    }))
  };
}

test("caption provider output cannot silently mix generated and template platforms", async () => {
  const service = new captions.SocialCaptionService(config(true), { reserve: async () => {} });
  const missing = validOutput();
  missing.platforms.pop();
  const duplicate = validOutput();
  duplicate.platforms[3] = duplicate.platforms[0];
  const invalidVariant = validOutput();
  invalidVariant.platforms[2].variants.push({ caption: "Buy tickets https://invented.example/tickets", title: "Stalemate", tags: [] });
  const empty = validOutput();
  empty.platforms[1].variants[0].caption = " ";
  for (const output of [missing, duplicate, invalidVariant, empty]) {
    await assert.rejects(service.draft(input, {
      responses: { create: async () => ({ output_text: JSON.stringify(output) }) }
    }), (error) => error.getStatus() === 503 && /No draft was created/.test(error.message));
  }
});

test("mocked LLM keeps Stalemate and Rad Dad voices on their own facts", async () => {
  const service = new captions.SocialCaptionService(config(true), { reserve: async () => {} });
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
