import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../saas/app/schedule-settings.js",import.meta.url),"utf8");
const events=readFileSync(new URL("../saas/app/form-events.js",import.meta.url),"utf8");
const first=source.indexOf("const weekdays=");
const end=source.indexOf("const clock=",first);
assert.ok(first>=0&&end>first,"找不到批次套用函式");
const {batchApplyPlan,closedPlan,planCount}=new Function(source.slice(first,end)+";return {batchApplyPlan,closedPlan,planCount};")();
const fixture=()=>({
 weekdays:{"1":"week_day_1","2":"off","3":"off","4":"off","5":"off","6":"week_day_6","7":"off"},
 templates:{
  plan_a:[{title:"平日",name:"早餐",start:"07:00",end:"11:00",capacity:20,unit_id:"unit-a"},{name:"下午",start:"13:00",end:"18:00",capacity:12}],
  plan_b:[{title:"假日",name:"全日班",start:"10:00",end:"18:00",capacity:30}],
  plan_off:[{title:"休假",name:"預留場次",start:"09:00",end:"12:00",capacity:10,plan_closed:true}],
  week_day_1:[{title:"星期一",name:"舊場",start:"09:00",end:"10:00",capacity:5}],
  week_day_6:[{title:"星期六",name:"原假日",start:"09:00",end:"12:00",capacity:20}]
 }
});
test("同一方案可一次套用平日，週末可套用不同方案，互不連動",()=>{
 const d=fixture();
 assert.equal(batchApplyPlan(d,"plan_a",[1,2,3,4,5]),5);
 assert.equal(batchApplyPlan(d,"plan_b",[6,7]),2);
 for(let day=1;day<=5;day++){
  assert.equal(d.weekdays[String(day)],"week_day_"+day);
  assert.equal(d.templates["week_day_"+day].length,2);
  assert.equal(d.templates["week_day_"+day][0].title,"星期"+["一","二","三","四","五"][day-1]);
  assert.equal(d.templates["week_day_"+day][0].unit_id,"unit-a");
 }
 assert.equal(d.templates.week_day_6.length,1);
 assert.equal(d.templates.week_day_7[0].name,"全日班");
 d.templates.week_day_2[0].name="自訂星期二";
 assert.equal(d.templates.plan_a[0].name,"早餐");
 assert.equal(d.templates.week_day_1[0].name,"早餐");
 assert.equal(d.templates.week_day_3[0].name,"早餐");
});
test("零場命名方案和公休快捷選項只將指定星期設為休假",()=>{
 const d=fixture();
 assert.equal(planCount(d.templates.plan_off),0);
 assert.equal(closedPlan(d.templates.plan_off),true);
 assert.equal(batchApplyPlan(d,"plan_off",["3","4"]),2);
 assert.equal(d.weekdays["3"],"off");
 assert.equal(d.weekdays["4"],"off");
 assert.equal(batchApplyPlan(d,"off",["6"]),1);
 assert.equal(d.weekdays["6"],"off");
 assert.equal(d.weekdays["1"],"week_day_1");
 assert.ok(d.templates.week_day_6);
});
test("空白、無效星期及無效模板不得批次套用",()=>{
 const d=fixture();
 for(const days of [[],["0"],["8"],["一"]])assert.throws(()=>batchApplyPlan(d,"plan_a",days),/星期/);
 for(const source of ["", "missing","week_day_1"])assert.throws(()=>batchApplyPlan(d,source,[2]),/營業方案/);
});
test("方案 UI 有新增、刪除、名稱、場次、七日選擇、儲存，change 事件會調整場次",()=>{
 for(const token of ["schedule-plan-add","schedule-plan-remove","schedule-batch-plan","data-schedule-batch-day",
  "schedule-batch-apply","data-schedule-plan-name","data-schedule-plan-count","data-schedule-plan-window",
  "data-schedule-weekday-count","schedule-weekly-save","schedule-special-save"])
  assert.ok(source.includes(token),token);
 assert.match(events,/el\.dataset\.schedulePlanCount/);
 assert.match(source,/const d=capture\(\);\s*try\{\s*validate\(d\);\s*const count=batchApplyPlan/);
 assert.match(source,/p_data:\{enabled:d\.enabled,weekdays:d\.weekdays,templates:d\.templates\}/);
});

test("獨立儲存營業方案不會一起寫入尚未儲存的星期與其他方案",()=>{
 const first=source.indexOf("function persistedPlanPayload("),last=source.indexOf("function draft(){",first);
 assert.ok(first>=0&&last>first);
 const api=new Function(
  'const initialTemplates={default:[{name:"第 1 場",start:"09:00",end:"12:00",capacity:10}]};'+
  'const clone=x=>JSON.parse(JSON.stringify(x));const planKey=k=>/^plan_[a-z0-9_]+$/.test(k);'+
  'const serviceUnitsState={schedulePlanBaseline:{}};'+source.slice(first,last)+
  ';return {persistedPlanPayload,serviceUnitsState};')();
 const base=fixture();
 const saved={enabled:false,weekdays:structuredClone(base.weekdays),templates:structuredClone(base.templates)};
 api.serviceUnitsState.schedulePlanBaseline=structuredClone(base.templates);
 const draft=structuredClone(base);
 draft.enabled=true;
 draft.weekdays["2"]="week_day_1";
 draft.templates.plan_a[0].name="已改為晚班";
 draft.templates.plan_b[0].name="其他尚未儲存的修改";
 draft.templates.week_day_1[0].name="星期一尚未儲存";
 const payload=api.persistedPlanPayload(saved,draft,"plan_a");
 assert.equal(payload.enabled,false);
 assert.deepEqual(payload.weekdays,saved.weekdays);
 assert.equal(payload.templates.plan_a[0].name,"已改為晚班");
 assert.equal(payload.templates.plan_b[0].name,"全日班");
 assert.equal(payload.templates.week_day_1[0].name,"舊場");
 assert.equal(saved.templates.plan_a[0].name,"早餐");
 const removed=api.persistedPlanPayload(saved,draft,"plan_a",true);
 assert.equal(removed.templates.plan_a,undefined);
 assert.equal(removed.templates.week_day_1[0].name,"舊場");
 assert.equal(removed.templates.plan_b[0].name,"全日班");
});
test("方案具有真正的儲存、編輯、刪除操作與分區色塊",()=>{
 const css=readFileSync(new URL("../saas/booking-theme.css",import.meta.url),"utf8");
 for(const token of ["schedule-plan-save","schedule-plan-edit","schedule-plan-remove",
  "schedule-plan-actions","schedule-plan-save-btn","schedule-plan-edit-btn","schedule-plan-delete-btn",
  "schedule-module-plans","schedule-module-weekly","schedule-module-special","schedule-batch-box"])
  assert.ok(source.includes(token)||css.includes(token),token);
 assert.match(source,/if\(a==="schedule-plan-save"\)/);
 assert.match(source,/if\(a==="schedule-plan-edit"\)/);
 assert.match(source,/if\(a==="schedule-plan-remove"\)/);
 assert.match(source,/p_data:payload/);
 assert.match(source,/clearPlanDraft\(\)/);
 assert.match(css,/\.schedule-plan-details\{[^}]*background/);
 assert.match(css,/@media\(max-width:560px\)/);
});
