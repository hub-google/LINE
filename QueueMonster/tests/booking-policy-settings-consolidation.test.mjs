import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const settings=read("../saas/app/staff/settings.js");
const schedule=read("../saas/app/schedule-settings.js");
const actions=read("../saas/app/actions/queue-settings.js");
test("remove obsolete daily break and booking notice panel",()=>{
 assert.doesNotMatch(settings,/預約提前限制與休息時間|policy-break-start|policy-break-end|policy-notice/);
 assert.match(settings,/預約送出前二次確認/);
});
test("move advance reservation limit into operating schedule",()=>{
 assert.match(schedule,/schedule-module-notice/);
 assert.match(schedule,/field\("最晚提前預約分鐘數","schedule-min-notice"/);
 assert.match(schedule,/bookingNoticeSection\+planSection/);
 assert.match(schedule,/save-booking-policy/);
});
test("preserve closed weekdays and dates, clear retired daily breaks on save",()=>{
 assert.match(actions,/Number\(val\("schedule-min-notice"\)\)/);
 assert.match(actions,/Number\.isInteger\(minutes\)\|\|minutes<0\|\|minutes>10080/);
 assert.match(actions,/p_closed_weekdays:policy\.closed_weekdays\|\|\[\]/);
 assert.match(actions,/p_closed_dates:policy\.closed_dates\|\|\[\]/);
 assert.match(actions,/p_break_start:"",p_break_end:""/);
 assert.match(actions,/p_min_notice_minutes:minutes/);
});
