import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>readFileSync(path.join(root,relative),"utf8");
const status=read("supabase/migrations/20261111055605_queue_shared_ticket_status_core.sql");
const actions=read("supabase/migrations/20261111060007_queue_shared_ticket_call_core.sql");
const progress=read("supabase/migrations/20261111060343_queue_unified_progress_and_current_number.sql");
const ui=read("saas/app/queue-progress.js");

test("ordinary and multi-session status RPCs use one guarded, tenant-locked core",()=>{
 assert.match(status,/FUNCTION private\.so_ticket_set_status_core/);
 assert.match(status,/WHERE slug=p_slug FOR UPDATE/);
 assert.match(status,/service_session_id=k\.service_session_id/);
 assert.match(status,/hold_count=CASE WHEN NOT v_unit/);
 assert.match(status,/FUNCTION public\.so_staff_set_ticket_status/);
 assert.match(status,/FUNCTION public\.so_unit_set_ticket_status/);
 assert.match(status,/private\.so_ticket_set_status_core\(p_slug,p_ticket_id,p_status,p_expected_status,false\)/);
 assert.match(status,/private\.so_ticket_set_status_core\(p_slug,p_ticket_id,p_status,p_expected_status,true\)/);
 assert.match(status,/REVOKE ALL ON FUNCTION private\.so_ticket_set_status_core/);
});
test("all queue actions share a single engine with scoped ordering and original RPC responses",()=>{
 assert.match(actions,/FUNCTION private\.so_ticket_queue_action_core/);
 assert.match(actions,/FOR UPDATE/);
 assert.match(actions,/x\.service_session_id=s\.id/);
 assert.match(actions,/FUNCTION public\.so_staff_action/);
 assert.match(actions,/FUNCTION public\.so_unit_call/);
 assert.match(actions,/private\.so_ticket_queue_action_core\(p_slug,NULL,p_action,p_ticket_id\)/);
 assert.match(actions,/private\.so_ticket_queue_action_core\(p_slug,p_session_id,p_action,p_ticket_id\)/);
 assert.match(actions,/REVOKE ALL ON FUNCTION private\.so_ticket_queue_action_core/);
});
test("public customer progress has one entrypoint, while boards share current number ordering",()=>{
 assert.match(progress,/FUNCTION private\.so_queue_current_number/);
 assert.match(progress,/ORDER BY k\.last_called_at DESC NULLS LAST,k\.updated_at DESC,k\.id DESC/);
 assert.match(progress,/RETURN public\.so_unit_progress\(p_slug,p_ticket_id\)/i);
 assert.match(progress,/private\.so_queue_current_number\(t\.id,s\.id\)/);
 assert.match(progress,/private\.so_queue_current_number\(v_shop\.id,null\)/);
 assert.match(ui,/await rpc\("so_queue_live"/);
 assert.doesNotMatch(ui,/await rpc\("so_unit_progress"/);
});
