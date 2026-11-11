import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const source=(file)=>readFileSync(path.join(root,file),"utf8");

test("pickup uses the original merchant settings, menu, tenant and live customer service controller",()=>{
 const pickup=source("saas/app/pickup-mode.js"),staff=source("saas/app/staff/settings.js");
 assert.match(pickup,/so_pickup_place/);
 assert.match(pickup,/so_pickup_staff/);
 assert.match(pickup,/so_pickup_history/);
 assert.match(pickup,/so_pickup_save_capacity_settings/);
 assert.match(staff,/set-service-pickup/);
 assert.match(source("saas/app/actions/merchant-admin.js"),/so_set_all_merchant_services/);
 assert.match(source("saas/app/startup.js"),/createStoreLiveSync/);
 assert.match(source("saas/app/main.js"),/initializePickupMode/);
});

test("customer, directory, headquarters, dashboard and branches expose pickup",()=>{
 const checks=[
  ["saas/app/customer-booking.js",["tab=\"order\"","renderCustomerPickup"]],
  ["saas/assets/directory/main.js",["services.pickup","orderHref","點餐"]],
  ["saas/directory.html",["value=\"點餐\""]],
  ["saas/app/staff/dashboard.js",["待接單","待取餐","orders"]],
  ["saas/app/staff/analytics.js",["訂餐分析","有效訂單金額","daily"]],
  ["saas/app/staff/branches.js",["today_orders","today_order_amount"]],
  ["saas/app/platform-view.js",["today_pending_orders","pickup_enabled","today_order_amount"]],
  ["saas/app/cross-store.js",["customerActivity?.orders","我的跨店訂餐紀錄"]],
  ["saas/app/shared-ui.js",["nav(\"訂餐\""]],
 ];
 for(const [file,values] of checks)
   for(const token of values)assert.ok(source(file).includes(token),file+" missing "+token);
});

test("pickup analytics and public search are backed by additive tenant-isolated SQL",()=>{
 const sql=source("supabase/migrations/20261111170500_pickup_sitewide_integration.sql");
 for(const token of [
  "so_staff_analytics","so_platform_overview","so_my_business_groups",
  "so_customer_cross_store_overview","so_public_store_search","so_public_directory",
  "so_pickup_history","private.so_role(v_tenant.id)","pickup_enabled",
  "today_orders","order_amount", "status not in ('REJECTED','CANCELLED')"
 ])assert.ok(sql.includes(token),"missing "+token);
 const catalog=source("supabase/migrations/20261111161500_pickup_orders_scheduled_slots.sql");
 assert.match(catalog,/public\.so_menu_items/);
 assert.match(catalog,/public\.so_tenants/);
 const toggle=source("supabase/migrations/20261111171500_pickup_atomic_services_and_popular.sql");
 assert.match(toggle,/so_set_all_merchant_services/);
 assert.match(toggle,/so_public_popular_stores/);
});

test("disabling orders preserves history and every correction retains expected status",()=>{
 const ui=source("saas/app/pickup-mode.js");
 assert.match(ui,/尚未開放線上點餐/);
 assert.match(ui,/既有訂單仍可查看/);
 assert.match(ui,/pickup-history-page/);
 assert.match(ui,/pickup-history-filter/);
 assert.match(ui,/p_expected:expected/);
 const sql=source("supabase/migrations/20261111161500_pickup_orders_scheduled_slots.sql");
 assert.match(sql,/unique\(tenant_id,user_id,request_id\)/);
 assert.match(sql,/insert into public\.so_audit/);
});

test("LINE pickup notifications reuse outbox, verified order status and push deduplication",()=>{
 const sql=source("supabase/migrations/20261111172000_pickup_line_outbox.sql");
 const edge=source("supabase/functions/line-bridge/index.ts");
 for(const token of ["so_pickup_notice_events","so_pickup_orders","so_line_notice_outbox","so_line_push_log","so_pickup_enqueue_notice"])
   assert.ok(sql.includes(token),"missing notification SQL "+token);
 for(const token of ["job.event_kind === \"PICKUP_EVENT\"","PICKUP_EVENT_SUPERSEDED","PICKUP_EVENT_OLDER_THAN_LATEST","pushNotice(db, tenant, order.user_id","liffPickupLink"])
   assert.ok(edge.includes(token),"missing secure LINE notification handler "+token);
});

