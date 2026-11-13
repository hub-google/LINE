import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const search=read("../saas/directory.html");
const history=read("../saas/my-records.html");
const header=read("../saas/assets/marketing/shared-header.js");
const directoryJs=read("../saas/assets/directory/main.js");
const merchantPage=read("../saas/app/customer-booking.js");
const sharedUi=read("../saas/app/shared-ui.js");
const siteAuth=read("../saas/site-auth.js");
const callback=read("../saas/app/line-session.js");
const menu=read("../../.github/scripts/publish_rich_menu.py");
const bot=read("../supabase/functions/line-bridge/index.ts");
const build=read("../../.github/scripts/build-line-saas.mjs");
const deploy=read("../../.github/workflows/line-saas-pages.yml");
const sitemap=read("../saas/sitemap.xml");

test("Search Stores and My Records are distinct pages in the same public top navigation",()=>{
 assert.match(header,/\["搜尋店家","\.\/directory\.html","directory\.html"\]/);
 assert.match(header,/\["我的紀錄","\.\/my-records\.html","my-records\.html"\]/);
 assert.match(header,/qm-public-quicklinks/);
 assert.doesNotMatch(search,/<nav class="tabs"/);
 assert.doesNotMatch(history,/<nav class="tabs"/);
 assert.match(search,/<h1 class="eyebrow">搜尋店家，立即使用服務<\/h1>/);
 assert.match(history,/<h1 class="eyebrow">我的紀錄<\/h1>/);
 assert.match(history,/data-customer-surface="cross-store-history"/);
 assert.match(history,/所有店家的預約、取號與訂餐紀錄/);
});

test("old public store discovery and personal record links retain their meaning",()=>{
 for(const mode of ["mine","last-board"])
  assert.ok(search.includes(mode),"missing historical compatibility for "+mode);
 assert.match(search,/location\.replace\(target\.href\)/);
 assert.match(search,/query\.delete\("section"\)/);
 assert.match(directoryJs,/const isQueueSection=mode==="queue"/);
 assert.match(directoryJs,/const isHistorySection=location\.pathname\.endsWith\("\/my-records\.html"\)/);
 assert.match(directoryJs,/mode==="game"/);
 assert.match(directoryJs,/so_public_store_search/);
 assert.match(directoryJs,/so_public_popular_stores/);
});

test("platform history is cross-store; individual merchant history and detail routes remain distinct",()=>{
 assert.match(directoryJs,/so_my_platform_records/);
 assert.match(directoryJs,/Promise\.all\(kinds\.map\(p_kind=>sb\.rpc\("so_my_platform_records"/);
 assert.match(directoryJs,/dest\.searchParams\.set\("item",r\.id\)/);
 assert.match(directoryJs,/dest\.searchParams\.set\("ticket",r\.id\)/);
 assert.match(directoryJs,/anchor\.dataset\.oaMode==="PLATFORM"/);
 assert.match(merchantPage,/nav\("歷史紀錄","mine"/);
 assert.match(merchantPage,/renderCustomerDetail/);
 assert.match(merchantPage,/href="\.\/my-records\.html">我的跨店紀錄/);
 assert.match(sharedUi,/href="\.\/my-records\.html"/);
});

test("LINE OAuth, official account and publishing all recognize the standalone history URL",()=>{
 assert.match(siteAuth,/directory\|my-records\|board/);
 assert.match(callback,/directory\|my-records\|board/);
 assert.match(menu,/我的紀錄.*my-records\.html/);
 assert.match(bot,/my-records\.html/);
 assert.match(build,/"my-records\.html"/);
 assert.match(deploy,/directory\.html my-records\.html merchant-register\.html/);
 assert.match(sitemap,/booking\/my-records\.html/);
});
