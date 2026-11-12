import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const read=(name)=>readFileSync(fileURLToPath(new URL("../saas/"+name,import.meta.url)),"utf8");

test("booking portal brand is a real accessible link to the product home",()=>{
 const page=read("index.html");
 assert.match(page,/<a class="brand" href="\.\/home\.html" aria-label="排隊怪獸首頁">/);
 assert.match(page,/<\/a>\s*<nav class="headlinks"/);
 assert.doesNotMatch(page,/<div class="brand">/);
});

test("marketing homepage footer contains no duplicated navigation menu",()=>{
 const page=read("home.html");
 const footer=page.slice(page.indexOf('<footer class="footer">'));
 assert.doesNotMatch(footer,/footer-nav|平台管理|店家後台|遊戲逛店|公開叫號看板|搜尋店家/);
 assert.match(footer,/隱私權說明/);
 assert.match(footer,/服務條款/);
});

test("merchant directory has exactly one footer",()=>{
 const page=read("directory.html");
 assert.equal((page.match(/<footer\b/g)||[]).length,1);
 assert.equal((page.match(/<\/footer>/g)||[]).length,1);
});

test("customer homepage has no forced marketing headings and merchants control the optional intro",()=>{
 const source=read("app/customer-booking.js");
 const settings=read("app/staff/settings.js");
 const loading=read("app/data-loading.js");
 assert.doesNotMatch(source,/LINE 門市線上服務|選擇服務，立即開始/);
 assert.match(source,/const homepage=customerState\.customer\.homepage\|\|\{\}/);
 assert.match(source,/homepage\.show_intro!==true/);
 assert.match(source,/esc\(displayTitle\)/);
 assert.match(source,/return layout\(t\.name,"預約、取號與點餐・即時資料"/);
 assert.match(settings,/homepage-title/);
 assert.match(settings,/homepage-subtitle/);
 assert.match(settings,/homepage-show-label/);
 assert.match(settings,/save-customer-homepage/);
 assert.match(loading,/so_get_customer_homepage/);
});

test("merchant guide mirrors unified settings navigation and avoids hidden mobile nav items",()=>{
 const guide=read("merchant-center.html");
 const css=read("assets/merchant-center/page.css");
 assert.equal((guide.match(/<aside class="qm-nav">/g)||[]).length,4);
 assert.doesNotMatch(guide,/菜單及服務設定|多分店管理|服務單位與場次/);
 assert.match(guide,/qm-nav-item active">設定/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/\.qm-admin \.qm-nav\{display:flex;gap:5px;overflow-x:auto/);
});


test("iPhone mobile branding links and menu close button have 44px touch targets",()=>{
 const css=read("monster-world.css");
 for(const rule of [
  'body[data-monster-page="home"] .site-head .logo',
  'body[data-monster-page="directory"] .page-header .brand',
  'body[data-monster-page="merchant-register"] header .brand',
  'body[data-monster-page="merchant-center"] .top-links .top-link',
  'body[data-monster-page="index"] header a.brand',
  'body[data-monster-page="directory"] footer a',
  'body[data-monster-page="home"] .menu-panel .mobile-menu-close'
 ])assert.ok(css.includes(rule),"missing mobile target for "+rule);
 assert.match(css,/min-height:44px/);
});


test("first-time customers see booking or queue before public board with one LINE action",()=>{
 const source=read("app/customer-booking.js");
 const style=read("monster-world.css");
 assert.match(source,/routeState\.customerTab==="reserve"\?"線上預約"/);
 assert.match(source,/routeState\.customerTab==="queue"\?"現場取號"/);
 assert.match(source,/lineLoginUrl\(\)/);
 assert.match(source,/LINE 登入<\/a>/);
 assert.match(source,/為避免機器人或惡意假預約，請先透過 LINE 登入/);
 assert.match(source,/customer-entry-card/);
 assert.match(source,/customer-public-board-link/);
 assert.ok(source.indexOf('customer-entry-card')<source.indexOf('customer-public-board-link'),"booking CTA should precede queue board");
 assert.doesNotMatch(source,/box\("LINE 身分授權"/);
 assert.doesNotMatch(source,/box\("門市公開即時叫號"/);
 assert.match(style,/\.customer-entry-card/);
 assert.match(style,/\.customer-public-board-link/);
});
test("returning verified LINE customers can open another platform-OA shop without another login",()=>{
 const backend=readFileSync(fileURLToPath(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url)),"utf8");
 assert.match(backend,/reusablePlatformLineIdentity\(db,user\.id,expectedChannelId\)/);
 assert.match(backend,/reusablePlatformLineIdentity\(db,user\.id,expectedChannel\)/);
 assert.match(backend,/\.eq\("user_id",userId\)\.eq\("login_channel_id",channelId\)/);
 assert.match(backend,/row\.line_sub!==candidate\.line_sub/);
 assert.match(backend,/age<=30\*24\*60\*60\*1000/);
 assert.match(backend,/if \(!ownOa && \(/);
 assert.match(backend,/onConflict:"tenant_id,user_id"/);
});

test("online ordering has its own enabled-only sidebar link and records remain unified",()=>{
 const source=read("app/customer-booking.js");
 const route=read("app/route-state.js");
 const css=read("monster-world.css");
 assert.match(source,/const pickupEnabled=pickupState\.customer\?\.settings\?\.enabled===true/);
 assert.match(source,/\(pickupEnabled\?nav\("線上點餐","order",routeState\.customerTab,"customer"\):""\)/);
 assert.match(source,/const serviceView=\["progress","mine"\]\.includes\(routeState\.customerTab\)/);
 assert.match(source,/nav\("我的服務","mine",serviceView\?"mine":routeState\.customerTab,"customer"\)/);
 assert.doesNotMatch(source,/serviceTabButton\("order","線上點餐"\)/);
 for(const [tab,label] of [["progress","我的取號"],["mine","我的紀錄"]]){
   assert.ok(source.includes('serviceTabButton("'+tab+'","'+label+'")'));
 }
 for(const tab of ["order","progress","mine"])assert.ok(route.includes('"'+tab+'"'),"must retain existing tab deep link "+tab);
 assert.match(source,/customer-service-switcher/);
 assert.match(css,/\.customer-service-switcher button:focus-visible/);
 assert.match(source,/serviceNav\+html/);
});
