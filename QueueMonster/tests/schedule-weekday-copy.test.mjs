import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../saas/app/schedule-settings.js",import.meta.url),"utf8");
const first=source.indexOf("const weekdays=");
const end=source.indexOf("const clock=",first);
assert.ok(first>=0&&end>first,"找不到每週場次設定函式");
const {copyWeekdaySettings}=new Function(source.slice(first,end)+";return {copyWeekdaySettings};")();

function example(){
 return {
  enabled:true,
  weekdays:{"1":"week_day_1","2":"week_day_2","3":"off","4":"off","5":"off","6":"week_day_6","7":"off"},
  templates:{
   default:[{name:"基本場次",start:"09:00",end:"12:00",capacity:10}],
   week_day_1:[
    {title:"星期一",name:"早餐",start:"07:00",end:"11:00",capacity:25,unit_id:"window-a"},
    {name:"午餐",start:"11:30",end:"14:00",capacity:15,unit_id:"window-b"}
   ],
   week_day_2:[{title:"星期二",name:"原有設定",start:"08:00",end:"16:00",capacity:5}],
   week_day_6:[{title:"星期六",name:"假日班",start:"10:00",end:"16:00",capacity:12}]
  }
 };
}

test("星期一可以套用星期二、三，且複製所有場次欄位，不建立連動",()=>{
 const d=example();
 assert.equal(copyWeekdaySettings(d,1,2),2);
 assert.equal(copyWeekdaySettings(d,1,3),2);
 assert.equal(d.weekdays["2"],"week_day_2");
 assert.equal(d.weekdays["3"],"week_day_3");
 for(const day of ["2","3"]){
  const windows=d.templates["week_day_"+day];
  assert.deepEqual(windows.map(({title,...w})=>w),d.templates.week_day_1.map(({title,...w})=>w));
  assert.equal(windows[0].title,day==="2"?"星期二":"星期三");
 }
 d.templates.week_day_2[0].name="星期二自行修改";
 assert.equal(d.templates.week_day_1[0].name,"早餐");
 assert.equal(d.templates.week_day_3[0].name,"早餐");
});

test("星期六可以套用星期日，不會改動星期六",()=>{
 const d=example();
 assert.equal(copyWeekdaySettings(d,"6","7"),1);
 assert.equal(d.weekdays["7"],"week_day_7");
 assert.equal(d.templates.week_day_7[0].name,"假日班");
 assert.equal(d.templates.week_day_7[0].title,"星期日");
 d.templates.week_day_7[0].capacity=30;
 assert.equal(d.templates.week_day_6[0].capacity,12);
});

test("公休也可以複製，其他既有模板資料不被刪除",()=>{
 const d=example();
 const old=structuredClone(d.templates.week_day_2);
 assert.equal(copyWeekdaySettings(d,4,2),0);
 assert.equal(d.weekdays["2"],"off");
 assert.deepEqual(d.templates.week_day_2,old);
 assert.deepEqual(d.templates.default,example().templates.default);
});

test("拒絕自己複製自己、無效星期或不存在的來源場次",()=>{
 const d=example();
 for(const [from,to] of [[1,1],[0,2],[8,2],[1,9]])
  assert.throws(()=>copyWeekdaySettings(d,from,to),/來源星期/);
 d.weekdays["5"]="missing";
 assert.throws(()=>copyWeekdaySettings(d,5,2),/不存在/);
});

test("畫面提供每一天的套用操作，先收集未儲存編輯再複製",()=>{
 assert.match(source,/data-schedule-copy-source/);
 assert.match(source,/schedule-weekday-copy/);
 assert.match(source,/const d=capture\(\);\s*try\{\s*const count=copyWeekdaySettings/);
 assert.match(source,/serviceUnitsState\.scheduleEditWeekday=String\(target\)/);
 assert.match(source,/請按「儲存每週營業排程」才會正式生效/);
 assert.match(source,/p_action:"weekly"/);
});
