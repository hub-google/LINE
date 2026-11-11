import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(path.join(root,name),"utf8");
const sql=read("supabase/migrations/20261111063000_queue_audit_unified_behavior.sql");
const queueActions=read("saas/app/actions/staff-queue-actions.js");
const edit=read("saas/app/booking-edit.js");
const recordActions=read("saas/app/actions/booking-record-actions.js");
const customerRecords=read("saas/app/customer-records.js");

test("both queue types use hold expiry/count policy and transition permission checks",()=>{
 assert.match(sql,/Apply one hold policy to ordinary and session queues/);
 assert.match(sql,/hold_count=CASE WHEN p_status='HOLD'/);
 assert.match(sql,/hold_until=CASE WHEN p_status='HOLD'/);
 assert.match(sql,/WHEN v_old='HOLD' THEN NULL/);
 assert.match(sql,/IF p_status IN \('CALLED','ARRIVED','ADMITTED','SERVING'\)/);
 assert.match(sql,/AND \(NOT v_unit OR hold_ticket\.service_session_id=s\.id\)/);
 assert.match(sql,/AND \(NOT v_unit OR service_session_id=s\.id\)/);
});

test("staff restoration respects independent service sessions and concurrent serving",()=>{
 assert.match(sql,/r\.service_session_id is null then/);
 assert.match(sql,/k\.status='CALLED' and exists\(/);
 assert.match(sql,/x\.status='CALLED'/);
 assert.match(sql,/x\.service_session_id=k\.service_session_id/);
 assert.doesNotMatch(sql,/k\.status in \('CALLED','SERVING'\) and exists/);
 assert.match(sql,/service_session_id,service_unit_id\s*\nON public\.so_reservations/);
});

test("one progress count handles multiple parallel service windows and overnight sessions",()=>{
 assert.match(sql,/v_ahead:=v_ahead\+v_serving/);
 assert.match(sql,/'serving',v_serving/);
 assert.match(sql,/s\.session_date=\(now\(\) at time zone 'Asia\/Taipei'\)::date-1/);
 assert.match(sql,/s\.deleted_at is null/);
});

test("undo always targets actual backend called ticket, not client first waiting row",()=>{
 assert.match(queueActions,/id:result\.ticket_id,label:result\.number,before:"WAITING",after:"CALLED"/);
 assert.doesNotMatch(queueActions,/nextBefore/);
});

test("customer booking edit supports session UUID, date-scoped capacity and single shared UI",()=>{
 assert.match(sql,/FUNCTION public\.so_customer_edit_session_booking/);
 assert.match(sql,/AND linked\.user_id=r\.user_id/);
 assert.match(sql,/service_session_id=s\.id,service_unit_id=s\.unit_id/);
 assert.match(sql,/v_booked\+p_party>s\.capacity/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.so_customer_edit_session_booking/);
 assert.match(edit,/sessionMode\?"so_unit_config":"so_public_state"/);
 assert.match(edit,/s\.id===record\.session_id\?Number\(record\.party\):0/);
 assert.match(recordActions,/sessionMode\?"so_customer_edit_session_booking":"so_customer_edit_booking_with_items"/);
 assert.match(customerRecords,/btn\("編輯預約","edit-book"/);
 assert.doesNotMatch(customerRecords,/x\.session_id\?'':btn\("編輯預約"/);
});
