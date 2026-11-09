import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";

const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/20261104_queue_customer_hold_resume_policy.sql",import.meta.url),"utf8");

test("K06: hold/resume requires authenticated, linked customer ownership",()=>{
  assert.match(sql,/create or replace function public\.so_customer_hold_ticket\(/i);
  assert.match(sql,/viewer\.user_id=auth\.uid\(\)/);
  assert.match(sql,/linked\.user_id=k\.user_id/);
  assert.match(sql,/tenant\.status='ACTIVE'/);
  assert.match(sql,/revoke all on function public\.so_customer_hold_ticket/);
  assert.match(sql,/for update of tenant/);
});

test("K06: hold is bounded, auditable, reversible and independent of booking",()=>{
  assert.match(sql,/hold_count=hold_count\+1/);
  assert.match(sql,/hold_until=now\(\)\+make_interval/);
  assert.match(sql,/queue_hold_start/);
  assert.match(sql,/queue_hold_resume/);
  assert.match(sql,/return_mode in \('END','ORIGINAL'\)/);
  assert.doesNotMatch(sql,/\btruncate\s+table\b/i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.so_tickets\b/i);
  assert.doesNotMatch(sql,/set\s+ticket_no\s*=/i);
});

test("K06: call-next uses queue ordering, and expiry does not reset numbers",()=>{
  assert.match(sql,/k\.status='HOLD'/);
  assert.match(sql,/k\.hold_until<=now\(\)/);
  assert.match(sql,/order by business_date,queue_joined_at,ticket_no,id limit 1 for update/);
  assert.match(sql,/status in \('WAITING','HOLD','CALLED','SERVING','PASSED'\)/);
  assert.match(sql,/status in \('WAITING','HOLD'\) returning \* into k;/);
});

test("K06: customer and staff use the same RPC and show hold states",()=>{
  assert.match(ui,/HOLD:"保留候位"/);
  assert.match(ui,/hold-my-number/);
  assert.match(ui,/resume-my-number/);
  assert.match(ui,/so_customer_hold_ticket/);
  assert.match(ui,/save-hold-policy/);
  assert.match(ui,/so_set_queue_hold_policy/);
  assert.match(ui,/held=openTickets\.filter/);
  assert.match(ui,/queue_hold_policy\?\.hold_minutes/);
});

test("K06: HOLD tickets persist in public and cross-store owned projections",()=>{
  assert.match(sql,/create or replace function public\.so_public_state\(/i);
  assert.match(sql,/create or replace function public\.so_customer_cross_store_overview\(/i);
  assert.match(sql,/k\.status in \('WAITING','HOLD','CALLED','SERVING','PASSED'\)/);
  assert.match(sql,/'hold_until',k\.hold_until/);
  assert.match(sql,/queue_joined_at,ahead\.id/);
});

const currentCallFix=readFileSync(new URL("../supabase/migrations/20261109153000_staff_call_hold_alias_fix.sql",import.meta.url),"utf8");
test("K06: live call HOLD expiry avoids variable and table alias collisions",()=>{
 assert.ok(currentCallFix.includes("pg_get_functiondef('public.so_staff_action"));
 assert.ok(currentCallFix.includes("update public.so_tickets hold_ticket set"));
 assert.ok(currentCallFix.includes("replace(v_fixed,'k.','hold_ticket.')"));
 assert.ok(!currentCallFix.includes("delete from public.so_tickets"));
});

const pausedQueueMigration=readFileSync(new URL("../supabase/migrations/20261109154500_public_board_after_queue_pause.sql",import.meta.url),"utf8");
test("existing tickets remain visible on public board after new number issuance is paused",()=>{
 assert.ok(pausedQueueMigration.includes("so_public_board(text,integer)"));
 assert.ok(pausedQueueMigration.includes("so_public_queue_order(text,integer)"));
 assert.ok(pausedQueueMigration.includes("execute replace(v_definition,v_old_board,'')"));
 assert.ok(pausedQueueMigration.includes("so_set_merchant_services"));
});
