import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
const sql=readFileSync(new URL("../supabase/migrations/20261112_qm_verified_issues_notice_indexes_closure.sql",import.meta.url),"utf8");
const app=readFileSync(new URL("../saas/app/schedule-settings.js",import.meta.url),"utf8");
test("pickup foreign keys have leading-column indexes",()=>{
 assert.match(sql,/qm_pickup_orders_user_id_fk_idx[\s\S]*?qm_pickup_orders \(user_id\)/);
 assert.match(sql,/qm_pickup_notice_events_order_id_fk_idx[\s\S]*?qm_pickup_notice_events \(order_id\)/);
});
test("closure conflict preview is manager-only and counts without editing customer records",()=>{
 assert.match(sql,/private\.so_role\(v_tenant\.id\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.so_schedule_closure_impact/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.so_schedule_closure_impact/);
 assert.match(sql,/r\.status IN \('CONFIRMED','CHECKED_IN'\)/);
 assert.match(sql,/o\.status IN \('NEW','ACCEPTED','PREPARING','READY'\)/);
 assert.match(app,/rpc\("so_schedule_closure_impact"/);
 assert.match(app,/if\(!window\.confirm\(message\)\)return true/);
 assert.match(app,/已停止儲存/);
});