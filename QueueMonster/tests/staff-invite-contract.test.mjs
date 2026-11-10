import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readFileSync} from "./helpers/source-fs.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>readFileSync(path.join(root,relative),"utf8");

test("staff invitations call a server-side mailer, not a silent database-only RPC",()=>{
 const action=read("saas/app/actions/merchant-admin.js");
 const members=read("saas/app/staff/members.js");
 const edge=read("saas/supabase/functions/staff-invite/index.ts");
 assert.match(action,/functions\.invoke\("staff-invite"/);
 assert.match(action,/email_sent/);
 assert.match(action,/邀請信未能寄出/);
 assert.match(members,/copy-staff-invite/);
 assert.match(members,/待接受邀請/);
 assert.match(edge,/auth\.admin\.inviteUserByEmail/);
 assert.match(edge,/shouldCreateUser:false/);
 assert.match(edge,/rpc\("so_invite_staff"/);
 assert.match(edge,/getUser\(token\)/);
 assert.match(edge,/只有企業負責人可邀請另一位負責人/);
 assert.doesNotMatch(action,/auth\.admin\.inviteUserByEmail/);
});
test("invited employees accept role-bound membership before entering the back office",()=>{
 const login=read("saas/assets/merchant-register/main.js");
 const page=read("saas/merchant-register.html");
 assert.match(page,/店家／員工登入/);
 assert.match(login,/so_my_context/);
 assert.match(login,/so_accept_invite/);
 assert.match(login,/p_invite_id:invite\.id/);
 assert.match(login,/if\(pending\.length\|\|invited\)return/);
 assert.ok(login.indexOf('if(pending.length||invited)return')<login.indexOf('rpc("so_start_merchant")'));
 assert.match(login,/staff_invite/);
 assert.match(login,/進入後台/);
});