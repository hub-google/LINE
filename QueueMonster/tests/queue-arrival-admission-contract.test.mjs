import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";

const sharedUi=readFileSync(new URL("../saas/app/shared-ui.js",import.meta.url),"utf8");
const progress=readFileSync(new URL("../saas/app/queue-progress.js",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/20261104_queue_arrival_admission_states.sql",import.meta.url),"utf8");

test("K11: arrival and admission are separate persistent ticket statuses",()=>{
  assert.match(sql,/status in \('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED','COMPLETED','CANCELLED'\)/);
  assert.match(sql,/to_status text not null check\(to_status in \('ARRIVED','ADMITTED'\)\)/);
  assert.match(sql,/create trigger so_log_ticket_admission/);
  assert.match(sql,/new.status in\('ARRIVED','ADMITTED'\)/);
});

test("K11: active call includes confirmed arrival/admission until service ends",()=>{
  assert.match(sql,/status in \('CALLED','ARRIVED','ADMITTED','SERVING'\)/);
  assert.match(sql,/so_refresh_queue_display/);
  assert.match(sql,/so_staff_action/);
  assert.match(sql,/so_queue_live/);
  assert.match(sql,/so_customer_cross_store_overview/);
  assert.match(sql,/so_staff_worklist/);
});

test("K11: historical arrival and admission remain readable without extra primary status buttons",()=>{
  assert.match(sharedUi,/ARRIVED:"已到場"/);
  assert.match(sharedUi,/ADMITTED:"已進場"/);
  assert.match(sharedUi,/Historical ARRIVED\/ADMITTED\/SERVING records/);
  assert.match(sharedUi,/\["WAITING","候位中"\]/);
  assert.match(progress,/ownStatus==="ARRIVED"/);
  assert.match(progress,/ownStatus==="ADMITTED"/);
});

test("K11: admission event audit stays backend-only and retains historical ticket",()=>{
  assert.match(sql,/create table if not exists public\.so_ticket_admission_events/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.so_ticket_admission_events from public,anon,authenticated/);
  assert.match(sql,/actor_id uuid/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdelete from public\.so_tickets\b/i);
});
