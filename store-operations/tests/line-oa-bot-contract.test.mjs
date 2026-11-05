import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = readFileSync(path.join(root, "supabase/functions/line-bridge/index.ts"), "utf8");
const directory = readFileSync(path.join(root, "saas/directory.html"), "utf8");
const richMenu = readFileSync(path.join(root, "../.github/scripts/publish_rich_menu.py"), "utf8");

test("platform OA accepts signed text events without intercepting merchant-owned OA messages", () => {
  assert.match(bridge, /\["follow", "unfollow", "postback", "message"\]/);
  assert.match(bridge, /if \(event\.type === "message"\)/);
  assert.match(bridge, /if \(merchantTenantId\) continue;/);
  assert.match(bridge, /await replyToLine\(token,replyToken,platformBotMessage\(message\.text\),redelivery\)/);
  assert.match(bridge, /x-line-signature/);
});

test("follow greeting is gated, deduplicated and never sent from an own-OA channel", () => {
  assert.match(bridge, /if \(event\.type === "follow" && !merchantTenantId/);
  assert.match(bridge, /LINE_PLATFORM_WELCOME_REPLY/);
  assert.match(bridge, /outcome === "PROCESSED"/);
  assert.match(bridge, /LINE_REPLY_FAILED_/);
});

test("bot links to working public booking entry points without bypassing verified identity", () => {
  assert.match(bridge, /directory\.html\?mode=search/);
  assert.match(bridge, /directory\.html\?mode=queue/);
  assert.match(bridge, /directory\.html\?mode=mine/);
  assert.match(bridge, /merchant-register\.html/);
  assert.match(richMenu, /CUSTOMER_ALIAS = "platform-booking-customers"/);
  assert.match(richMenu, /MERCHANT_ALIAS = "platform-booking-merchants"/);
  assert.doesNotMatch(directory, /href="merchant-center\.html#activate"/);
});
