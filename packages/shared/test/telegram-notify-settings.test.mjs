import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(
  pathToFileURL(join(dir, "../dist/schemas/telegram-notify-settings.js")).href
);

test("mergeTelegramNotifyCategories tolerates bad stored json", () => {
  const merged = shared.mergeTelegramNotifyCategories({ bogus: true });
  assert.equal(merged.approvals, false);
  assert.equal(merged.overdueTasks, false);
});

test("artistTelegramSettingsPatchSchema accepts chat id trim", () => {
  const r = shared.artistTelegramSettingsPatchSchema.safeParse({
    telegramChatId: "  123  "
  });
  assert.equal(r.success, true);
  assert.equal(r.success ? r.data.telegramChatId : null, "  123  ");
});
