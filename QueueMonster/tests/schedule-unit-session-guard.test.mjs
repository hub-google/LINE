import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261113_qm_schedule_session_unit_date_guard.sql",import.meta.url),"utf8");
test("schedule check verifies store, selected unit, date and active session",()=>{
 assert.match(sql,/so_schedule_session_unit_allowed\(/);
 assert.match(sql,/u.tenant_id=p_tenant AND u.id=p_unit AND u.active/);
 assert.match(sql,/\(w->>'unit_id'\)::uuid=p_unit/);
 assert.match(sql,/u.is_default_session_unit AND u.active/);
 assert.match(sql,/v_session.session_date IS DISTINCT FROM v_date/g);
 assert.match(sql,/v_session.deleted_at IS NOT NULL OR v_session.active IS NOT TRUE/g);
 assert.equal((sql.match(/NEW.tenant_id,v_date,v_session.unit_id,v_session.start_time,v_session.end_time/g)||[]).length,2);
 assert.equal((sql.match(/s.session_date,s.unit_id,s.start_time,s.end_time/g)||[]).length,2);
 assert.match(sql,/REVOKE ALL ON FUNCTION private.so_schedule_session_unit_allowed/);
});
