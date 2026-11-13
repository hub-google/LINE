import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261113_qm_restore_disabled_default_unit.sql',import.meta.url),'utf8');
test('auto-session generation recovers a disabled canonical default unit',()=>{
 assert.match(sql,/is_default_session_unit order by id limit 1 for update/);
 assert.match(sql,/update public\.qm_booking_resources\s+set active=true,updated_at=now\(\)/);
 assert.match(sql,/where id=v_default and tenant_id=p_tenant and not active/);
 assert.match(sql,/if v_unit is null or not exists/);
 assert.doesNotMatch(sql,/is_default_session_unit and active order by id limit 1/);
});
