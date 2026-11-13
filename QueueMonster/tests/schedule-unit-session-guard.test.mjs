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

test("generated default sessions use the same unique, active and deterministic unit as the guard",()=>{
 const next=readFileSync(new URL("../supabase/migrations/20261113_qm_schedule_default_unit_consistency.sql",import.meta.url),"utf8");
 assert.match(next,/u.is_default_session_unit AND u.active\s+ORDER BY u.id LIMIT 1/);
 assert.equal((next.match(/is_default_session_unit and active order by id limit 1/g)||[]).length,2);
 assert.doesNotMatch(next,/is_default_session_unit limit 1/);
});

test("custom special dates reject resources from another shop, deleted IDs, or disabled units",()=>{
 const next=readFileSync(new URL("../supabase/migrations/20261113_qm_special_date_unit_validation.sql",import.meta.url),"utf8");
 assert.match(next,/coalesce\(w->>'unit_id',''\)<>''/);
 assert.match(next,/u\.id=\(w->>'unit_id'\)::uuid/);
 assert.match(next,/u\.tenant_id=t\.id and u\.active/);
 assert.match(next,/特殊日期包含不存在或已停用的服務窗口/);
});
