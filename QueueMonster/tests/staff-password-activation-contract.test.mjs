import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readFileSync} from "./helpers/source-fs.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");

test("invited staff cannot enter before password setup and trusted verification",()=>{
 const page=read("saas/assets/merchant-register/main.js");
 const html=read("saas/merchant-register.html");
 const gate=read("supabase/migrations/20261110165000_queue_monster_invited_staff_password_gate.sql");
 const edge=read("saas/supabase/functions/staff-complete-setup/index.ts");
 assert.match(page,/needsInitialPassword\(user\)/);
 assert.match(page,/if\(recovering\|\|firstSetup\)/);
 assert.match(page,/auth\.updateUser\(\{password\}\)/);
 assert.match(page,/auth\.signInWithPassword\(\{email,password\}\)/);
 assert.match(page,/functions\.invoke\("staff-complete-setup"/);
 assert.match(page,/returnToReset\(\)/);
 assert.match(page,/resetPasswordForEmail/);
 assert.match(html,/minlength="1"/);
 assert.doesNotMatch(html,/minlength="8"|至少 8 字元/);
 assert.match(gate,/queue_monster_password_ready/);
 assert.match(gate,/u\.invited_at IS NULL/);
 assert.match(gate,/raw_user_meta_data->>'app' IS DISTINCT FROM 'queue-monster'/);
 assert.match(edge,/auth\.admin\.updateUserById/);
 assert.match(edge,/auth\.signInWithPassword/);
 assert.match(edge,/user\.id/);
});
test("shared auth email templates are branded only for Queue Monster",()=>{
 const mail=read("../.github/scripts/queue-monster-auth-email.py");
 const workflow=read("../.github/workflows/queue-monster-auth-email.yml");
 assert.match(mail,/mailer_templates_\{name\}_content/);
 assert.match(mail,/mailer_subjects_\{name\}/);
 assert.match(mail,/queue-monster-mail-v1/);
 assert.match(mail,/{{ else }}/);
 assert.match(mail,/排隊怪獸/);
 assert.match(mail,/password_min_length/);\n assert.doesNotMatch(mail,/api\\("PATCH",policy_patch\\)/);
 assert.match(mail,/site_url/);
 assert.match(workflow,/SUPABASE_ACCESS_TOKEN/);
 assert.doesNotMatch(workflow,/echo \$SUPABASE_ACCESS_TOKEN/);
});
