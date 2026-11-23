import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const html=read("../saas/my-records.html"),directory=read("../saas/directory.html"),js=read("../saas/assets/directory/main.js"),
 header=read("../saas/assets/marketing/shared-header.js"),
 menu=read("../../.github/scripts/publish_rich_menu.py"),
 sql=read("../supabase/migrations/20261113084500_customer_record_category_lists.sql");
test("my history is one page with three simultaneously rendered sections, never separate tabs",()=>{
 assert.match(html,/<h1 class="eyebrow">我的紀錄<\/h1>/);
 assert.match(html,/data-customer-surface="cross-store-history"/);
 assert.doesNotMatch(directory,/class="tabs"/);
 assert.match(directory,/location\.replace\(target\.href\)/);
 assert.match(header,/\["搜尋店家","\.\/directory\.html\?mode=search"/);
 assert.match(header,/\["我的紀錄","\.\/my-records\.html"/);
 assert.doesNotMatch(html,/id="combined-switch"|id="section-ticket"|id="section-order"|id="section-reservation"/);
 assert.match(js,/const kinds=\[\["reservation","預約紀錄"\],\["ticket","取號紀錄"\],\["order","訂單紀錄"\]\]/);
 assert.match(js,/class="history-section"/);
 assert.match(js,/id="history-/);
 assert.match(js,/history-cards/);
 assert.doesNotMatch(js,/const recordKind=/);
});
test("one LINE-verified login queries all three types and preserves exact merchant record links",()=>{
 assert.match(js,/Promise\.all\(kinds\.map\(p_kind=>sb\.rpc\("so_my_platform_records_page",/);
 assert.match(js,/historyHasMore/);
 assert.match(js,/data-history-more/);
 assert.match(js,/p_offset:offset,p_limit:historyPageSize\+1/);
 assert.match(js,/personalRecords=Object\.fromEntries/);
 assert.match(js,/dest\.searchParams\.set\("kind",kind\)/);
 assert.match(js,/dest\.searchParams\.set\("ticket",r\.id\)/);
 assert.match(js,/customerUrl\(slug,tab,r\.oa_mode\)/);
 assert.match(js,/so_site_header_identity/);
});
test("platform OA offers distinct active/history and store entry points in the original 3x2 layout",()=>{
 assert.match(menu,/"我的進度".*"my-records\.html\?scope=active"/);
 assert.match(menu,/"歷史紀錄".*"my-records\.html\?scope=history"/);
 assert.match(menu,/"常用店家".*"directory\.html\?mode=frequent"/);
 assert.match(menu,/"熱門店家".*"directory\.html\?mode=search"/);
 assert.match(menu,/platform:feedback/);
 assert.doesNotMatch(menu,/mode=mine&section=/);
 assert.doesNotMatch(menu,/"上次預約看板"|"取號紀錄"|"訂單紀錄"/);
});
test("verified cross-store personal history is scoped to the logged-in LINE identity",()=>{
 for(const term of ["public.qm_reservations","public.qm_tickets","public.qm_pickup_orders","verified_subjects","auth.uid()","linked_users","grant execute on function public.so_my_platform_records(text) to authenticated"]){
  assert.ok(sql.includes(term),term);
 }
 assert.ok(!sql.includes("p_user_id")&&!sql.includes("p_line_sub"));
});