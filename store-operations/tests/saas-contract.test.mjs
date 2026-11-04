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
 for(const name of ["index.html","directory.html","merchant-register.html","merchant-center.html"]){
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
 assert.match(bridge,/payload\.action === "resume"/);
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
