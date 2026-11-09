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