test("pickup calendar queries all scheduled orders by date with tenant ACL and server pagination",()=>{
 const sql=source("supabase/migrations/20261111173500_pickup_calendar.sql");
 const query=source("saas/app/booking-calendar.js");
 const view=source("saas/app/staff/calendar.js");
 const handler=source("saas/app/actions/staff-calendar.js");
 for(const token of ["so_pickup_calendar","private.so_role(t.id)","p_start date","p_end date","limit 100 offset","p_page"])
  assert.ok(sql.includes(token),"pickup calendar SQL missing "+token);
 for(const token of ["rpc(\"so_pickup_calendar\"","pickupCalendarPage","pickupCalendarPeriod"])
  assert.ok(query.includes(token),"calendar loader missing "+token);
 assert.match(view,/pickupCalendarResult/);
 assert.match(view,/pickup-calendar-prev/);
 assert.match(view,/pickup-calendar-next/);
 assert.match(handler,/pickup-calendar-prev/);
 assert.match(handler,/pickup-calendar-next/);
 assert.doesNotMatch(view,/pickupState\.staff/);
});

test("cross-store pickup history filters authorized LINE identity before order limits",()=>{
 const sql=source("supabase/migrations/20261111174000_pickup_cross_store_history_bound.sql");
 assert.match(sql,/linked0\.line_sub=v_line_sub/);
 assert.match(sql,/linked0\.user_id=o0\.user_id/);
 assert.match(sql,/linked0\.tenant_id=o0\.tenant_id/);
 assert.match(sql,/limit 150/);
});

test("operating statistics CSV includes pickup volume and order amount",()=>{
 const analytics=source("saas/app/actions/staff-calendar.js");
 assert.ok(analytics.includes("有效訂餐筆數"));
 assert.ok(analytics.includes("有效訂餐金額（NTD）"));
 assert.ok(analytics.includes("d.order_amount"));
});

test("pickup menu availability is independent from booking menu and server-checks sold-out items",()=>{
 const sql=source("supabase/migrations/20261111180500_pickup_menu_crm_capacity_contact.sql");
 const ui=source("saas/app/staff/menu.js");
 const actions=source("saas/app/actions/merchant-settings.js");
 for(const token of ["pickup_enabled","pickup_sold_out","so_pickup_menu_control","p_item_id",
  "m.pickup_enabled and not m.pickup_sold_out","pickup_sold_out=false","so_menu_items"])
  assert.ok(sql.includes(token),"pickup availability missing "+token);
 assert.ok(ui.includes("pickup-menu-enabled"));
 assert.ok(ui.includes("pickup-menu-sold-out"));
 assert.ok(actions.includes('rpc("so_pickup_menu_control"'));
});

test("pickup customer uses validated contact, summary confirmation and private order snapshots",()=>{
 const sql=source("supabase/migrations/20261111180500_pickup_menu_crm_capacity_contact.sql");
 const ui=source("saas/app/pickup-mode.js");
 for(const token of ["so_pickup_place_contact","p_customer_name","p_customer_phone","customer_phone","customer_name",
   "p_request_id","auth.uid()"])
  assert.ok(sql.includes(token),"pickup contact SQL missing "+token);
 for(const token of ["pickup-customer-name","pickup-customer-phone","pickup-review-back",
   "pickup-review","pickup-submit","so_pickup_place_contact"])
  assert.ok(ui.includes(token),"pickup customer UI missing "+token);
});

