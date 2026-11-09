import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const app=read("saas/index.html");
const css=read("saas/booking-theme.css");
const build=read("../.github/scripts/build-line-saas.mjs");
const deploy=read("../.github/workflows/line-saas-pages.yml");

test("customer and merchant management use the real shared brand stylesheet",()=>{
 assert.match(app,/<link rel="stylesheet" href="\.\/booking-theme\.css\?build=__LINE_SAAS_BUILD__">/);
 assert.match(app,/document\.body\.dataset\.portal=view/);
 assert.match(app,/function customerRender\(\)/);
 assert.match(app,/function staffRender\(\)/);
 assert.match(css,/--booking-forest:#173e34/);
 assert.match(css,/body\[data-portal="customer"\]/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.staff-record/);
 assert.match(css,/\.slots/);
 assert.match(css,/\.side-item\.active/);
 assert.match(css,/prefers-reduced-motion/);
});

test("generated staff and customer links use /booking/ without changing OAuth callback handling",()=>{
 assert.match(app,/const bookingPath=location\.pathname\.replace\(/);
 assert.match(app,/const route=\(v,s=slug,tab=""\)=>bookingPath/);
 assert.match(app,/const canonical=location\.origin\+bookingPath/);
 assert.match(app,/new URL\(location\.origin\+location\.pathname\)/);
 assert.match(app,/排隊怪獸 · 顧客服務/);
 assert.match(app,/排隊怪獸 · 門市管理/);
});

test("Pages builds the stylesheet and deploys only booking and legacy SaaS paths",()=>{
 assert.match(build,/await copyFile\(path\.join\(src, "booking-theme\.css"\)/);
 assert.match(deploy,/for product in booking saas/);
 assert.match(deploy,/for f in [^\n]*index\.html[^\n]*home\.html/);
 assert.match(deploy,/release\.json booking-theme\.css/);
 assert.match(deploy,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.doesNotMatch(deploy,/git -C "\$pubdir" add\s+--all/);
});

test("staff backoffice keeps compact mobile controls and progressive records",()=>{
 assert.match(app,/const staffQuickNav=view==="staff"/);
 assert.match(app,/nav\("工作台","dashboard",staffTab,"staff"\)/);
 assert.match(app,/nav\("預約","bookings",staffTab,"staff"\)/);
 assert.match(app,/nav\("叫號","queue",staffTab,"staff"\)/);
 assert.match(app,/function enhanceStaffUI\(\)/);
 assert.match(app,/function staffListPage\(items,key,renderItem\)/);
 assert.match(app,/staffListPage\(visibleOpen,"booking-open",card\)/);
 assert.match(app,/staffListPage\(openTickets,"ticket-open",card\)/);
 assert.match(app,/staffSecondaryByTab/);
 assert.match(css,/body\[data-portal="staff"\] \.staff-mobile-nav/);
 assert.match(css,/@media\(max-width:950px\)/);
 assert.match(css,/min-height:44px/);
});


test("pastel directory header keeps WCAG AA contrast on mobile",()=>{
 const monster=read("saas/monster-world.css");
 const directory=read("saas/directory.html");
 const rule=(selector)=>{
   const at=monster.indexOf(selector+"{");
   assert.ok(at>=0, "missing explicit contrast rule for "+selector);
   return monster.slice(at,monster.indexOf("}",at)+1);
 };
 const hex=(css,key)=>{
   const declaration=css.split(/[;{}]/).map(x=>x.trim()).find(x=>x.startsWith(key+":"));
   assert.ok(declaration,"missing "+key+" color: "+css);
   const match=declaration.slice(key.length+1).match(/^#[0-9a-fA-F]{6}(?=\s|!|$)/);
   assert.ok(match,"invalid "+key+" color: "+declaration);
   return match[0];
 };
 const lightness=(h)=>{
   const rgb=h.slice(1).match(/.{2}/g).map(part=>parseInt(part,16)/255);
   const c=rgb.map(x=>x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4));
   return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
 };
 const ratio=(a,b)=>{const v=[lightness(a),lightness(b)].sort((x,y)=>y-x);return (v[0]+0.05)/(v[1]+0.05)};
 const pairs=[
   [".page-header .header-links > a","#E5C3F6"],
   [".page-header .hero-heading .eyebrow","#E5C3F6"],
   [".page-header .hero-heading > p:not(.eyebrow)","#E5C3F6"],
   [".page-header .site-auth-slot.site-auth-dark .site-auth-button:not(.site-auth-login)","#E5C3F6"],
   [".main-panel .intro-copy p","#FFFFFF"],
   [".main-panel .search::placeholder","#FFFCFF"]
 ];
 for(const [selector,background] of pairs){
   const foreground=hex(rule(selector),"color");
   assert.ok(ratio(foreground,background)>=4.5,selector+" contrast is too low");
 }
 const login=rule(".site-auth-button.site-auth-login");
 assert.ok(ratio(hex(login,"background"),"#FFFFFF")>=4.5,"LINE login needs readable white type");
 assert.match(directory,/<header class="page-header">/);
 assert.match(directory,/class="site-auth-slot site-auth-dark"/);
 assert.match(directory,/monster-world\.css\?build=__LINE_SAAS_BUILD__/);
 assert.ok(directory.indexOf("monster-world.css")>directory.indexOf("site-auth.css"),"contrast layer must load last");
});


test("customer-facing pages share one design system; retired template redirects to the merchant guide",()=>{
 const pages=["index","home","directory","board","merchant-register","merchant-center","poster","privacy","terms","offline"];
 const brandCss=read("saas/monster-world.css");
 assert.match(brandCss,/branded product design system v2/);
 for(const page of pages){
  const html=read("saas/"+page+".html");
  assert.match(html,new RegExp('<body data-monster-page="'+page+'">'),page+" is missing brand scope");
  assert.match(html,/monster-world\.css/,page+" is missing shared stylesheet");
  if(page==="merchant-register"){
   assert.ok(html.indexOf("monster-world.css")>html.lastIndexOf("</style>"),"shared brand stylesheet must override the legacy merchant style");
  }
 }
 const legacyTemplate=read("saas/template.html");
 assert.match(legacyTemplate,/merchant-center\.html#setup/);
 assert.doesNotMatch(legacyTemplate,/商家後台設定預覽|Supabase/);
 for(const page of pages){
  assert.match(brandCss,new RegExp('data-monster-page="'+page+'"'),page+" must have tailored treatment");
 }
 assert.match(brandCss,/data-portal="staff"/);
 assert.match(brandCss,/data-portal="platform"/);
 assert.match(brandCss,/prefers-reduced-motion/);
 assert.match(brandCss,/@media print/);
});
