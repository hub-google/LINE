import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../saas/app/schedule-settings.js",import.meta.url),"utf8");
const events=readFileSync(new URL("../saas/app/form-events.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261113120000_qm_schedule_50_sessions.sql",import.meta.url),"utf8");

function sessionHelpers(){
 const first=source.indexOf("const weekdays=");
 const end=source.indexOf("function draft()",first);
 assert.ok(first>=0&&end>first,"Pure session-count helpers must exist");
 return new Function(source.slice(first,end)+";return {resizeWindows};")();
}

test("session count can be 0, 1, 20 or 50 but never 51",()=>{
 const {resizeWindows}=sessionHelpers();
 assert.equal(resizeWindows([],0).length,0);
 const one=resizeWindows([],1);
 assert.equal(one.length,1);
 assert.equal(one[0].start,"09:00");
 assert.equal(one[0].end,"12:00");
 assert.equal(resizeWindows([],20).length,20);
 const full=resizeWindows([],50);
 assert.equal(full.length,50);
 for(const w of full){
  assert.match(w.start,/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
  assert.match(w.end,/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
  assert.ok(w.start<w.end);
 }
 assert.throws(()=>resizeWindows([],51),/0～50/);
 assert.throws(()=>resizeWindows([],1.5),/0～50/);
});

test("resizing preserves existing user-entered sessions",()=>{
 const {resizeWindows}=sessionHelpers();
 const old=[{name:"小兒科 陳醫師",start:"08:00",end:"11:00",capacity:20,unit_id:"window-id"}];
 const expanded=resizeWindows(old,50);
 assert.equal(expanded.length,50);
 assert.deepEqual(expanded[0],old[0]);
 assert.equal(resizeWindows(expanded,1).length,1);
});

test("weekly and special dates share one count editor and persist into stored schedules",()=>{
 assert.match(source,/data-schedule-weekday-count/);
 assert.match(source,/data-schedule-weekday-window/);
 assert.match(source,/id="schedule-special-count"/);
 assert.match(source,/data-schedule-special-window/);
 assert.match(source,/d\.templates\[key\]=resizeWindows\(current,count\)/);
 assert.match(source,/e\.windows=resizeWindows\(windows,count\)/);
 assert.match(source,/e\.mode=count===0\?"CLOSED":"CUSTOM"/);
 assert.match(source,/d\.weekdays\[day\]=count===0\?"off":key/);
 assert.match(source,/rpc\("so_schedule_manage"/);
 assert.match(events,/applyScheduleSessionCount\(el\)/);
 assert.match(events,/applySpecialScheduleMode\(el\)/);
 assert.doesNotMatch(source,/平日兩場|假日三場|最多 20 場/);
});

test("database migration permits at most 50 windows and keeps authorization function",()=>{
 assert.match(migration,/jsonb_array_length\(p_windows\)>50/);
 assert.match(migration,/not between 1 and 100/);
 assert.match(migration,/pg_get_functiondef\('public\.so_schedule_manage/);
});
