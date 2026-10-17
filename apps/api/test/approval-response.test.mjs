import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { presentApprovalResponse } = require("../dist/approvals/approval-response.js");

test("presentApprovalResponse preserves processing vs published state consistently for Facebook photo and video results", () => {
  const source = {
    id: "approval",
    actionType: "social_post_batch",
    payload: {
      executionResult: {
        at: "2026-01-01T00:00:00.000Z",
        socialMode: "real",
        results: [
          {
            platform: "facebook",
            deliveryState: "processing",
            isDraftOnly: false,
            externalPostId: "photo-only"
          },
          {
            platform: "facebook",
            deliveryState: "processing",
            isDraftOnly: false,
            externalPostId: "page-1_77"
          }
        ]
      }
    }
  };
  const projected = presentApprovalResponse(source);
  const results = projected.payload.executionResult.results;
  assert.equal(results[0].deliveryState, "processing");
  assert.equal(results[0].posted, false);
  assert.equal(results[0].isDraftOnly, false);
  assert.equal(results[1].deliveryState, "processing");
  assert.equal(results[1].posted, false);
  assert.equal(results[1].isDraftOnly, false);
});
