import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "./helpers/source-fs.mjs";
import { existsSync } from "node:fs";
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
  assert.match(bridge, /directory\.html\?mode=mine/);
  assert.doesNotMatch(bridge, /directory\.html\?mode=mine&section=(ticket|order)/);
  assert.match(bridge, /directory\.html\?mode=mine/);
  assert.match(bridge, /merchant-register\.html/);
  assert.match(bridge, /歡迎加入排隊怪獸！/);
  assert.match(bridge, /service=%E9%BB%9E%E9%A4%90/);
  assert.match(bridge, /MERCHANT_OA_NOT_CONNECTED/);
  assert.doesNotMatch(bridge, /merchantOa\?\.token \|\| Deno\.env\.get\("LINE_MESSAGING_ACCESS_TOKEN"\)/);
  assert.match(richMenu, /CUSTOMER_ALIAS = "platform-booking-customers"/);
  assert.match(richMenu, /排隊怪獸｜預約取號/);
  assert.match(richMenu, /MERCHANT_ALIAS = "platform-booking-merchants"/);
  assert.doesNotMatch(directory, /href="merchant-center\.html#activate"/);
});

test("FoodRadar daily LINE report is explicit opt-in and never broadcasts arbitrary followers", () => {
  const retiredWorkflow = path.join(root, "../.github/workflows/foodradar-daily-line-report.yml");
  assert.equal(existsSync(retiredWorkflow),false,"Retired FoodRadar daily workflow must not reappear");
  const migration = readFileSync(path.join(root, "supabase/migrations/20261109_foodradar_line_daily_report_subscriptions.sql"), "utf8");
  assert.match(bridge, /訂閱foodradar/);
  assert.match(bridge, /取消foodradar訂閱/);
  assert.match(bridge, /foodradar_line_subscriptions/);
  assert.match(bridge, /foodradar-subscribers/);
  assert.match(bridge, /foodradar-subscribers:"\+day/);
  assert.match(bridge, /crypto\.subtle\.sign/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE/);
  assert.doesNotMatch(bridge, /\/v2\/bot\/message\/broadcast/);
});

test("merchant OA Messaging API form requires only token and secret, deriving Channel ID in backend", () => {
  const settings=readFileSync(path.join(root,"saas/app/staff/settings.js"),"utf8");
  const action=readFileSync(path.join(root,"saas/app/actions/merchant-settings.js"),"utf8");
  const guide=readFileSync(path.join(root,"saas/merchant-center.html"),"utf8");
  assert.match(settings,/Channel access token \(long-lived\)/);
  assert.match(settings,/Channel secret/);
  assert.doesNotMatch(settings,/own-oa-channel-id/);
  assert.doesNotMatch(action,/own-oa-channel-id|messagingChannelId:channelId/);
  assert.match(action,/connect-merchant-oa/);
  assert.match(bridge,/fetch\("https:\/\/api\.line\.me\/v2\/oauth\/verify"/);
  assert.match(bridge,/const messagingChannelId = String\(tokenDetails\.client_id/);
  assert.doesNotMatch(bridge,/payload\.messagingChannelId/);
  assert.match(bridge,/so_merchant_oa_save_messaging_secret/);
  assert.match(guide,/https:\/\/developers\.line\.biz\/console\//);
  assert.match(guide,/單純發送 LINE 通知，不需要設定 LIFF ID/);
});
