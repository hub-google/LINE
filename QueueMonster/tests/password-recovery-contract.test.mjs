import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {effectivePassword} from "../saas/app/password-credential.js";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const reset=read("saas/password-reset.html");
const logic=read("saas/assets/password-reset/main.js");
const css=read("saas/assets/password-reset/page.css");
const entry=read("saas/merchant-register.html");
const oldLogic=read("saas/assets/merchant-register/main.js");
const build=read("../.github/scripts/build-line-saas.mjs");
const workflow=read("../.github/workflows/line-saas-pages.yml");

test("old emailed Supabase verification redirects immediately to isolated reset page",()=>{
 assert.match(entry,/new URLSearchParams\(location\.search\)\.get\("intent"\)==="recovery"/);
 assert.match(entry,/location\.replace\(new URL\("\.\/password-reset\.html"\+location\.search\+location\.hash/);
 assert.ok(entry.indexOf('location.replace(new URL("./password-reset.html"')<entry.indexOf('src="./assets/merchant-register/main.js'));
 assert.match(oldLogic,/resetPasswordForEmail\(email,\{redirectTo:returnToReset\(\)\}\)/);
 assert.match(oldLogic,/merchant-register\.html\?mode=login&intent=recovery/);
});

test("recovery form verifies auth session before changing password, without merchant RPC",()=>{
 for(const id of ["reset-form","new-password","confirm-password","reset-loading","reset-success","reset-invalid","reset-error"]){
  assert.match(reset,new RegExp('id="'+id+'"'));
 }
 assert.match(reset,/autocomplete="new-password"/);
 assert.match(reset,/minlength="1"/);
 assert.doesNotMatch(reset,/maxlength=|minlength="8"/);
 assert.match(reset,/支援 1 碼以上/);
 assert.match(logic,/fragment\.get\("type"\)==="recovery"/);
 assert.match(logic,/getSession\(\)/);
 assert.match(logic,/getUser\(\)/);
 assert.match(logic,/auth\.updateUser\(\{password:credential\}\)/);
 assert.match(logic,/effectivePassword\(verifiedEmail,password\)/);
 assert.match(logic,/verifiedEmail=identity\.user\.email/);
 assert.match(oldLogic,/import \{effectivePassword\} from "\.\.\/\.\.\/app\/password-credential\.js"/);
 assert.match(logic,/auth\.signOut\(\{scope:"local"\}\)/);
 assert.match(logic,/scrubCallback\(\)/);
 assert.match(logic,/history\.replaceState/);
 assert.match(logic,/密碼不一致/);
 assert.doesNotMatch(logic,/so_my_context|so_start_merchant|platform-login|service_role/);
 assert.match(css,/@media\(max-width:520px\)/);
 const check=spawnSync(process.execPath,["--input-type=module","--check"],{input:logic,encoding:"utf8"});
 assert.equal(check.status,0,check.stderr);
});

test("new page and hashed assets are emitted in build and GitHub Pages publishing",()=>{
 assert.match(build,/"password-reset\.html"/);
 assert.match(workflow,/password-reset\.html/);
 assert.match(workflow,/password-recovery-contract\.test\.mjs/);
 assert.match(reset,/__LINE_SAAS_BUILD__/);
 assert.match(reset,/assets\/password-reset\/main\.js/);
 assert.match(reset,/assets\/password-reset\/page\.css/);
 assert.match(reset,/version-watch\.js/);
});

test("1-character password recovery uses the exact same credential as ordinary sign-in",async()=>{
 const email="User@Example.com";
 const single=await effectivePassword(email,"7");
 assert.equal(single.length,68,"Supabase's minimum is satisfied by the existing compatibility encoding");
 assert.match(single,/^qm1-[0-9a-f]{64}$/);
 assert.equal(single,await effectivePassword("user@example.com","7"),"email normalization matches sign in");
 assert.notEqual(single,await effectivePassword(email,"8"));
 assert.notEqual(single,await effectivePassword("other@example.com","7"));
 assert.equal((await effectivePassword(email,"12345")).length,68);
 assert.equal(await effectivePassword(email,"123456"),"123456","6+ characters remain unchanged");
 await assert.rejects(()=>effectivePassword(email,""),/請輸入密碼/);
});
