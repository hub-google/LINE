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

test("public homepage only links to customer-facing functions and legal documents",()=>{
 const targets=[
  "./directory.html?mode=search","./directory.html?mode=queue",
  "./privacy.html","./terms.html"
 ];
 for(const href of targets) assert.ok(landing.includes('href="'+href+'"'),"Missing customer link: "+href);
 assert.doesNotMatch(landing,/href="[^"]*(?:merchant-register|platform-login|view=staff|view=platform)/);
 assert.doesNotMatch(directory,/href="[^"]*(?:merchant-register|platform-login|view=staff|view=platform)/);
 assert.doesNotMatch(landing,/我是店家・開始使用|商家登入|商家註冊/);
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
 assert.match(directory,/customerEntryUrl\(slug,\{surface:"directory",tab,oaMode,liffId\}\)/);
 assert.match(directory,/selected\?\.oa_mode==="PLATFORM"/);
 assert.match(directory,/customerUrl\(t\.slug,"reserve",t\.oa_mode\)/);
 assert.match(directory,/customerUrl\(t\.slug,"queue",t\.oa_mode\)/);
});

test("homepage mascot artwork does not have redundant demo text floating above it",()=>{
 const homeCss=read("saas/assets/home/page.css");
 assert.match(landing,/<div class="mock-scene hero-showcase" aria-label=/);
 assert.match(landing,/<div class="mock-ring" aria-hidden="true"><\/div>/);
 assert.doesNotMatch(landing,/<div class="scene-label">介面示意<\/div>/);
 assert.doesNotMatch(homeCss,/\.scene-label\s*\{/);
});

test("homepage hero presents two separate Chinese-first booking and queue examples",()=>{
 const css=read("saas/assets/home/page.css");
 for(const industry of ["診所","餐廳","髮廊","美容美甲","寵物服務","課程活動"]){
  assert.match(landing,new RegExp("<span>"+industry+"</span>"),industry+" industry tag missing");
 }
 assert.match(landing,/class="hero-demo hero-demo--booking" aria-label="線上預約範例"/);
 assert.match(landing,/class="hero-demo hero-demo--queue" aria-label="現場抽號叫號範例"/);
 assert.equal((landing.match(/<article class="hero-demo hero-demo--/g)||[]).length,2);
 for(const text of ["診所門診","選擇可預約時段","10:00","11:30","14:00","確認預約","餐廳現場候位","目前叫號","A012","我的號碼","A019","前方等候","6 組","查看叫號進度"]){
  assert.ok(landing.includes(text),"Missing example data: "+text);
 }
 assert.match(landing,/<p class="hero-demo-foot">適合餐廳、小吃店、診所及現場服務窗口<\/p>/);
 assert.match(landing,/展示號碼非即時資料/);
 assert.doesNotMatch(landing,/<div class="float-card|<div class="phone"/);
 assert.doesNotMatch(landing,/介面示意</);
 assert.match(css,/\.hero-demo-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:620px\)\{[\s\S]*?\.hero-demo-grid\{grid-template-columns:1fr/);
 const brand=read("saas/monster-world.css");
 assert.match(brand,/body:has\(\.site-head\) \.mock-scene:before\{[^}]*monster-mascot\.svg/);
});


test("homepage SEO stays in metadata, provides meaningful structured data, and publishes sitemap",()=>{
 const description=landing.match(/<meta name="description" content="([^"]+)">/);
 assert.ok(description?.[1].includes("線上預約"));
 for(const word of ["排隊取號","線上點餐","早餐店","診所","美髮","維修"])assert.ok(description[1].includes(word),word);
 assert.match(landing,/rel="canonical" href="https:\/\/hub-google\.github\.io\/LINE\/booking\/home\.html"/);
 const script=landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 assert.ok(script,"missing SEO structured data");
 const json=JSON.parse(script[1]);
 assert.equal(json["@context"],"https://schema.org");
 assert.ok(json["@graph"].some(x=>x["@type"]==="WebApplication"));
 assert.doesNotMatch(landing,/<meta name="keywords"/);
 const sitemap=read("saas/sitemap.xml");
 for(const page of ["home.html","directory.html","merchant-center.html","merchant-register.html"]){
  assert.ok(sitemap.includes("https://hub-google.github.io/LINE/booking/"+page),"missing sitemap "+page);
 }
 assert.match(build,/copyFile\(path\.join\(src, "sitemap\.xml"\)/);
 assert.match(publish,/sitemap\.xml/);
});
