import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readFileSync} from "./helpers/source-fs.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>readFileSync(path.join(root,relative),"utf8");

test("employee can leave exactly one shop without deleting account or other memberships",()=>{
 const ui=read("saas/assets/merchant-register/main.js");
 const lifecycle=read("supabase/migrations/20261110180500_queue_monster_leave_dissolve_and_manager_guard.sql");
 assert.match(ui,/so_leave_tenant/);
 assert.match(ui,/so_dissolve_tenant/);
 assert.match(ui,/window\.prompt/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/context\?\.previous_member/);
 assert.match(ui,/canLeave=n>1&&\(!isAdmin\|\|managers>1\)/);
 assert.match(lifecycle,/WHERE tenant_id=t\.id AND user_id=auth\.uid\(\)/);
 assert.match(lifecycle,/v_count<=1/);
 assert.match(lifecycle,/v_managers<=1/);
 assert.match(lifecycle,/FROM public\.so_membership_exits/);
 assert.match(lifecycle,/status='DISSOLVED'/);
 assert.match(lifecycle,/status<>'DISSOLVED'/);
 assert.match(lifecycle,/directory_enabled=false/);
 assert.match(lifecycle,/DELETE FROM public\.so_members WHERE tenant_id=t\.id/);
 assert.doesNotMatch(lifecycle,/DELETE FROM public\.so_tenants/);
});

test("manager transfer and dissolution rules are available and admin-only",()=>{
 const members=read("saas/app/staff/members.js");
 const actions=read("saas/app/actions/merchant-admin.js");
 const lifecycle=read("supabase/migrations/20261110180500_queue_monster_leave_dissolve_and_manager_guard.sql");
 const guards=read("supabase/migrations/20261110181000_queue_monster_dissolved_tenant_guards.sql");
 assert.match(members,/promote-staff-manager/);
 assert.match(actions,/so_promote_tenant_manager/);
 assert.match(lifecycle,/IF v_role NOT IN \('OWNER','MANAGER'\)/);
 assert.match(lifecycle,/so_guard_membership_admin/);
 assert.match(guards,/so_guard_membership_insert/);
 assert.match(guards,/so_guard_dissolved_invite/);
 assert.match(guards,/至少需有一位管理者才能開通/);
});
