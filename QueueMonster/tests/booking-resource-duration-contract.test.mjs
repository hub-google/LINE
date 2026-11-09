import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
const sql=readFileSync(new URL("../supabase/migrations/20261104_booking_resource_duration_guard.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("NR-05: service duration, buffer and assigned resource are persisted per booking",()=>{
 assert.match(sql,/service_duration_minutes integer/);
 assert.match(sql,/service_buffer_minutes integer/);
 assert.match(sql,/assigned_resource_id uuid/);
 assert.match(sql,/so_booking_service_spec/);
 assert.match(sql,/new\.service_duration_minutes:=/);
 assert.match(sql,/new\.assigned_resource_id:=/);
});
test("NR-05: every mutation checks capacity and resource overlap under tenant lock",()=>{
 assert.match(sql,/create trigger so_booking_resource_guard before insert or update of/);
 assert.match(sql,/where id=new\.tenant_id for update/);
 assert.match(sql,/private\.so_peak_reserved_party/);
 assert.match(sql,/v_peak\+new\.party_size>t\.slot_capacity/);
 assert.match(sql,/r\.assigned_resource_id=v_rid/);
 assert.match(sql,/r\.status in\('CONFIRMED','CHECKED_IN'\)/);
 assert.match(sql,/r\.deleted_at is null/);
});
test("NR-06: capacity is based on overlapping actual intervals, not summed daily headcount",()=>{
 assert.match(sql,/with spans as \(/);
 assert.match(sql,/select begins from spans where begins>p_start and begins<p_end/);
 assert.match(sql,/where s\.begins<=p\.ts and s\.ends>p\.ts/);
 assert.match(sql,/v_finish>\(new\.booking_date\+t\.close_time\)/);
 assert.match(sql,/v_finish\s*>\s*\(new\.booking_date\+bp\.break_start\)/);
});
test("NR-05: client uses server-verified service-specific available slots",()=>{
 assert.match(ui,/so_service_slot_availability/);
 assert.match(ui,/serviceSlotsKey\(\)/);
 assert.match(ui,/currentBookingSlots\(\)/);
 assert.match(ui,/refreshServiceSlots\(\)/);
 assert.match(ui,/so_service_rule_save/);
 assert.match(ui,/so_resource_upsert/);
 assert.match(ui,/if\(staffTab==="menu"\)staff\.resourceContext/);
});
test("NR-05: resource tables deny direct client access and validate same tenant",()=>{
 assert.match(sql,/alter table public\.so_booking_resources enable row level security/);
 assert.match(sql,/alter table public\.so_service_rules enable row level security/);
 assert.match(sql,/foreign key \(tenant_id,resource_id\)/);
 assert.match(sql,/foreign key\(tenant_id,assigned_resource_id\)/);
 assert.match(sql,/private\.so_role\(t\.id\)/);
 assert.doesNotMatch(sql,/\btruncate\s+table\b|\bdelete\s+from\s+public\.so_reservations\b/i);
});
