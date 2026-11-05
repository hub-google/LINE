import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261104_booking_reminder_outbox_fr104.sql",import.meta.url),"utf8");
const bridge=readFileSync(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url),"utf8");

test("FR-104: durable 24h/2h reminders use existing outbox and cron",()=>{
 assert.match(migration,/so_booking_reminder_jobs/);
 assert.match(migration,/reminder_kind in \('24H','2H'\)/);
 assert.match(migration,/line-saas-booking-reminders/);
 assert.match(migration,/so_booking_enqueue_reminders\(\)/);
 assert.match(migration,/so_line_notice_outbox\(tenant_id,event_kind,reference_id\)/);
 assert.match(migration,/on conflict\(tenant_id,event_kind,reference_id\) do nothing/);
});
test("FR-104: time changes and cancellations invalidate old reminder identities",()=>{
 assert.match(migration,/after insert or update of booking_date,booking_time,status,deleted_at/);
 assert.match(migration,/id=gen_random_uuid\(\)/);
 assert.match(migration,/status='SKIPPED'/);
 assert.match(migration,/status='CANCELLED'/);
 assert.match(migration,/BOOKING_SCHEDULE_CHANGED/);
 assert.match(migration,/where booking_id=new\.id/);
});
test("FR-104: reminders never send hours late and use scoped current booking",()=>{
 assert.match(migration,/due_at>=now\(\)-interval '15 minutes'/);
 assert.match(migration,/j\.booking_start_at>now\(\)/);
 assert.match(migration,/r\.status='CONFIRMED' and r\.deleted_at is null/);
 assert.match(bridge,/REMINDER_BOOKING_CANCELLED_OR_CHANGED/);
 assert.match(bridge,/REMINDER_BOOKING_TIME_NOT_CURRENT/);
 assert.match(bridge,/booking\.status !== "CONFIRMED"/);
 assert.match(bridge,/startsAt !== Date\.parse\(reminder\.booking_start_at\)/);
 assert.match(bridge,/\.eq\("tenant_id", tenant\.id\)/);
});
test("FR-104: reuse LINE push claiming without storing credentials in browser",()=>{
 assert.match(bridge,/pushNotice\(db, tenant, booking\.user_id, job\.event_kind, job\.reference_id/);
 assert.match(bridge,/flexNotice\("預約提醒"/);
 assert.match(bridge,/liffManageLink\(await shopLinkContext\(db, tenant\)/);
 assert.match(migration,/revoke all on public\.so_booking_reminder_jobs from public,anon,authenticated/);
 assert.doesNotMatch(migration,/\btruncate\b|delete from public\.so_reservations/i);
});
