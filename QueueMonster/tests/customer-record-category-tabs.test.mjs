import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const html=read("../saas/directory.html");
const js=read("../saas/assets/directory/main.js");
const menu=read("../../.github/scripts/publish_rich_menu.py");
const sql=read("../supabase/migrations/20261113084500_customer_record_category_lists.sql");
test("customer history has exactly three distinct record types",()=>{
 assert.ok(html.includes('id="tab-mine" href="?mode=mine">我的紀錄'));
 assert.ok(html.includes('id="section-reservation" href="./directory.html?mode=mine&amp;section=reservation">預約紀錄'));
 assert.ok(html.includes('id="section-ticket" href="./directory.html?mode=mine&amp;section=ticket">取號紀錄'));
 assert.ok(html.includes('id="section-order" href="./directory.html?mode=mine&amp;section=order">訂單紀錄'));
 assert.ok(!html.includes("section-board"));
 assert.ok(!html.includes("section-queue"));
 assert.ok(!html.includes("上次預約看板"));
 assert.ok(!html.includes('id="tab-queue"'));
});
test("history tabs read verified per-kind personal records and open exact merchant details",()=>{
 assert.ok(js.includes('const recordKind='));
 assert.ok(js.includes('so_my_platform_records'));
 assert.ok(js.includes('p_kind:recordKind'));
 assert.ok(js.includes('personalRecords.filter('));
 assert.ok(js.includes('detail.searchParams.set("kind",recordKind)'));
 assert.ok(js.includes('detail.searchParams.set("ticket",r.id)'));
 assert.ok(js.includes('customerUrl(slug,targetTab,r.oa_mode)'));
 assert.ok(!js.includes('sb.rpc("so_my_last_booking_board"'));
});
test("LINE official account matches website history links",()=>{
 assert.ok(menu.includes('"我的紀錄"'));
 assert.ok(menu.includes('"取號紀錄"'));
 assert.ok(menu.includes('"訂單紀錄"'));
 assert.ok(menu.includes('directory.html?mode=mine&section=ticket'));
 assert.ok(menu.includes('directory.html?mode=mine&section=order'));
 assert.ok(!menu.includes('"上次預約看板"'));
});
test("cross-store reservation, ticket and order data are scoped to verified LINE identity",()=>{
 for(const term of ['public.qm_reservations','public.qm_tickets','public.qm_pickup_orders',
    'verified_subjects','auth.uid()','linked_users','r.deleted_at is null',
    'k.deleted_at is null','o.user_id','grant execute on function public.so_my_platform_records(text) to authenticated']){
  assert.ok(sql.includes(term),term);
 }
 assert.ok(!sql.includes('p_user_id'));
 assert.ok(!sql.includes('p_line_sub'));
 assert.ok(sql.includes("from public,anon,authenticated"));
});
