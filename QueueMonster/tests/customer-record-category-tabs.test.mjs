import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const html=read("../saas/directory.html"),js=read("../saas/assets/directory/main.js"),
 menu=read("../../.github/scripts/publish_rich_menu.py"),
 sql=read("../supabase/migrations/20261113084500_customer_record_category_lists.sql");
test("my history is one page with three simultaneously rendered sections, never separate tabs",()=>{
 assert.match(html,/id="tab-mine" href="\?mode=mine">我的紀錄/);
 assert.doesNotMatch(html,/id="combined-switch"|id="section-ticket"|id="section-order"|id="section-reservation"/);
 assert.match(js,/const kinds=\[\["reservation","預約紀錄"\],\["ticket","取號紀錄"\],\["order","訂單紀錄"\]\]/);
 assert.match(js,/class="history-section"/);
 assert.match(js,/id="history-/);
 assert.match(js,/history-cards/);
 assert.doesNotMatch(js,/const recordKind=/);
});
test("one LINE-verified login queries all three types and preserves exact merchant record links",()=>{
 assert.match(js,/Promise\.all\(kinds\.map\(p_kind=>sb\.rpc\("so_my_platform_records",\{p_kind\}\)\)\)/);
 assert.match(js,/personalRecords=Object\.fromEntries/);
 assert.match(js,/dest\.searchParams\.set\("kind",kind\)/);
 assert.match(js,/dest\.searchParams\.set\("ticket",r\.id\)/);
 assert.match(js,/customerUrl\(slug,tab,r\.oa_mode\)/);
 assert.match(js,/so_site_header_identity/);
});
test("platform OA has one personal-history tile and independent entry points",()=>{
 assert.match(menu,/"我的紀錄".*"directory\.html\?mode=mine"/);
 assert.doesNotMatch(menu,/mode=mine&section=/);
 assert.match(menu,/現場取號.*service=%E5%8F%96%E8%99%9F/);
 assert.match(menu,/常見問題.*home\.html#faq/);
 assert.doesNotMatch(menu,/"上次預約看板"|"取號紀錄"|"訂單紀錄"/);
});
test("verified cross-store personal history is scoped to the logged-in LINE identity",()=>{
 for(const term of ["public.qm_reservations","public.qm_tickets","public.qm_pickup_orders","verified_subjects","auth.uid()","linked_users","grant execute on function public.so_my_platform_records(text) to authenticated"]){
  assert.ok(sql.includes(term),term);
 }
 assert.ok(!sql.includes("p_user_id")&&!sql.includes("p_line_sub"));
});