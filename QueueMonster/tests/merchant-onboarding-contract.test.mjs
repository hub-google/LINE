import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const reg=read("saas/merchant-register.html");
const index=read("saas/index.html");
const directory=read("saas/directory.html");
const sql=read("supabase/migrations/20261106102500_merchant_account_onboarding_and_privacy.sql");
const cleanup=read("supabase/migrations/20261106103000_disable_qa_recovery.sql");

test("merchant signup and login are separate actionable screens",()=>{
 assert.match(reg,/id="tab-login"/);
 assert.match(reg,/id="tab-signup"/);
 for(const id of ["username","signup-email","signup-pass","signup-confirm","login-email","login-pass"]){
  assert.match(reg,new RegExp('id="'+id+'"'));
 }
 assert.match(reg,/signInWithPassword/);
 assert.match(reg,/auth\.signUp/);
 assert.match(reg,/so_start_merchant/);
 assert.match(reg,/emailRedirectTo:returnToLogin\(\)/);
});
test("merchant supports secure account activation, password reset and callback preservation",()=>{
 assert.match(reg,/signInWithOtp/);
 assert.match(reg,/shouldCreateUser:true/);
 assert.match(reg,/resetPasswordForEmail/);
 assert.match(reg,/auth\.updateUser\(\{password\}\)/);
 assert.match(reg,/u\.pathname\+u\.search\+u\.hash/);
 const module=reg.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
 assert.ok(module,"merchant page should have executable module");
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});
test("new stores start private and are published only after settings are saved",()=>{
 assert.match(sql,/onboarding_complete boolean not null default true/);
 assert.match(sql,/directory_enabled,onboarding_complete/);
 assert.match(sql,/false,false/);
 assert.match(sql,/so_complete_merchant_onboarding/);
 assert.match(index,/onboarding_complete===false/);
 const i=index.indexOf('if(a==="update-settings")');
 assert.ok(i>0);
 const settings=index.slice(i,i+2100);
 assert.ok(settings.indexOf('so_update_tenant')>0);
 assert.ok(settings.indexOf('so_complete_merchant_onboarding')>settings.indexOf('so_update_tenant'));
 assert.match(sql,/t\.onboarding_complete = true/);
});
test("retired QA entry points and customer-facing test copy are absent",()=>{
 assert.doesNotMatch(directory,/測試|demo-link|qa-84b3/);
 assert.doesNotMatch(index,/if\(a==="test-login"\)|if\(a==="recover-test-store"\)/);
 for(const name of ["home","directory","merchant-register","merchant-center","board","poster","terms","privacy"]){
  assert.doesNotMatch(read("saas/"+name+".html"),/測試/,name);
 }
 assert.match(sql,/revoke all on function public\.so_test_login/);
 assert.match(cleanup,/revoke all on function public\.so_claim_qa_recovery/);
});


test("platform PIN login uses server-side throttle and a real authenticated session",()=>{
 const edge=read("supabase/functions/qm-admin-login/index.ts");
 const migration=read("supabase/migrations/20261106195600_platform_admin_pin_gate.sql");
 assert.ok(reg.includes("functions/v1/qm-admin-login"));
 assert.ok(reg.includes("sb.auth.setSession("));
 assert.ok(reg.includes("so_claim_verified_platform_owner"));
 assert.ok(edge.includes("qm_admin_pin_check"));
 assert.ok(edge.includes("auth.admin.generateLink"));
 assert.ok(edge.includes("verifyOtp"));
 assert.ok(migration.includes("locked_until"));
 assert.ok(migration.includes("to service_role;"));
 assert.ok(!reg.includes('pin==="9"'));
 assert.ok(!migration.includes("crypt('9'"));
});
