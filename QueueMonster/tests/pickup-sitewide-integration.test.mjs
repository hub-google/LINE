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
 assert.match(pickup,/so_pickup_save_settings/);
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
