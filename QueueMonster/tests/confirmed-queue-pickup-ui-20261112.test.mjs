import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("calling the next person remains available and only auto-passes a previous call in the same queue",()=>{
 const ui=read("saas/app/staff/queue.js");
 const sql=read("supabase/migrations/20261112_queue_next_call_auto_pass.sql");
 assert.match(ui,/const canCall=!!waiting\.length&&\(unitMode\?!!selected:!!t\.modules\.calling\)/);
 assert.doesNotMatch(ui,/!!waiting\.length&&!active/);
 assert.match(sql,/IF NOT FOUND THEN[\s\S]*?INSERT INTO public\.qm_audit\(tenant_id,actor,action,info\)/);
 assert.match(sql,/auto_pass_before_next_call/);
 assert.match(sql,/UPDATE public\.qm_tickets x SET status='PASSED'/);
 assert.match(sql,/NOT v_unit AND x\.service_session_id IS NULL/);
 assert.match(sql,/v_unit AND x\.service_session_id=s\.id/);
});
test("completed pickup orders have a reachable terminal state without a fourth permanently visible button",()=>{
 const pickup=read("saas/app/pickup-mode.js");
 const dash=read("saas/app/staff/dashboard.js");
 const cross=read("saas/app/cross-store.js");
 assert.match(pickup,/o\.status==="READY"\?"確認已取餐":"接單"/);
 assert.match(pickup,/o\.status==="READY"\?"PICKED_UP":"ACCEPTED"/);
 assert.match(pickup,/pickupStatusLabel/);
 assert.match(dash,/pickupStatusLabel\(o\.status\)/);
 assert.match(cross,/pickupStatusLabel\(x\.status\)/);
});
test("customer progress, directory, merchant settings and announcement uploads use clear operational UI",()=>{
 const progress=read("saas/app/queue-progress.js");
 const directory=read("saas/assets/directory/main.js");
 const settings=read("saas/app/staff/settings.js");
 const upload=read("saas/app/actions/queue-settings.js");
 const auth=read("saas/site-auth.js");
 assert.match(progress,/syncMode==="realtime"/);
 assert.match(progress,/每 5 秒/);
 assert.doesNotMatch(directory,/公開叫號看板/);
 assert.match(settings,/查看 LINE OA 綁定與教學/);
 assert.match(settings,/announcement-photo-files/);
 assert.match(upload,/storage\.from\(merchantBrandState\.MERCHANT_LOGO_BUCKET\)/);
 assert.match(upload,/images\.length\+files\.length>8/);
 assert.match(auth,/currentIdentity\?\.provider==="google"\?"G"/);
});

test("ticket status choices match the five queue KPIs without counting cancellations as completed",()=>{
 const ui=read("saas/app/shared-ui.js");
 const queue=read("saas/app/staff/queue.js");
 const picker=ui.slice(ui.indexOf("export function staffStatusPicker("),ui.indexOf("export function staffDeletePicker("));
 assert.ok(picker.includes('[["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["PASSED","已過號"],["COMPLETED","已完成"]]'));
 assert.doesNotMatch(picker,/["']ARRIVED["']|["']ADMITTED["']|["']SERVING["']/);
 assert.match(picker,/ticket-secondary-status/);
 assert.match(picker,/取消號碼牌/);
 assert.match(queue,/completedTickets=doneTickets\.filter\(x=>x\.status==="COMPLETED"\)/);
 assert.match(queue,/stat\("已完成",completedTickets\.length\)/);
 assert.match(queue,/已處理號碼牌/);
 assert.doesNotMatch(queue,/stat\("已結束"/);
});

test("free demo mirrors queue, phone, pickup grace, privacy and booking availability",()=>{
 const demo=read("saas/assets/demo/real-flow.js");
 const picker=demo.slice(demo.indexOf("function statusPicker(kind,item){"),demo.indexOf("function bookingCard("));
 assert.ok(picker.includes('[["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["PASSED","已過號"],["COMPLETED","已完成"]]'));
 assert.match(picker,/ticket-secondary-status/);
 assert.match(demo,/stat\("已完成",completed\.length\)/);
 assert.match(demo,/ts\.filter\(x=>x\.status==="CALLED"\)\.forEach\(x=>\{x\.status="PASSED"/);
 assert.match(demo,/showBoard\?box\("叫號看板示意"/);
 assert.match(demo,/function validPickupPhone\(\)/);
 assert.match(demo,/landlineRules=/);
 assert.doesNotMatch(demo,/取餐姓名/);
 assert.match(demo,/createdAt\+15000/);
 assert.match(demo,/Date\.now\(\)-o\.createdAt>=15000/);
 assert.match(demo,/records\.filter\(x=>owned\.has\(x\.id\)\)/);
 assert.match(demo,/function customerDetail\(\)/);
 assert.match(demo,/data-act="demo-open-detail"/);
 assert.match(demo,/const remaining=s=>/);
 assert.match(demo,/其他操作（誤操作更正）/);
 assert.match(demo,/if\(a==="clear-filter"\)/);
});
