// Contract checks for the currently deployed GitHub Pages + Supabase LINE SaaS.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const saas=path.join(root,"saas");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const client=read("saas/index.html");
const bridge=read("supabase/functions/line-bridge/index.ts");

test("all browser inline module scripts parse",()=>{
 for(const name of ["index.html","directory.html","merchant-register.html"]){
  const html=fs.readFileSync(path.join(saas,name),"utf8");
  const scripts=[...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>0,name+" missing inline module");
  for(const match of scripts){
   const c=spawnSync(process.execPath,["--input-type=module","--check"],{input:match[1],encoding:"utf8"});
   assert.equal(c.status,0,name+": "+c.stderr);
  }
 }
});
test("ticket notifications format the persisted number",()=>{
 assert.match(bridge,/function ticketNumber\(/);
 assert.match(bridge,/ticket\.number_prefix\s*\?\?\s*""/);
 assert.doesNotMatch(bridge,/const actualNumber = "A"/);
 assert.doesNotMatch(bridge,/padStart\(3,\s*"0"\)/);
 assert.match(bridge,/line_call_event_id/);
});
test("verified LINE session resumes without repeating OAuth",()=>{
 assert.match(client,/resumeVerifiedLineSession/);
 assert.match(client,/cleanLineRedirectUri/);
 assert.match(client,/likelyLineApp/);
 assert.match(client,/pendingLiffCallback/);
 assert.match(client,/!force&&!likelyLineApp&&!pendingLiffCallback&&await resumeVerifiedLineSession\(\)/);
 assert.match(client,/!force&&!inLineClient&&!pendingLiffCallback&&await resumeVerifiedLineSession\(\)/);
 assert.match(client,/inLineClient/);
 // A pending LIFF callback must be initialized before the old session is resumed.
 assert.match(bridge,/payload\.action === "resume"/);
 assert.match(bridge,/linked\.login_channel_id !== expectedChannelId/);
});
test("queue progress and call notification share same-day number semantics",()=>{
 assert.match(bridge,/function ticketNumber\(/);
 assert.match(bridge,/number_prefix/);
 assert.match(bridge,/\.eq\("business_date", ticket\.business_date\)/);
 assert.doesNotMatch(bridge,/"目前叫到：A"/);
});
test("P0 notification status is manager-scoped and avoids client-side secrets",()=>{
 const sql=read("supabase/migrations/20261104_line_notice_health_dashboard.sql");
 assert.match(sql,/private\.so_role\(t\.id\)/);
 assert.match(sql,/so_line_notice_health/);
 assert.match(client,/LINE 通知異常｜需管理者處理/);
 assert.match(bridge,/WORKER_UNAUTHORIZED/);
});
test("production admin setup demands verified owner and one-time code",()=>{
 assert.match(client,/so_claim_platform_admin/);
 assert.match(client,/bootstrap-token/);
 assert.match(client,/需要使用已驗證電子郵件/);
});
test("outbox is independently scheduled and authenticated",()=>{
 const sql=read("supabase/migrations/20261104_line_notification_outbox_retries.sql");
 assert.match(sql,/so_line_notice_outbox/);
 assert.match(sql,/line-saas-notification-outbox/);
 assert.match(sql,/on conflict do nothing/i);
 assert.match(bridge,/dispatchPendingNotices/);
 assert.match(bridge,/x-line-worker-key/);
 assert.match(bridge,/WORKER_UNAUTHORIZED/);
});
test("booking is separate from ticket check-in",()=>{
 assert.match(client,/不會自動取號/);
 assert.doesNotMatch(client,/已加入候位名單/);
});
test("merchant booking policy and analytics are wired end to end",()=>{
 assert.match(client,/so_get_booking_policy/);
 assert.match(client,/so_set_booking_policy/);
 assert.match(client,/so_staff_analytics/);
 assert.match(read("supabase/migrations/20261104_line_store_booking_policy.sql"),/so_validate_booking_policy/);
 assert.match(read("supabase/migrations/20261104_line_store_analytics.sql"),/so_staff_analytics/);
});

test("LINE address text links to Google Maps and filters placeholders",()=>{
 const match=bridge.match(/function googleMapsDirectionsUrl\(address: string\): string \| null \{[\s\S]*?\n\}/);
 assert.ok(match,"shared navigation URL builder missing");
 const js=match[0].replace("address: string): string | null","address)");
 const directions=new Function(js+"\nreturn googleMapsDirectionsUrl;")();
 for(const address of ["台北市信義區市府路1號","高雄市前鎮區中華五路789號"]){
  const uri=directions(address);
  assert.ok(uri?.startsWith("https://www.google.com/maps/dir/?api=1&destination="));
  assert.equal(new URL(uri).searchParams.get("destination"),address);
 }
 for(const address of ["","  ","測試用途，無實體地址","僅供測試","示範地址","暫無地址"]){
  assert.equal(directions(address),null,"must not navigate to placeholder: "+address);
 }
 assert.match(bridge,/rows\.flatMap\(\(text\) => \{/);
 assert.match(bridge,/action: \{ type: "uri", label: "Google Maps 導航", uri: mapUrl \}/);
 assert.match(bridge,/text: "開啟 Google Maps 導航"/);
 assert.match(bridge,/label: "編輯預約"/);
 assert.match(bridge,/label: "取消預約"/);
});

test("HQ LIFF endpoint is neutral to all merchant slugs",()=>{
 const workflow=read("../.github/workflows/line-oa-deploy.yml");
 assert.match(workflow,/target = "https:\/\/hub-google\.github\.io\/LINE\/booking\/"/);
 assert.doesNotMatch(workflow,/target = ".*greenfield-salon/);
});
