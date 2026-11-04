import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261104_queue_session_switching.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");
test("K12: four sessions are tenant-scoped, authorized and audited",()=>{
 assert.match(sql,/session_code in \('MORNING','AFTERNOON','EVENING','REST'\)/);
 assert.match(sql,/private\.so_role\(t\.id\)/);
 assert.match(sql,/from public\.so_tenants where slug=p_slug for update/);
 assert.match(sql,/'queue_session_change'/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.so_queue_session_state/);
});
test("K12: rest mode rejects NEW tickets in an insert trigger, never resets serials",()=>{
 assert.match(sql,/before insert on public\.so_tickets/);
 assert.match(sql,/if v_session='REST' then raise exception/);
 assert.match(sql,/new\.queue_session_code:=v_session/);
 assert.match(sql,/for share;/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdelete from public\.so_tickets\b|\bset ticket_no\s*=/i);
});
test("K12: staff switch and customer pause are on their existing pages",()=>{
 assert.match(ui,/queueSessionName\(code\)/);
 assert.match(ui,/set-queue-session/);
 assert.match(ui,/so_set_queue_session/);
 assert.match(ui,/customer\.queue_session\?\.code==="REST"/);
 assert.match(ui,/門市目前休場，暫停新取號/);
 assert.match(ui,/切場不會重設流水號/);
});
