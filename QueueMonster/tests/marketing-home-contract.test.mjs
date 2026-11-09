import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(relative)=>readFileSync(path.join(root,relative),"utf8");
const landing=read("saas/home.html");
const app=read("saas/index.html");
const directory=read("saas/directory.html");
const build=read("../.github/scripts/build-line-saas.mjs");
const publish=read("../.github/workflows/line-saas-pages.yml");
const deployPr=read("../.github/workflows/line-saas-pr-validation.yml");

test("independent homepage is versioned and included in non-destructive Pages deployment",()=>{
 assert.match(landing,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/);
 assert.match(landing,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
 assert.match(build,/"home\.html"/);
 assert.match(publish,/for product in booking saas/);
 assert.match(publish,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.match(publish,/marketing-home-contract\.test\.mjs/);
 assert.match(deployPr,/marketing-home-contract\.test\.mjs/);
 assert.match(landing,/<meta name="viewport"/);
 assert.match(landing,/@media\(max-width:620px\)/);
 assert.match(landing,/prefers-reduced-motion/);
});

test("homepage routes to real customer and merchant workflows without altering identifiers",()=>{
 const targets=[
  "./merchant-register.html?mode=signup","./merchant-register.html?mode=login",
  "./directory.html?mode=search","./directory.html?mode=queue",
  "./privacy.html","./terms.html"
 ];
 for(const href of targets) assert.ok(landing.includes('href="'+href+'"'),"Missing existing workflow link: "+href);
 assert.match(landing,/預約報到不會自動/);
 assert.match(landing,/已發送的 LINE 訊息是當時的資訊快照/);
 assert.match(landing,/非 LINE 官方產品/);
 assert.doesNotMatch(landing,/NT\$\s*0|NT\$\s*299|無限免費/);
});

test("bare booking or legacy SaaS roots open the dedicated booking homepage without touching LIFF routes",()=>{
 const m=app.match(/<!-- Preserve existing view\/merchant\/LIFF callbacks; only bare legacy\/booking roots enter marketing home\. -->\s*<script>([\s\S]*?)<\/script>/);
 assert.ok(m,"missing isolated safe entry route");
 const syntax=spawnSync(process.execPath,["--check"],{input:m[1],encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 function redirected(url){
  const original=new URL(url);
  let destination=null;
  const location={
   search:original.search,pathname:original.pathname,hash:original.hash,
   href:original.href,
   replace(next){destination=next;}
  };
  runInNewContext(m[1],{location,URL,URLSearchParams,Set});
  return destination;
 }
 const base="https://hub-google.github.io/LINE/booking/";
 const legacy="https://hub-google.github.io/LINE/saas/";
 assert.equal(redirected(base),base+"home.html");
 assert.equal(redirected(base+"index.html"),base+"home.html");
 assert.equal(redirected(base+"?utm_source=LINE"),base+"home.html?utm_source=LINE");
 assert.equal(redirected(legacy),base+"home.html");
 assert.equal(redirected(legacy+"index.html"),base+"home.html");
 assert.equal(redirected(legacy+"?utm_source=LINE"),base+"home.html?utm_source=LINE");
 for(const suffix of [
  "?view=customer&merchant=greenfield-salon",
  "?view=staff&merchant=qa-test",
  "?view=platform","?merchant=greenfield-salon",
  "?tab=progress","?liff.state=abc&code=xyz",
  "?code=test&state=test","?ticket=deadbeef",
  "#state"
 ]){
  assert.equal(redirected(base+suffix),null,"unexpected redirect for "+suffix);
  assert.equal(redirected(legacy+suffix),null,"unexpected legacy redirect for "+suffix);
 }
});

test("headquarters OA directory links platform shops directly to their merchant websites",()=>{
 assert.match(directory,/function customerUrl\(slug,tab,oaMode="PLATFORM"\)/);
 assert.match(directory,/if\(oaMode==="PLATFORM"\)return "\.\/"\+qs/);
 assert.match(directory,/selected\?\.oa_mode==="PLATFORM"/);
 assert.match(directory,/customerUrl\(t\.slug,"reserve",t\.oa_mode\)/);
 assert.match(directory,/customerUrl\(t\.slug,"queue",t\.oa_mode\)/);
});

test("homepage mascot artwork does not have redundant demo text floating above it",()=>{
 const homeCss=read("saas/assets/home/page.css");
 assert.match(landing,/<div class="mock-scene" aria-label=/);
 assert.match(landing,/<div class="mock-ring" aria-hidden="true"><\/div>/);
 assert.doesNotMatch(landing,/<div class="scene-label">介面示意<\/div>/);
 assert.doesNotMatch(homeCss,/\.scene-label\s*\{/);
});
