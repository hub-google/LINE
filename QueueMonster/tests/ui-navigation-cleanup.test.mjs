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
 assert.match(source,/return layout\(t\.name,"預約與取號・即時資料"/);
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
