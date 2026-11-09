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

test("merchant can independently enable reservation and queue in their own settings",()=>{
 const modes=read("supabase/migrations/20261109093000_merchant_service_mode_switch.sql");
 const guide=read("saas/merchant-center.html");
 assert.ok(index.includes('id="set-service-reservation"'));
 assert.ok(index.includes('id="set-service-queue"'));
 assert.ok(index.includes('if(a==="save-service-modes")'));
 assert.ok(index.includes('rpc("so_set_merchant_services"'));
 assert.ok(index.includes("p_reservation:reservation,p_queue:queue"));
 assert.ok(guide.includes("儲存服務開關"));
 assert.ok(modes.includes("private.so_role(v_t.id)"));
 assert.ok(modes.includes("('OWNER','MANAGER')"));
 assert.ok(modes.includes("coalesce(v_t.modules,'{}'::jsonb)"));
 assert.ok(modes.includes("jsonb_build_object('reservation',p_reservation,'queue',p_queue,'calling',v_calling)"));
 assert.ok(modes.includes("grant execute on function public.so_set_merchant_services"));
 assert.ok(!modes.includes("grant execute on function public.so_set_merchant_services(text,boolean,boolean) to anon"));
});

test("only active services appear in public entry points, preserving older ticket work",()=>{
 assert.ok(index.includes('m.reservation?nav("線上預約"'));
 assert.ok(index.includes('m.queue?nav("現場取號"'));
 assert.ok(index.includes('if(!m.reservation)html=box("未開放預約"'));
 assert.ok(index.includes('if(!m.queue)html=box("尚未開放取號"'));
 assert.ok(directory.includes("primaryHref=services.reservation?reserveHref:services.queue?queueHref:"));
 assert.ok(directory.includes("services.queue&&services.calling"));
 assert.ok(read("supabase/migrations/20261109093000_merchant_service_mode_switch.sql").includes("already issued numbers"));
 const module=index.match(/<script type="module">([\\s\\S]+?)<\\/script>/)?.[1];
 assert.ok(module,"main booking page requires an executable module");
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});
