import test from "node:test";
import {readFileSync as rawReadFileSync} from "node:fs";
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
 assert.match(landing,/<ul class="hero-feature-list" aria-label="排隊怪獸三大功能">/);
 for(const [name,detail] of [
  ["線上預約","選擇日期、時段，快速完成預約"],
  ["排隊叫號","線上取號，隨時查看等候進度"],
  ["線上點餐","提前下單，可指定取餐時間"]
 ])assert.ok(landing.includes("<strong>"+name+"</strong><span>"+detail+"</span>"),name+" summary missing");
 const hero=landing.split('<section class="hero"')[1]?.split('</section>')[0]||"";
 assert.doesNotMatch(hero,/class="lead"|class="hero-industries"/,"hero must be concise, with no redundant industry labels");
 assert.match(css,/\.hero-feature-list\{[^}]*display:grid/);
 assert.match(css,/@media\(max-width:620px\)\{[\s\S]*?\.hero-feature-list li\{grid-template-columns:91px/);
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


test("demo uses actual product styles, matches real customer/merchant layouts and is Pages published",()=>{
 const html=rawReadFileSync(path.join(root,"saas/demo.html"),"utf8");
 const source=read("saas/assets/demo/real-flow.js");
 assert.match(html,/meta name="line-saas-build" content="__LINE_SAAS_BUILD__"/);
 assert.match(html,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
 for(const css of ["assets/index/page.css","booking-theme.css","monster-world.css"]) assert.ok(html.includes(css),"missing production stylesheet "+css);
 assert.match(html,/assets\/demo\/real-flow\.js/);
 assert.match(html,/assets\/demo\/mobile-ui\.css/);
 assert.match(html,/class="mobile-device"/);
 const mobileCss=read("saas/assets/demo/mobile-ui.css");
 assert.match(mobileCss,/@media\(max-width:540px\)/);
 assert.match(mobileCss,/#root \.mobile-bottom-nav/);
 assert.match(build,/"demo\.html"/);
 assert.match(publish,/home\.html for-merchants\.html for-customers\.html demo\.html board\.html/);
 assert.match(landing,/href="\.\/demo\.html"/);
 for(const id of ["breakfast","salon","repair","clinic"])assert.match(html,new RegExp('data-scene="'+id+'"'));
 for(const name of ["早餐店","美髮店","維修店","診所","顧客端","店家端"])assert.ok(html.includes(name),"missing scenario "+name);
 assert.doesNotMatch(html,/店員端/);
 for(const originalClass of ["mobile-merchant-head","mobile-bottom-nav","customer-shop-toolbar","customer-layout","staff-record","staff-picker","side-item","unit-card-grid","queue-board","staff-actionbar"]){
  assert.ok(source.includes(originalClass)||html.includes(originalClass),"demo missing production markup class "+originalClass);
 }
 for(const action of ["order-submit","reserve-submit","take-number","order-status","next","recall","toggle-notify","reset"])assert.ok(source.includes(action),"missing demo action "+action);
 const syntax=spawnSync(process.execPath,["--check"],{input:source,encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 for(const prohibited of ["localStorage","sessionStorage","XMLHttpRequest","createClient(","fetch(","line-bridge","so_staff_action"])assert.ok(!source.includes(prohibited),"demo accesses production: "+prohibited);
 assert.match(source,/LINE 通知示意/);
 assert.match(source,/取號成功/);
 assert.match(source,/預約成功/);
 assert.match(source,/輪到您的號碼/);
 assert.match(html,/不是真實 LINE 推播|模擬/);
});

test("real-flow demo reproduces guest creation, merchant status changes and LINE preview without backend",()=>{
 const source=read("saas/assets/demo/real-flow.js");
 const handlers={},elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{id,value:"",textContent:"",innerHTML:"",hidden:false,classList:{toggle(){}},setAttribute(){},scrollIntoView(){}});
  return elements.get(id);
 };
 const doc={
  body:{dataset:{}},
  getElementById:el,querySelectorAll:()=>[],
  addEventListener:(name,cb)=>{handlers[name]=cb}
 };
 runInNewContext(source,{document:doc,Intl,Date});
 const click=(selector,data)=>handlers.click({target:{closest:s=>s===selector?{dataset:data}:null}});
 const change=(data)=>handlers.change({target:data});
 const input=(id,value)=>handlers.input({target:{id,value}});
 assert.match(el("root").innerHTML,/首頁/);
 click("[data-tab]",{tab:"order"});
 assert.match(el("root").innerHTML,/選擇餐點/);
 input("customer-name","示範顧客");input("customer-phone","0912345678");
 click("[data-act]",{act:"qty",id:"egg",delta:"1"});
 click("[data-act]",{act:"review-order"});
 assert.match(el("root").innerHTML,/請核對送出前的訂餐內容/);
 click("[data-act]",{act:"order-submit"});
 assert.match(el("root").innerHTML,/B003/);
 assert.match(el("notifications").innerHTML,/訂餐已送出/);
 click("[data-role]",{role:"staff"});
 assert.match(el("root").innerHTML,/取餐訂單管理/);
 click("[data-act]",{act:"order-status",id:"B003",value:"ACCEPTED"});
 assert.match(el("notifications").innerHTML,/已接單/);
 click("[data-act]",{act:"order-status",id:"B003",value:"REJECTED"});
 assert.match(el("root").innerHTML,/已拒單/);
 click("[data-scene]",{scene:"repair"});
 click("[data-tab]",{tab:"queue"});
 click("[data-act]",{act:"take-number"});
 assert.match(el("root").innerHTML,/R015/);
 assert.match(el("notifications").innerHTML,/取號成功/);
 click("[data-role]",{role:"staff"});
 click("[data-act]",{act:"next"});
 assert.match(el("notifications").innerHTML,/輪到您的號碼/);
 change({dataset:{statusKind:"ticket",id:"R013"},value:"PASSED",matches:s=>s==="[data-status-kind]"});
 assert.match(el("root").innerHTML,/已過號/);
 click("[data-scene]",{scene:"salon"});
 click("[data-tab]",{tab:"reserve"});
 input("contact-name","示範顧客");input("contact-phone","0912345678");
 click("[data-act]",{act:"unit",value:"Ken"});
 click("[data-act]",{act:"review-reserve"});
 click("[data-act]",{act:"reserve-submit"});
 assert.match(el("notifications").innerHTML,/預約成功/);
 click("[data-role]",{role:"staff"});
 assert.match(el("root").innerHTML,/預約管理/);
 click("[data-scene]",{scene:"clinic"});
 click("[data-tab]",{tab:"reserve"});
 input("contact-name","示範顧客");input("contact-phone","0912345678");
 click("[data-act]",{act:"unit",value:"2診"});
 click("[data-act]",{act:"review-reserve"});
 click("[data-act]",{act:"reserve-submit"});
 assert.match(el("root").innerHTML,/P003/);
 click("[data-role]",{role:"staff"});
 change({dataset:{statusKind:"reservation",id:"P003"},value:"CHECKED_IN",matches:s=>s==="[data-status-kind]"});
 assert.match(el("root").innerHTML,/C2-003/);
 assert.match(el("notifications").innerHTML,/已完成報到/);
});


test("marketing site has platform overview and two role-specific diagram pages",()=>{
 const merchant=read("saas/for-merchants.html");
 const customer=read("saas/for-customers.html");
 const flowCSS=read("saas/assets/roles/role-pages.css");
 for(const [name,html] of [["for-merchants.html",merchant],["for-customers.html",customer]]){
  assert.match(html,/line-saas-build" content="__LINE_SAAS_BUILD__"/);
  assert.match(html,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
  assert.match(build,new RegExp('"'+name.replaceAll(".","\\.")+'"'));
  assert.match(publish,new RegExp(name.replaceAll(".","\\.")));
  assert.match(html,/<title>/);
  assert.match(html,/rel="canonical"/);
  assert.match(html,/class="qm-flow"/);
  assert.match(read("saas/sitemap.xml"),new RegExp(name.replaceAll(".","\\.")));
 }
 assert.match(landing,/href="\.\/for-merchants\.html"/);
 assert.match(landing,/href="\.\/for-customers\.html"/);
 assert.match(landing,/一個平台，串起店家與顧客/);
 assert.match(landing,/class="qm-system-map"/);
 assert.match(merchant,/降低假帳號惡意預約、棄單風險/);
 assert.match(merchant,/電視或投影機直接顯示/);
 assert.match(merchant,/href="\.\/demo\.html"/);
 assert.match(customer,/手機查看最新進度/);
 assert.match(customer,/href="\.\/directory\.html\?mode=search"/);
 assert.match(flowCSS,/@media\(max-width:700px\)/);
});