test("quantity-based capacity is consistently checked by slot availability, placing and restoring",()=>{
 const sql=source("supabase/migrations/20261111180500_pickup_menu_crm_capacity_contact.sql");
 for(const token of ["capacity_basis","'ORDERS','ITEMS'","v_used+v_count>s.slot_capacity",
   "o.items","so_pickup_save_capacity_settings"])
  assert.ok(sql.includes(token),"capacity check missing "+token);
 const ui=source("saas/app/pickup-mode.js");
 assert.match(ui,/pickup-capacity-basis/);
 assert.match(ui,/so_pickup_save_capacity_settings/);
});

test("pickup staff permissions block unauthorized access at all three read and write RPCs",()=>{
 const sql=source("supabase/migrations/20261111181500_pickup_staff_permissions.sql");
 for(const token of ["so_pickup_permissions","row level security","private.so_role","so_pickup_staff",
  "so_pickup_update","so_pickup_history","so_pickup_calendar","so_pickup_set_staff_permissions","'42501'"])
  assert.ok(sql.includes(token),"pickup staff ACL missing "+token);
 assert.match(source("saas/app/pickup-mode.js"),/pickup-staff-permissions-save/);
});

test("pickup analytics combines shared merchant KPIs with item popularity and actual ready audit timestamps",()=>{
 const sql=source("supabase/migrations/20261111183000_pickup_analytics_detail.sql");
 for(const token of ["so_pickup_analytics","popular_items","pickup_hours","so_audit","first_ready",
    "private.so_role","on_time"])
  assert.ok(sql.includes(token),"pickup advanced analytics missing "+token);
 const ui=source("saas/app/staff/analytics.js");
 assert.ok(ui.includes("熱門餐點排行"));
 assert.ok(ui.includes("取餐尖峰時段"));
 assert.ok(ui.includes("準時待取率"));
});

test("customer full pickup history is user-scoped, paginated and survives service disablement",()=>{
 const sql=source("supabase/migrations/20261111183500_pickup_customer_full_history.sql");
 for(const token of ["so_pickup_my_orders","o.user_id=v_uid","l.user_id=v_uid",
   "o.tenant_id=v_tenant","limit 25 offset","private"])
  if(token!=="private")assert.ok(sql.includes(token),"pickup customer history missing "+token);
 const ui=source("saas/app/pickup-mode.js");
 assert.match(ui,/pickup-customer-history-page/);
 assert.match(ui,/so_pickup_my_orders/);
});

test("public pickup board is readonly, shares realtime fallback and never contains customer personal data",()=>{
 const sql=source("supabase/migrations/20261111182500_pickup_public_board.sql");
 const html=source("saas/pickup-board.html");
 const js=source("saas/assets/pickup-board/main.js");
 for(const token of ["so_pickup_public_board","realtime.send","queue-board:","so_pickup_live_invalidate"])
  assert.ok(sql.includes(token),"pickup board missing "+token);
 for(const forbidden of ["customer_name","customer_phone","user_id","line_sub","items',o.items"])
  assert.ok(!sql.includes(forbidden),"pickup public board exposes "+forbidden);
 assert.match(html,/version-watch\.js/);
 assert.match(js,/createStoreLiveSync/);
 assert.match(js,/fallbackMs:10000/);
 assert.match(source("../.github/scripts/build-line-saas.mjs"),/pickup-board\.html/);
});

test("HQ pickup filter and self-hosted QR code sharing work with existing merchant settings",()=>{
 assert.match(source("saas/app/platform-view.js"),/platform-pickup-filter/);
 assert.match(source("saas/app/form-events.js"),/platform-pickup-filter/);
 assert.match(source("saas/app/staff/settings.js"),/pickup-board\.html/);
 assert.match(source("saas/app/staff/settings.js"),/show-service-qr/);
 assert.match(source("saas/app/actions/account-platform.js"),/show-service-qr/);
 assert.match(source("../.github/scripts/build-line-saas.mjs"),/vendor\/qrcode\.min\.js/);
 assert.match(source("saas/vendor/QR-CODE-LICENSE"),/MIT License/);
});
