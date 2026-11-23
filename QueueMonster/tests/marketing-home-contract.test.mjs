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

test("merchant homepage is versioned and published only through the test Pages workflow",()=>{
 const css=read("saas/assets/marketing/dual-portals.css");
 assert.match(landing,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/);
 assert.match(landing,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
 assert.match(rawReadFileSync(path.join(root,"saas/home.html"),"utf8"),/dual-portals\.css\?build=__LINE_SAAS_BUILD__/);
 assert.match(build,/"home\.html"/);
 assert.match(publish,/branches: \[main\]/);
 assert.match(publish,/for product in booking saas/);
 assert.match(publish,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.match(landing,/<meta name="viewport"/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(read("saas/assets/home/page.css"),/prefers-reduced-motion/);
});

test("store-first homepage offers signup and demo while retaining a secondary customer entrance",()=>{
 for(const href of ["./merchant-register.html?mode=signup","./demo.html?role=merchant","./customer.html","./privacy.html","./terms.html"]){
  assert.ok(landing.includes('href="'+href+'"'),"Missing homepage link: "+href);
 }
 assert.match(landing,/少一點繁瑣/);
 assert.match(landing,/現場與線上即時同步叫號/);
 assert.match(landing,/店員一鍵叫號/);
 assert.doesNotMatch(landing,/href="[^"]*(?:platform-login|view=staff|view=platform)/);
 assert.doesNotMatch(rawReadFileSync(path.join(root,"saas/directory.html"),"utf8"),/href="[^"]*(?:merchant-register|platform-login|view=staff|view=platform)/);
 assert.match(landing,/非 LINE 官方產品/);
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

test("directory preserves platform OA LIFF context while opening store services",()=>{
 assert.match(directory,/function customerUrl\(slug,tab,oaMode="PLATFORM"\)/);
 assert.match(directory,/customerEntryUrl\(slug,\{surface:"directory",tab,oaMode,liffId,platformChatEntry\}\)/);
 assert.match(directory,/selected\?\.oa_mode==="PLATFORM"/);
 assert.match(directory,/customerUrl\(t\.slug,"reserve",t\.oa_mode\)/);
 assert.match(directory,/customerUrl\(t\.slug,"queue",t\.oa_mode\)/);
});

test("merchant hero previews its management workflow with clearly marked sample data",()=>{
 assert.match(landing,/class="qm-merchant-preview"/);
 assert.match(landing,/店家後台操作靜態示意/);
 assert.match(landing,/後台畫面示意/);
 assert.match(landing,/目前叫號/);
 assert.match(landing,/A012/);
 assert.match(landing,/非即時門市資料/);
 assert.doesNotMatch(landing,/<div class="scene-label">介面示意<\/div>/);
});

test("merchant homepage displays benefits, three independent tools and a synchronized calling illustration",()=>{
 for(const section of ["benefits","features","sync","industries","demo","how-it-works","customer-experience","faq"]){
  assert.match(landing,new RegExp('id="'+section+'"'));
 }
 for(const text of ["減少人工登記","現場線上同步叫號","提前掌握訂單","一鍵叫號","店內電視／看板","顧客手機","免費建立店家","店家端"]){
  assert.ok(landing.includes(text),"Missing merchant conversion text: "+text);
 }
 const css=read("saas/assets/marketing/dual-portals.css");
 assert.match(css,/\.qm-benefit-grid/);
 assert.match(css,/\.qm-sync-demo/);
 assert.match(css,/\.qm-industry-switcher/);
 assert.match(css,/@media\(max-width:450px\)/);
});

test("merchant SEO remains machine-readable and the test site keeps its own canonical URL",()=>{
 const description=landing.match(/<meta name="description" content="([^"]+)">/);
 for(const word of ["線上預約","同步叫號","線上點餐","早餐店","診所","美髮","維修"])assert.ok(description?.[1].includes(word),word);
 assert.match(landing,/rel="canonical" href="https:\/\/hub-google\.github\.io\/LINE\/booking\/home\.html"/);
 const script=landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 const json=JSON.parse(script[1]);assert.equal(json["@context"],"https://schema.org");
 assert.ok(json["@graph"].some(x=>x["@type"]==="WebApplication"));
 assert.doesNotMatch(landing,/<meta name="keywords"/);
 const sitemap=read("saas/sitemap.xml");
 for(const page of ["home.html","customer.html","directory.html","my-records.html","merchant-center.html","merchant-register.html"]){
  assert.ok(sitemap.includes("https://hub-google.github.io/LINE/booking/"+page),"missing sitemap "+page);
 }
 assert.match(build,/copyFile\(path\.join\(src, "sitemap\.xml"\)/);
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
 assert.match(publish,/home\.html (?:video\.html )?for-merchants\.html for-customers\.html merchant\.html customer\.html demo\.html board\.html/);
 assert.match(landing,/href="\.\/demo\.html\?role=merchant"/);
 for(const id of ["breakfast","salon","repair","clinic"])assert.match(html,new RegExp('data-scene="'+id+'"'));
 const order=[...html.matchAll(/data-scene="(repair|breakfast|salon|clinic)"/g)].map(x=>x[1]);
 assert.deepEqual(order,["repair","breakfast","salon","clinic"],"Queue demo must appear first");
 assert.match(html,/data-scene="repair" aria-pressed="true"/);
 const primary=source.match(/const primaryTab = ([^;]+);/);
 assert.ok(primary,"each case must have an immediate customer action");
 for(const [scene,tab] of [["repair","queue"],["breakfast","order"],["salon","reserve"],["clinic","reserve"]]){
  assert.ok(primary[1].includes(scene+':"'+tab+'"'),scene+" must open "+tab);
 }
 assert.doesNotMatch(source,/function landing\(\)/);
 assert.doesNotMatch(source,/data-tab="home"/);

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
 let now=Date.now();
 class DemoDate extends Date { static now(){return now;} }
 const handlers={},elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{id,value:"",textContent:"",innerHTML:"",hidden:false,classList:{toggle(){}},setAttribute(){},scrollIntoView(){}});
  return elements.get(id);
 };
 const doc={
  body:{dataset:{}},
  getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener:(name,cb)=>{handlers[name]=cb}
 };
 // Production demo uses a 15-second cancel countdown; VM tests do not run timers.
 runInNewContext(source,{document:doc,location:{search:"?role=customer"},URLSearchParams,Intl,Date:DemoDate,setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}});
 const click=(selector,data)=>handlers.click({target:{closest:s=>s===selector?{dataset:data}:null}});
 const change=(data)=>handlers.change({target:data});
 const input=(id,value)=>handlers.input({target:{id,value}});
 assert.match(el("root").innerHTML,/我的現場號碼/);
 assert.match(el("root").innerHTML,/立即線上取號/);
 click("[data-scene]",{scene:"breakfast"});
 assert.match(el("root").innerHTML,/選擇餐點/);
 assert.doesNotMatch(el("root").innerHTML,/id="customer-name"/,"Pickup never asks for a name");
 input("customer-phone","0912345678");
 click("[data-act]",{act:"qty",id:"egg",delta:"1"});
 click("[data-act]",{act:"review-order"});
 assert.match(el("root").innerHTML,/請核對送出前的訂餐內容/);
 click("[data-act]",{act:"order-submit"});
 assert.match(el("root").innerHTML,/B003/);
 assert.match(el("notifications").innerHTML,/訂餐已送出/);
 click("[data-role]",{role:"staff"});
 assert.match(el("root").innerHTML,/取餐訂單管理/);
 assert.doesNotMatch(el("root").innerHTML,/data-id="B003"/,"Order stays hidden during the 15-second grace period");
 now+=16000;
 click("[data-role]",{role:"staff"});
 assert.match(el("root").innerHTML,/data-id="B003"/,"Order becomes available after 15 seconds");
 click("[data-act]",{act:"order-status",id:"B003",value:"ACCEPTED"});
 assert.match(el("notifications").innerHTML,/已接單/);
 click("[data-act]",{act:"order-status",id:"B003",value:"REJECTED"});
 assert.match(el("root").innerHTML,/已拒單|店家已取消訂單/);
 click("[data-scene]",{scene:"repair"});
 assert.match(el("root").innerHTML,/叫號操作/,"Selecting another industry keeps the merchant role");
 click("[data-role]",{role:"customer"});
 assert.match(el("root").innerHTML,/立即線上取號/);
 click("[data-act]",{act:"take-number"});
 assert.match(el("root").innerHTML,/R015/);
 assert.match(el("notifications").innerHTML,/取號成功/);
 click("[data-role]",{role:"staff"});
 click("[data-act]",{act:"next"});
 assert.match(el("notifications").innerHTML,/輪到您的號碼/);
 change({dataset:{statusKind:"ticket",id:"R013"},value:"PASSED",matches:s=>s==="[data-status-kind]"});
 assert.match(el("root").innerHTML,/已過號/);
 click("[data-scene]",{scene:"salon"});
 assert.match(el("root").innerHTML,/搜尋與篩選預約/,"Selecting another industry keeps the merchant role");
 click("[data-role]",{role:"customer"});
 assert.match(el("root").innerHTML,/選擇預約日期與時間/);
 input("contact-name","示範顧客");input("contact-phone","0912345678");
 click("[data-act]",{act:"unit",value:"Ken"});
 click("[data-act]",{act:"review-reserve"});
 click("[data-act]",{act:"reserve-submit"});
 assert.match(el("notifications").innerHTML,/預約成功/);
 click("[data-role]",{role:"staff"});
 assert.match(el("root").innerHTML,/預約管理/);
 click("[data-scene]",{scene:"clinic"});
 assert.match(el("root").innerHTML,/搜尋與篩選預約/,"Selecting another industry keeps the merchant role");
 click("[data-role]",{role:"customer"});
 assert.match(el("root").innerHTML,/選擇預約場次/);
 for(const doctor of ["小兒科 陳醫師(1診)","小兒科 王醫師(2診)","皮膚科 張醫師(3診)"]){
  assert.ok(el("root").innerHTML.includes(doctor),doctor+" should appear in clinic booking options");
 }
 input("contact-name","示範顧客");input("contact-phone","0912345678");
 click("[data-act]",{act:"unit",value:"3診"});
 assert.match(el("root").innerHTML,/皮膚科門診/);
 click("[data-act]",{act:"unit",value:"2診"});
 click("[data-act]",{act:"review-reserve"});
 click("[data-act]",{act:"reserve-submit"});
 assert.match(el("root").innerHTML,/P004/);
 click("[data-role]",{role:"staff"});
 change({dataset:{statusKind:"reservation",id:"P004"},value:"CHECKED_IN",matches:s=>s==="[data-status-kind]"});
 assert.match(el("root").innerHTML,/C2-004/);
 assert.match(el("notifications").innerHTML,/已完成報到/);
 click("[data-tab]",{tab:"queue"});
 change({id:"staff-room",value:"3診",matches:()=>false});
 assert.match(el("root").innerHTML,/皮膚科 張醫師/);
 click("[data-act]",{act:"next"});
 assert.match(el("notifications").innerHTML,/皮膚科 張醫師/);
 assert.match(el("notifications").innerHTML,/C3-003/);
});


