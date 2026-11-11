import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import vm from "node:vm";

const sql=readFileSync(new URL("../supabase/migrations/20261104_customer_queue_near_alert.sql",import.meta.url),"utf8");
const bridge=readFileSync(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("OSS-N03: only authenticated LINE-linked ticket owners set 0/3/5",()=>{
  assert.match(sql,/queue_near_alert_threshold in \(0,3,5\)/);
  assert.match(sql,/so_customer_set_queue_near_alert\(p_ticket_id uuid,p_threshold integer\)/);
  assert.match(sql,/viewer\.user_id=auth\.uid\(\)/);
  assert.match(sql,/linked\.line_sub=viewer\.line_sub/);
  assert.match(sql,/linked\.user_id=k\.user_id/);
  assert.match(sql,/k\.status <> 'WAITING'/);
  assert.match(sql,/where id=p_ticket_id and tenant_id=t\.id and deleted_at is null for update/);
  assert.match(sql,/revoke all on function public\.so_customer_set_queue_near_alert/);
  assert.match(sql,/grant execute on function public\.so_customer_set_queue_near_alert.*to authenticated/);
});

test("OSS-N03: queue position counts active tickets, never number subtraction",()=>{
  assert.match(sql,/ahead\.tenant_id=k\.tenant_id and ahead\.status='WAITING'/);
  assert.match(sql,/ahead\.deleted_at is null/);
  assert.match(sql,/\(ahead\.business_date,ahead\.queue_joined_at,ahead\.ticket_no,ahead\.id\)/);
  assert.match(sql,/< \(k\.business_date,k\.queue_joined_at,k\.ticket_no,k\.id\)/);
  assert.match(sql,/k\.queue_near_alert_threshold in \(3,5\)/);
});

test("OSS-N03: one outbox event per ticket, private worker and safe cancellation",()=>{
  assert.match(sql,/event_kind='QUEUE_NEAR' and reference_id=k\.id/);
  assert.match(sql,/status in \('PENDING','RETRY'\)/);
  assert.match(sql,/on conflict \(tenant_id,event_kind,reference_id\)/);
  assert.match(sql,/where so_line_notice_outbox\.status='SKIPPED'/);
  assert.match(sql,/not exists \([\s\S]*sent\.event_kind='QUEUE_NEAR'/);
  assert.match(sql,/so_queue_near_alert_eligibility\(p_ticket_id uuid\)/);
  assert.match(sql,/revoke all on function public\.so_queue_enqueue_near_alerts\(\) from public,anon,authenticated/);
  assert.match(sql,/cron\.schedule\(/);
  assert.doesNotMatch(sql,/\btruncate\s+table\b/i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.so_tickets\b/i);
  assert.doesNotMatch(sql,/\bupdate\s+public\.so_reservations\b/i);
  assert.doesNotMatch(sql,/set\s+ticket_no\s*=/i);
});

test("OSS-N03: LINE worker rechecks preference and sends via existing deduped path",()=>{
  assert.match(bridge,/job\.event_kind === "QUEUE_NEAR"/);
  assert.match(bridge,/so_queue_near_alert_eligibility/);
  assert.match(bridge,/ticket\.status !== "WAITING"/);
  assert.match(bridge,/pushNotice\(db, tenant, ticket\.user_id, "QUEUE_NEAR", ticket\.id/);
  assert.match(bridge,/liffQueueProgressLink\(await shopLinkContext\(db, tenant\), ticket\.id\)/);
  assert.match(bridge,/so_line_push_log/);
});

test("OSS-N03: customer page exposes saved choice and not an untrusted local preference",()=>{
  assert.match(ui,/queueNearAlertControls\(own\|\|fallbackTicket,ownStatus\)/);
  assert.match(ui,/so_customer_get_queue_near_alert/);
  assert.match(ui,/so_customer_set_queue_near_alert/);
  assert.match(ui,/save-queue-near-alert/);
  assert.match(ui,/前方剩 3 組提醒/);
  assert.match(ui,/前方剩 5 組提醒/);
  assert.match(ui,/每張號碼最多提醒一次/);
  assert.doesNotMatch(ui,/localStorage\.setItem\("queueNearAlert/);
});

test("OSS-N03: main inline customer script stays syntactically valid",()=>{
  const scripts=[...ui.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1,"one module script");
  const source=scripts[0][1].replace(/^import\s+\{createClient\}[^;]+;/m,"const createClient=()=>{};");
  assert.doesNotMatch(source,/^import\s/m);
  assert.doesNotThrow(()=>new vm.Script(source));
});


test("FR-104 reminder job schema, invalidation and minute cron match deployed backend",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261111091500_booking_reminders_fr104_sync.sql",import.meta.url),"utf8");
 for(const event of ["RESERVATION_REMINDER_24H","RESERVATION_REMINDER_2H","TICKET_RESTORED"])
  assert.match(sql,new RegExp(event));
 assert.match(sql,/so_booking_reminder_jobs/);
 assert.match(sql,/so_booking_reminder_sync/);
 assert.match(sql,/BOOKING_SCHEDULE_CHANGED/);
 assert.match(sql,/status='CANCELLED'/);
 assert.match(sql,/so_booking_enqueue_reminders/);
 assert.match(sql,/due_at>=now\(\)-interval '15 minutes'/);
 assert.match(sql,/r\.status='CONFIRMED' and r\.deleted_at is null/);
 assert.match(sql,/cron\.schedule\('line-saas-booking-reminders'/);
});

test("FR-104 worker handles both reminders with event-versioned booking and tenant checks",()=>{
 assert.match(bridge,/job\.event_kind === "RESERVATION_REMINDER_24H"/);
 assert.match(bridge,/job\.event_kind === "RESERVATION_REMINDER_2H"/);
 assert.match(bridge,/from\("so_booking_reminder_jobs"\)/);
 assert.match(bridge,/reminder\.status !== "QUEUED"/);
 assert.match(bridge,/reminder\.reminder_kind !== expected/);
 assert.match(bridge,/booking\.status !== "CONFIRMED"/);
 assert.match(bridge,/\.eq\("tenant_id", tenant\.id\)\.eq\("id", reminder\.booking_id\)/);
 assert.match(bridge,/reminderDeliveryWindow\(booking\.booking_date, booking\.booking_time/);
 assert.match(bridge,/REMINDER_BOOKING_CANCELLED_OR_CHANGED/);
 assert.match(bridge,/pushNotice\(db, tenant, booking\.user_id, job\.event_kind, job\.reference_id/);
 assert.match(bridge,/so_line_push_log/);
});

test("FR-104 reminder delivery refuses early, stale and rescheduled booking events",()=>{
 const match=bridge.match(/function reminderDeliveryWindow\([\s\S]*?\n\}/);
 assert.ok(match,"reminder window guard must be present");
 const js=match[0].replace(/:\s*(?:string|number|boolean)\b/g,"");
 const guard=new Function(js+";return reminderDeliveryWindow;")();
 const day="2026-11-12", start="2026-11-12T02:00:00Z", due="2026-11-11T02:00:00Z";
 const t=Date.parse(due);
 assert.equal(guard(day,"10:00:00",start,due,t),true,"send at scheduled due time");
 assert.equal(guard(day,"10:00:00",start,due,t+14*60_000),true,"allow minute worker delay");
 assert.equal(guard(day,"10:00:00",start,due,t-1),false,"never send early");
 assert.equal(guard(day,"10:00:00",start,due,t+16*60_000),false,"never send after 15-minute window");
 assert.equal(guard(day,"11:00:00",start,due,t),false,"never send stale reminder after time change");
 assert.equal(guard(day,"10:00:00",start,"invalid",t),false,"reject invalid due timestamp");
});
