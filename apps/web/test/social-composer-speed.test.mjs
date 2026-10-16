import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social composer starts a new drop, media first, before Connect", () => {
  assert.match(client, /defaultActiveSocialPost\(\)/);
  assert.doesNotMatch(client, /useState<SocialPost \| null>\(initial\?\.posts\[0\]/);
  const composerAt = client.indexOf('data-testid="social-composer"');
  const dropzoneAt = client.indexOf('data-testid="social-file-dropzone"');
  const noteAt = client.indexOf('placeholder="Manic live at Burlington, Friday"');
  const connectAt = client.indexOf('data-testid="social-connect-accounts"');
  assert.ok(composerAt > 0 && dropzoneAt > composerAt);
  assert.ok(noteAt > dropzoneAt, "Official upload-first flows put the file ahead of the caption note");
  assert.ok(connectAt > composerAt, "Connect accounts stay below the posting composer");
});

test("Approve & post is sticky on a phone and stays off after a recorded send", () => {
  assert.match(client, /sticky bottom-3/);
  assert.match(client, /data-testid="social-already-posted"/);
  assert.match(client, /disabled=\{!approveEnabled\}/);
  assert.match(client, /data-testid="social-recorded-show"/);
});
