import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20261117091700_workforce_null_role_authorization_guard.sql',import.meta.url),'utf8');
const functions=[
 'wm_adjust_closed_month','wm_close_month','wm_grant_leave_hours',
 'wm_line_delivery_status','wm_month_report','wm_org_invite','wm_org_set_member',
 'wm_save_attendance_rule','wm_save_leave_policy','wm_save_qr_setting',
 'wm_save_schedule_rules','wm_set_availability_policy','wm_staff_wages'
];
test('all thirteen sensitive SECURITY DEFINER functions reject a missing role',()=>{
 for(const name of functions)assert.ok(migration.includes("'"+name+"'"),name);
 assert.equal(new Set(functions).size,13);
 assert.match(migration,/p\.prosecdef = true/);
 assert.match(migration,/matching_functions <> 1/);
 assert.match(migration,/matching_guards <> 1/);
 assert.match(migration,/COALESCE\(\\1 NOT IN \\2, TRUE\)/);
 assert.match(migration,/corrected_count <> 13/);
});
test('privilege fix cannot modify or erase another product table',()=>{
 assert.match(migration,/p\.pronamespace = 'public'::regnamespace/);
 assert.match(migration,/EXECUTE corrected_definition/);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\./i);
 assert.doesNotMatch(migration,/so_|qm_|ti_|chance_/);
});
