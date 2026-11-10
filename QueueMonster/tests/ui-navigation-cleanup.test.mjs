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