test("merchant detail and customer app keep direct action paths with legacy redirects",()=>{
 const merchant=read("saas/merchant.html");
 const customer=read("saas/customer.html");
 const redirectCustomer=rawReadFileSync(path.join(root,"saas/for-customers.html"),"utf8");
 const redirectMerchant=rawReadFileSync(path.join(root,"saas/for-merchants.html"),"utf8");
 for(const [name,html] of [["merchant.html",merchant],["customer.html",customer]]){
  assert.match(html,/line-saas-build" content="__LINE_SAAS_BUILD__"/);
  assert.match(html,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
  assert.match(build,new RegExp('"'+name.replaceAll(".","\\.")+'"'));
  assert.match(publish,new RegExp(name.replaceAll(".","\\.")));
  assert.match(html,/<title>/);
  assert.match(html,/rel="canonical"/);
  assert.ok(read("saas/sitemap.xml").includes("https://hub-google.github.io/LINE/booking/"+name));
 }
 assert.match(merchant,/現場與線上即時同步叫號/);
 assert.match(merchant,/href="\.\/demo\.html\?role=merchant"/);
 assert.match(customer,/id="keyword"/);
 assert.match(customer,/id="results"/);
 assert.match(customer,/data-customer-service="預約"/);
 assert.match(customer,/href="\.\/my-records\.html"/);
 assert.match(rawReadFileSync(path.join(root,"saas/customer.html"),"utf8"),/assets\/directory\/main\.js/);
 assert.doesNotMatch(rawReadFileSync(path.join(root,"saas/customer.html"),"utf8"),/class="qm-role-hero"|簡單三步驟/);
 assert.match(redirectCustomer,/\.\/customer\.html/);
 assert.match(redirectMerchant,/\.\/merchant\.html/);
});

test("shared navigation switches by role without creating two login systems",()=>{
 const js=read("saas/assets/marketing/shared-header.js");
 const css=read("saas/assets/marketing/shared-header.css");
 for(const p of ["home.html","merchant.html","customer.html","demo.html","merchant-center.html","directory.html","my-records.html"]){
  const html=rawReadFileSync(path.join(root,"saas",p),"utf8");
  assert.match(html,/id="marketing-header"/);
  assert.match(html,/assets\/marketing\/shared-header\.js/);
  assert.match(html,/assets\/marketing\/shared-header\.css/);
 }
 for(const name of ["店家首頁","經營效益","產品功能","適用產業","免費體驗","操作教學","顧客版","找店家","我的紀錄","店家版"]){
  assert.ok(js.includes(name),"Missing role navigation "+name);
 }
 assert.match(js,/merchantPages/);
 assert.match(js,/data-header-role/);
 assert.match(js,/site-auth-root/);
 assert.match(js,/qm-public-mobile/);
 assert.match(css,/@media\(max-width:620px\)/);
 const syntax=spawnSync(process.execPath,["--check"],{input:js,encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
});

test("directory merchant cards expose enabled actions without duplicate labels or activity counts",()=>{
 const script=read("saas/assets/directory/main.js");
 const style=read("saas/assets/directory/page.css");
 assert.match(script,/function categoryBadge\(t\)/);
 assert.match(script,/const category=categoryBadge\(t\)/);
 for(const label of ["線上預約","現場取號","線上點餐","平台 LINE 服務"]){
  assert.ok(!script.includes('<span class="badge">'+label+'</span>'),"duplicate status badge: "+label);
 }
 assert.doesNotMatch(script,/popularity-metrics|近30天 · 預約/);
 assert.match(script,/services\.reservation\?'<a class="btn"/);
 assert.match(script,/services\.queue\?'<a class="btn/);
 assert.match(script,/services\.pickup\?'<a class="btn secondary"/);
 assert.match(script,/services\.queue&&services\.calling/);
 assert.match(style,/\.merchant-card\{[^}]*min-height:180px/);
 const check=spawnSync(process.execPath,["--input-type=module","--check"],{input:script,encoding:"utf8"});
 assert.equal(check.status,0,check.stderr);
});
