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

test("only Queue Monster platform OA accepts webhook events; merchant configuration exposes no endpoint", () => {
  const own=readFileSync(path.join(root,"saas/app/staff/oa-settings.js"),"utf8");
  const actions=readFileSync(path.join(root,"saas/app/actions/merchant-settings.js"),"utf8");
  assert.doesNotMatch(own,/Webhook URL|own-oa-webhook|copy-oa-webhook|oa-webhook-section/);
  assert.doesNotMatch(actions,/copy-oa-webhook|Use webhook/);
  assert.match(bridge,/url\.searchParams\.has\("merchant"\)\) return reply\(200, \{ok:true,ignored:true\}, origin\)/);
  assert.match(bridge,/return webhook\(req, origin\)/);
  assert.doesNotMatch(bridge,/webhookUrl:/);
  assert.match(bridge,/LINE_MESSAGING_CHANNEL_SECRET/);
});

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

test("LINE OA uses exactly three Quick Replies with queue-domain services and a history-scoped LIFF URL", () => {
  const items=[...bridge.matchAll(/\{type:"(?:uri|postback)",label:"([^"]+)"/g)]
    .map(match=>match[1]);
  assert.deepEqual(items, ["免費體驗","操作教學","歷史紀錄"]);
  assert.match(bridge, /label:"免費體驗",uri:PLATFORM_ENTRY\+"demo\.html"/);
  assert.match(bridge, /label:"操作教學",data:"platform:guide",displayText:"操作教學"/);
  assert.match(bridge, /label:"歷史紀錄",uri:platformRecordsLink\("history"\)/);
  assert.match(bridge, /site_return:destination/);
  assert.match(bridge, /scope === "history" \? "\?scope=history"/);
  assert.match(bridge, /PLATFORM_GUIDE_REPLY = "操作教學可依身分查看：/);
  assert.match(bridge, /PLATFORM_ENTRY\+"for-customers\.html/);
  assert.match(bridge, /PLATFORM_ENTRY\+"merchant-center\.html#guide"/);
  assert.match(bridge, /quickReply:platformQuickReply\(\)/);
  assert.doesNotMatch(bridge, /label:"現場取號",uri:platformDirectoryLink\("取號"\)/);
  assert.doesNotMatch(bridge, /label:"線上預約",uri:platformDirectoryLink\("預約"\)/);
});

test("rich-menu feedback and quick-reply guide respond inside the existing LINE OA", () => {
  assert.match(richMenu, /"問題回饋".*"platform:feedback"/);
  assert.match(bridge, /command === "platform:feedback" \|\| command === "platform:guide"/);
  assert.match(bridge, /command === "platform:guide" \? PLATFORM_GUIDE_REPLY : PLATFORM_FEEDBACK_REPLY/);
  assert.match(bridge, /PLATFORM_FEEDBACK_REPLY = "請在此留下您想反饋的問題或建議，若為操作問題或系統問題，可留下截圖方便確認。"/);
  assert.doesNotMatch(richMenu, /github\.io/);
});

test("existing followers can reveal Quick Replies without unfriending or waiting for greeting", () => {
  assert.match(bridge, /選單\|功能選單\|快速回覆\|快捷選單\|主選單\|顯示選單/);
  assert.match(bridge, /return platformMenuCard\(\)/);
  assert.match(bridge, /type:"template"/);
  assert.match(bridge, /type:"buttons",title:"排隊怪獸｜快捷功能"/);
  assert.match(bridge, /actions:platformQuickActions\(\)/);
  assert.match(bridge, /items:platformQuickActions\(\)\.map/);
  assert.match(bridge, /text:PLATFORM_FEEDBACK_REPLY,quickReply:platformQuickReply\(\)/);
  assert.match(bridge, /\{type:"text",text,quickReply:platformQuickReply\(\)\}/);
  assert.match(bridge, /text: PLATFORM_FEEDBACK_REPLY, quickReply: platformQuickReply\(\)/);
});

test("bot links to working public booking entry points without bypassing verified identity", () => {
  assert.match(bridge, /directory\.html\?mode=search/);
  assert.match(bridge, /my-records\.html/);
  assert.match(bridge, /function platformRecordsLink\(scope: "all" \| "history" = "all"\)/);
  assert.match(bridge, /const liffId = Deno\.env\.get\("LINE_LIFF_ID_QUEUE"\) \|\| "";/);
  assert.match(bridge, /site_return:destination/);
  assert.match(bridge, /https:\/\/queue\.monsterport\.com\//);
  assert.doesNotMatch(bridge, /link = PLATFORM_ENTRY\+"my-records\.html"/);
  assert.doesNotMatch(bridge, /directory\.html\?mode=mine&section=(ticket|order)/);
  assert.match(bridge, /my-records\.html/);
  assert.match(bridge, /merchant-register\.html/);
  assert.match(bridge, /歡迎加入排隊怪獸！/);
  assert.match(bridge, /platformDirectoryLink\("點餐"\)/);
  assert.match(bridge, /entry:"platform-oa"/);
  assert.match(bridge, /return "https:\/\/liff\.line\.me\/"/);
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
  const oaSettings=readFileSync(path.join(root,"saas/app/staff/oa-settings.js"),"utf8");
  const action=readFileSync(path.join(root,"saas/app/actions/merchant-settings.js"),"utf8");
  const guide=readFileSync(path.join(root,"saas/merchant-center.html"),"utf8");
  assert.match(settings,/renderOaSettings\(/);
  assert.match(oaSettings,/Channel access token \(long-lived\)/);
  assert.match(oaSettings,/Channel secret/);
  assert.doesNotMatch(oaSettings,/own-oa-channel-id/);
  assert.doesNotMatch(action,/own-oa-channel-id|messagingChannelId:channelId/);
  assert.match(action,/connect-merchant-oa/);
  assert.match(bridge,/fetch\("https:\/\/api\.line\.me\/v2\/oauth\/verify"/);
  assert.match(bridge,/const messagingChannelId = String\(tokenDetails\.client_id/);
  assert.doesNotMatch(bridge,/payload\.messagingChannelId/);
  assert.match(bridge,/so_merchant_oa_save_messaging_secret/);
  assert.match(guide,/https:\/\/developers\.line\.biz\/console\//);
  assert.match(guide,/單純發送 LINE 通知，不需要設定 LIFF ID/);
});

test("merchants cannot override Queue Monster LINE Login; OA messaging remains independent", () => {
  const ui=readFileSync(path.join(root,"saas/app/staff/oa-settings.js"),"utf8");
  const actions=readFileSync(path.join(root,"saas/app/actions/merchant-settings.js"),"utf8");
  assert.doesNotMatch(ui,/own-oa-liff|merchantLiffId|進階設定：LINE Login/);
  assert.doesNotMatch(actions,/own-oa-liff|liffId,botToken/);
  assert.match(bridge,/const liffId = platformLiff/);
  assert.match(bridge,/expectedChannelId === Deno.env.get\("LINE_LOGIN_CHANNEL_ID"\)/);
  assert.doesNotMatch(bridge,/own\?\.liff_id|ownOa\?\.liffId|merchantLiffId|shop\.liffId/);
  assert.match(bridge,/p_liff_id:""/);
  assert.match(bridge,/if \(\(!linked\?\.display_name\?\.trim\(\) \|\|/);
  assert.match(bridge,/const id=platformCustomerLiffId\(\)/);
  assert.match(bridge,/ownOa\?\.token/);
  assert.match(bridge,/LINE_MESSAGING_ACCESS_TOKEN/);
});

test("merchant OA settings omit legacy LINE Login fields and credential/disconnect controls", () => {
  const oaSettings=readFileSync(path.join(root,"saas/app/staff/oa-settings.js"),"utf8");
  const action=readFileSync(path.join(root,"saas/app/actions/merchant-settings.js"),"utf8");
  assert.doesNotMatch(oaSettings,/進階設定：LINE Login|own-oa-liff|LIFF ID/);
  assert.doesNotMatch(oaSettings,/更換憑證|解除綁定|取消更換|replace-own-oa|disconnect-own-oa/);
  assert.doesNotMatch(action,/replace-own-oa|disconnect-own-oa|cancel-replace-own-oa/);
  assert.match(oaSettings,/!connected\?'<div class="oa-settings-actions">/);
  assert.match(oaSettings,/btn\("驗證並連接 LINE OA","connect-own-oa","primary"\)/);
  assert.match(oaSettings,/savedCredential\("Channel access token \(long-lived\)",/);
  assert.match(oaSettings,/savedCredential\("Channel secret",/);
  assert.doesNotMatch(oaSettings,/copy-oa-webhook|own-oa-webhook|Webhook URL/);
});
