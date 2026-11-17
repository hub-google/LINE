import {serviceUnitsState} from "./state/serviceUnitsState.js";
import {routeState} from "./state/routeState.js";
import {act,rpc,val} from "./data-loading.js";
import {render} from "./staff-layout.js";
import {box,btn,esc,field,taipei,showActionFeedback} from "./shared-ui.js";

const weekdays=["一","二","三","四","五","六","日"];
const clone=x=>JSON.parse(JSON.stringify(x));
const initialTemplates={default:[{title:"基本場次",name:"第 1 場",start:"09:00",end:"12:00",capacity:10}]};
const MAX_SESSIONS=50;
const weekdayKey=day=>"week_day_"+day;
const planKey=key=>/^plan_[a-z0-9_]+$/.test(key);
const closedPlan=windows=>windows?.[0]?.plan_closed===true;
const planCount=windows=>closedPlan(windows)?0:(windows?.length||0);
const PLAN_LIMIT=100;
function planSignature(windows){
 return JSON.stringify((windows||[]).map(({title,plan_closed,...window})=>window));
}
function batchApplyPlan(config,source,days){
 if(source!=="off"&&(!planKey(source)||!Array.isArray(config.templates[source])))
  throw Error("請選擇有效的營業方案");
 const targets=[...new Set(days.map(String))];
 if(!targets.length||targets.some(day=>!/^[1-7]$/.test(day)))throw Error("請勾選至少一個有效星期");
 const windows=source==="off"?null:config.templates[source];
 if(windows&&!closedPlan(windows)&&(!windows.length||windows.length>MAX_SESSIONS))
  throw Error("來源方案的場次設定無效");
 for(const day of targets){
  const key=weekdayKey(day);
  if(!windows||closedPlan(windows)){
   config.weekdays[day]="off";
   continue;
  }
  config.templates[key]=clone(windows).map(({title,plan_closed,...window},i)=>
   i===0?{...window,title:"星期"+weekdays[Number(day)-1]}:window);
  config.weekdays[day]=key;
 }
 return targets.length;
}
const validCount=n=>Number.isInteger(n)&&n>=0&&n<=MAX_SESSIONS;
function copyWeekdaySettings(config,sourceDay,targetDay){
 const from=String(sourceDay),to=String(targetDay);
 if(!/^[1-7]$/.test(from)||!/^[1-7]$/.test(to)||from===to)
  throw Error("請選擇不同的來源星期");
 const sourceKey=config.weekdays[from];
 if(sourceKey==="off"){
  config.weekdays[to]="off";
  return 0;
 }
 const sourceWindows=config.templates[sourceKey];
 if(!Array.isArray(sourceWindows)||!sourceWindows.length||sourceWindows.length>MAX_SESSIONS)
  throw Error("來源星期的場次設定不存在");
 const targetKey=weekdayKey(to),windows=clone(sourceWindows);
 windows[0].title="星期"+weekdays[Number(to)-1];
 config.templates[targetKey]=windows;
 config.weekdays[to]=targetKey;
 return windows.length;
}
const clock=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
function resizeWindows(windows,count){
 const list=clone(windows||[]).slice(0,count);
 if(!validCount(count))throw Error("場次數必須是 0～50 的整數");
 const firstTitle=windows?.[0]?.title;
 if(!list.length&&count>0)list.push({...emptyWindow(),name:"第 1 場"});
 const current=list.length;
 if(current<count){
  const previousEnd=list.length?Number(list[list.length-1].end.slice(0,2))*60+Number(list[list.length-1].end.slice(3)):540;
  const free=Math.max(0,1439-previousEnd);
  for(let i=current;i<count;i++){
   const remaining=count-current;
   const offset=i-current;
   const step=Math.max(1,Math.min(120,Math.floor(free/remaining)));
   let start=free>=remaining?previousEnd+offset*step:Math.floor(i*1440/count);
   let end=free>=remaining?start+step:Math.floor((i+1)*1440/count);
   start=Math.min(1438,start);end=Math.min(1439,Math.max(start+1,end));
   list.push({name:"第 "+(i+1)+" 場",start:clock(start),end:clock(end),capacity:10});
  }
 }
 if(list.length&&firstTitle)list[0].title=firstTitle;
 return list;
}
const emptyWindow=()=>({name:"新增場次",start:"09:00",end:"12:00",capacity:10});

function persistedPlanPayload(config,d,key,remove=false){
 const templates=config.templates&&Object.keys(config.templates).length?clone(config.templates):clone(initialTemplates);
 const baseline=serviceUnitsState.schedulePlanBaseline||{};
 if(!Object.keys(templates).some(planKey))
  for(const [k,windows] of Object.entries(baseline))if(planKey(k))templates[k]=clone(windows);
 const weekdaysRule={};
 for(let i=1;i<=7;i++){
  const day=String(i),existing=config.weekdays?.[day]||"off";
  weekdaysRule[day]=existing;
  if(existing!=="off"&&!templates[existing]&&baseline[existing])templates[existing]=clone(baseline[existing]);
 }
 if(remove)delete templates[key];else templates[key]=clone(d.templates[key]);
 return {enabled:config.enabled===true,weekdays:weekdaysRule,templates};
}
function revertPlanChanges(d,key){
 const original=serviceUnitsState.schedulePlanBaseline?.[key];
 if(original)d.templates[key]=clone(original);
 else{delete d.templates[key];if(serviceUnitsState.scheduleSelectedPlan===key)serviceUnitsState.scheduleSelectedPlan="off";}
}
function clearPlanDraft(){
 serviceUnitsState.scheduleDraft=null;
 serviceUnitsState.schedulePlanBaseline=null;
 serviceUnitsState.scheduleEditingPlan="";
}
function draft(){
 if(!serviceUnitsState.scheduleDraft){
  const c=serviceUnitsState.scheduleConfig||{};
  const templates=c.templates&&Object.keys(c.templates).length?clone(c.templates):clone(initialTemplates);
  const weekdaysRule={};
  for(let i=1;i<=7;i++)weekdaysRule[String(i)]=c.weekdays?.[String(i)]||"off";
  // Each weekday has its own settings; old shared templates stay intact for special dates.
  for(let i=1;i<=7;i++){
   const oldKey=weekdaysRule[String(i)];
   if(oldKey!=="off"&&Array.isArray(templates[oldKey])){
    const key=weekdayKey(i);
    if(key!==oldKey)templates[key]=clone(templates[oldKey]);
    weekdaysRule[String(i)]=key;
    if(templates[key].length)templates[key][0].title="星期"+weekdays[i-1];
   }
  }
  // Existing shops start with named plans inferred from their current distinct weekday patterns.
  // Plans are saved as ordinary non-active templates; individual weekdays stay independent copies.
  if(!Object.keys(templates).some(planKey)){
   const seen=new Set();
   const samples=[];
   for(let i=1;i<=7;i++){
    const key=weekdaysRule[String(i)];
    if(key==="off"||!Array.isArray(templates[key])||!templates[key].length)continue;
    const signature=planSignature(templates[key]);
    if(!seen.has(signature)){seen.add(signature);samples.push(templates[key]);}
   }
   if(!samples.length)samples.push(templates.default||Object.values(templates)[0]||[emptyWindow()]);
   for(const sample of samples){
    if(Object.keys(templates).length>=PLAN_LIMIT)break;
    const n=Object.keys(templates).filter(planKey).length+1;
    const key="plan_"+n;
    const windows=clone(sample);
    windows[0].title="方案 "+n;
    templates[key]=windows;
   }
  }
  serviceUnitsState.schedulePlanBaseline=clone(templates);
  serviceUnitsState.scheduleDraft={enabled:c.enabled===true,weekdays:weekdaysRule,templates};
  const plans=Object.keys(templates).filter(planKey);
  serviceUnitsState.scheduleEditWeekday=serviceUnitsState.scheduleEditWeekday||"";
  serviceUnitsState.scheduleEditTemplate=plans.includes(serviceUnitsState.scheduleEditTemplate)?
   serviceUnitsState.scheduleEditTemplate:(plans[0]||"");
  serviceUnitsState.scheduleSelectedPlan=plans.includes(serviceUnitsState.scheduleSelectedPlan)?
   serviceUnitsState.scheduleSelectedPlan:(plans[0]||"off");
  serviceUnitsState.scheduleBatchDays=[];
 }
 return serviceUnitsState.scheduleDraft;
}
function exceptionDraft(){
 if(!serviceUnitsState.scheduleExceptionDraft){
  serviceUnitsState.scheduleExceptionDraft={
   start:taipei(),end:taipei(),mode:"CLOSED",
   note:"",windows:[{name:"第 1 場",start:"10:00",end:"15:00",capacity:10}]
  };
 }
 return serviceUnitsState.scheduleExceptionDraft;
}
function templateTitle(key,windows){
 return String(windows?.[0]?.title||key);
}
function capture(){
 const d=draft(),e=exceptionDraft();
 const enabled=document.getElementById("schedule-enabled");
 if(enabled)d.enabled=enabled.checked;
 const batchPlan=document.getElementById("schedule-batch-plan");
 if(batchPlan)serviceUnitsState.scheduleSelectedPlan=batchPlan.value;
 const days=document.querySelectorAll("[data-schedule-batch-day]");
 if(days.length)serviceUnitsState.scheduleBatchDays=[...days].filter(el=>el.checked).map(el=>el.value);
 for(const panel of document.querySelectorAll("[data-schedule-plan-panel]")){
  const key=panel.dataset.schedulePlanPanel;
  if(!planKey(key)||!Array.isArray(d.templates[key]))continue;
  const name=(panel.querySelector("[data-schedule-plan-name]")?.value||"").trim();
  const windows=[];
  for(const line of panel.querySelectorAll("[data-schedule-plan-window]")){
   const read=field=>line.querySelector('[data-schedule-field="'+field+'"]')?.value||"";
   const w={name:read("name").trim(),start:read("start"),end:read("end"),capacity:Number(read("capacity"))};
   if(read("unit_id"))w.unit_id=read("unit_id");
   windows.push(w);
  }
  if(windows.length){
   windows[0].title=name;
   d.templates[key]=windows;
  }else if(d.templates[key].length){
   d.templates[key][0].title=name;
  }
 }
 for(const el of document.querySelectorAll("[data-schedule-weekday]"))
  d.weekdays[el.dataset.scheduleWeekday]=el.value;
 for(const panel of document.querySelectorAll("[data-schedule-weekday-panel]")){
  const day=panel.dataset.scheduleWeekdayPanel;
  const key=weekdayKey(day),count=Number(panel.querySelector("[data-schedule-weekday-count]")?.value);
  const windows=[];
  for(const line of panel.querySelectorAll("[data-schedule-weekday-window]")){
   const read=name=>line.querySelector('[data-schedule-field="'+name+'"]')?.value||"";
   const entry={name:read("name").trim(),start:read("start"),end:read("end"),capacity:Number(read("capacity"))};
   if(read("unit_id"))entry.unit_id=read("unit_id");
   windows.push(entry);
  }
  if(!validCount(count)){panel.querySelector("[data-schedule-weekday-count]")?.setCustomValidity("請輸入 0～50 的整數");continue;}
  if(windows.length){
   windows[0].title="星期"+weekdays[Number(day)-1];
   d.templates[key]=windows;
  }
  d.weekdays[day]=count===0?"off":key;
 }
 const input=(id,key)=>{const el=document.getElementById(id);if(el)e[key]=el.value;};
 input("schedule-special-start","start");input("schedule-special-end","end");
 input("schedule-special-note","note");
 const specialWindows=[];
 for(const line of document.querySelectorAll("[data-schedule-special-window]")){
  const read=name=>line.querySelector('[data-schedule-field="'+name+'"]')?.value||"";
  const row={name:read("name").trim(),start:read("start"),end:read("end"),capacity:Number(read("capacity"))};
  if(read("unit_id"))row.unit_id=read("unit_id");
  specialWindows.push(row);
 }
 if(specialWindows.length)e.windows=specialWindows;
 return d;
}
function adjacent(a,b){
 const before=Date.parse(a+"T12:00:00Z"),after=Date.parse(b+"T12:00:00Z");
 return Number.isFinite(before)&&after-before===86400000;
}
function groupedExceptions(exceptions){
 const result=[];
 for(const x of (exceptions||[]).slice().sort((a,b)=>a.date.localeCompare(b.date))){
  const signature=JSON.stringify([x.mode,x.template_key,x.windows,x.note]);
  const prev=result[result.length-1];
  if(prev&&prev.signature===signature&&adjacent(prev.end,x.date)){prev.end=x.date;continue;}
  result.push({...x,start:x.date,end:x.date,signature});
 }
 return result;
}
function validate(d){
 if(!Object.keys(d.templates).length||Object.keys(d.templates).length>PLAN_LIMIT)
  throw Error("場次模板總數必須為 1～100 組");
 for(const [key,windows] of Object.entries(d.templates).filter(([key])=>planKey(key))){
  const title=String(windows?.[0]?.title||"").trim();
  if(!title||title.length>40)throw Error("營業方案名稱需為 1～40 字");
 }
 for(let i=1;i<=7;i++)if(!["off",...Object.keys(d.templates)].includes(d.weekdays[String(i)]))
  throw Error("星期"+weekdays[i-1]+"的模板不存在");
 for(const [key,windows] of Object.entries(d.templates)){
  if(windows.length<1||windows.length>MAX_SESSIONS)throw Error("「"+templateTitle(key,windows)+"」必須有 1～50 場");
  for(const w of windows)if(!w.name||!/^\d{2}:\d{2}$/.test(w.start)||!/^\d{2}:\d{2}$/.test(w.end)||w.end<=w.start||
   !Number.isInteger(w.capacity)||w.capacity<1||w.capacity>300)
    throw Error("模板「"+templateTitle(key,windows)+"」的場次時間或名額無效");
 }
}
function windowEditor(w,i,marker,unitOptions,locked=false){
 const disabled=locked?" disabled":"";
 return '<div class="inset schedule-session-editor" '+marker+'="'+i+'">'+
  '<strong>第 '+(i+1)+' 場</strong>'+
  '<div class="grid"><div><label>場次名稱</label><input class="field" data-schedule-field="name" maxlength="60" value="'+esc(w.name)+'"'+disabled+'></div>'+
  '<div><label>名額（人）</label><input class="field" data-schedule-field="capacity" type="number" min="1" max="300" value="'+esc(w.capacity)+'"'+disabled+'></div></div>'+
  '<div class="grid"><div><label>開始時間</label><input class="field" data-schedule-field="start" type="time" value="'+esc(w.start)+'"'+disabled+'></div>'+
  '<div><label>結束時間</label><input class="field" data-schedule-field="end" type="time" value="'+esc(w.end)+'"'+disabled+'></div></div>'+
  '<label>服務窗口（選填）</label><select class="field" data-schedule-field="unit_id"'+disabled+'><option value="">一般場次</option>'+
  unitOptions.map(u=>'<option value="'+esc(u.id)+'"'+(u.id===w.unit_id?' selected':'')+'>'+esc(u.name)+'</option>').join("")+'</select></div>';
}
export function applyScheduleSessionCount(el){
 const raw=String(el.value).trim(),count=Number(raw);
 if(!raw||!validCount(count)){
  window.alert("場次數請輸入 0～50 的整數");render();return;
 }
 const d=capture();
 if(el.dataset.schedulePlanCount){
  const key=String(el.dataset.schedulePlanCount);
  const windows=d.templates[key];
  if(!planKey(key)||!windows)return;
  const name=templateTitle(key,windows);
  if(count===0){
   d.templates[key]=[{...emptyWindow(),title:name,plan_closed:true}];
  }else{
   const base=closedPlan(windows)?[]:windows;
   d.templates[key]=resizeWindows(base,count);
   d.templates[key][0].title=name;
   for(const w of d.templates[key])delete w.plan_closed;
  }
  serviceUnitsState.scheduleEditTemplate=key;
 }else if(el.dataset.scheduleWeekdayCount){
  const day=String(el.dataset.scheduleWeekdayCount),key=weekdayKey(day);
  const current=d.templates[key]||[];
  d.weekdays[day]=count===0?"off":key;
  if(count>0){
   d.templates[key]=resizeWindows(current,count);
   d.templates[key][0].title="星期"+weekdays[Number(day)-1];
  }
  serviceUnitsState.scheduleEditWeekday=day;
 }else if(el.id==="schedule-special-count"){
  const e=exceptionDraft();
  e.mode=count===0?"CLOSED":"CUSTOM";
  if(count>0)e.windows=resizeWindows(e.windows||[],count).map(({title,...w})=>w);
 }
 render();
}
export function renderScheduleSettings(isManager){
 const c=serviceUnitsState.scheduleConfig||{};
 if(!isManager)return box("智慧營業排程",'<p class="small">僅店家管理者可以編輯每週場次及特殊營業日期。</p>');
 const d=draft(),e=exceptionDraft();
 const unitOptions=(serviceUnitsState.unitConfig?.units||[]).filter(u=>u.active&&!u.is_default);
 const plans=Object.entries(d.templates).filter(([key])=>planKey(key));
 const planCards=plans.map(([key,windows])=>{
  const count=planCount(windows),title=templateTitle(key,windows);
  const isEditing=serviceUnitsState.scheduleEditingPlan===key;
  const opened=isEditing||serviceUnitsState.scheduleEditTemplate===key;
  return '<section class="schedule-plan-panel'+(isEditing?' is-editing':'')+'" data-schedule-plan-panel="'+esc(key)+'">'+
   '<div class="schedule-plan-banner"><span class="schedule-plan-indicator"></span><strong>'+esc(title)+'</strong>'+
   '<span class="schedule-plan-status">'+(isEditing?'編輯中・尚未儲存':'營業方案')+'</span></div>'+
   '<div class="schedule-plan-inner"><div class="schedule-plan-head">'+
   '<div class="schedule-plan-title"><label for="schedule-plan-name-'+esc(key)+'">方案名稱</label>'+
   '<input id="schedule-plan-name-'+esc(key)+'" data-schedule-plan-name="'+esc(key)+'" class="field" maxlength="40" value="'+esc(title)+'"'+(isEditing?'':' disabled')+'></div>'+
   '<div class="schedule-plan-size"><label for="schedule-plan-count-'+esc(key)+'">場次數</label>'+
   '<input id="schedule-plan-count-'+esc(key)+'" class="field" type="number" min="0" max="50" step="1" data-schedule-plan-count="'+esc(key)+'" value="'+count+'"'+(isEditing?'':' disabled')+'></div>'+
   '<div class="schedule-plan-actions">'+
   btn("儲存方案","schedule-plan-save","primary schedule-plan-save-btn",'data-key="'+esc(key)+'"'+(isEditing?'':' disabled'))+
   btn(isEditing?"取消編輯":"編輯方案","schedule-plan-edit","outline schedule-plan-edit-btn",'data-key="'+esc(key)+'"')+
   btn("刪除方案","schedule-plan-remove","outline schedule-plan-delete-btn",'data-key="'+esc(key)+'"')+'</div></div>'+
   '<details class="schedule-plan-details"'+(opened?' open':'')+'><summary>編輯場次內容（'+(count?count+" 場":"公休")+"）</summary>"+
   '<div class="schedule-plan-detail-body">'+
   (count?'<div class="schedule-session-list">'+windows.map((w,i)=>windowEditor(w,i,'data-schedule-plan-window',unitOptions,!isEditing)).join("")+'</div>':
    '<p class="small">此方案為公休，套用到的星期將不開放場次。</p>')+'</div></details></div></section>';
 }).join("");
 const selectedPlan=serviceUnitsState.scheduleSelectedPlan;
 const batchOptions='<option value="off"'+(selectedPlan==="off"?" selected":"")+'>公休（0 場）</option>'+
  plans.map(([key,windows])=>'<option value="'+esc(key)+'"'+(selectedPlan===key?' selected':'')+'>'+
    esc(templateTitle(key,windows))+'（'+(planCount(windows)||"公休")+(planCount(windows)?" 場":"")+'）</option>').join("");
 const selectedDays=serviceUnitsState.scheduleBatchDays||[];
 const batchDays=weekdays.map((name,i)=>'<label class="schedule-day-check"><input type="checkbox" data-schedule-batch-day value="'+(i+1)+'"'+
   (selectedDays.includes(String(i+1))?' checked':'')+'> 週'+name+'</label>').join("");
 const week=weekdays.map((day,i)=>{
  const key=String(i+1),templateKey=d.weekdays[key];
  const windows=templateKey==="off"?[]:(d.templates[templateKey]||[]);
  const preview=windows.length?windows.slice(0,2).map(w=>esc(w.start)+'–'+esc(w.end)).join('、')+
   (windows.length>2?' 等':''):'當天不營業';
  return '<section class="schedule-weekday-panel" data-schedule-weekday-panel="'+key+'">'+
   '<div class="schedule-weekday-head"><strong>星期'+day+'</strong><div class="schedule-weekday-overview"><span>'+
   (windows.length?windows.length+' 場':'公休')+'</span><small>'+preview+'</small></div></div>'+
   '<details class="schedule-weekday-details"'+(serviceUnitsState.scheduleEditWeekday===key?' open':'')+'>'+
   '<summary>個別調整星期'+day+'</summary>'+
   '<div class="schedule-weekday-count"><label for="schedule-weekday-count-'+key+'">場次數（0 為公休）</label>'+
   '<input class="field" id="schedule-weekday-count-'+key+'" data-schedule-weekday-count="'+key+'" type="number" min="0" max="50" step="1" value="'+windows.length+'"></div>'+
   (windows.length?'<div class="schedule-session-list">'+windows.map((w,j)=>windowEditor(w,j,'data-schedule-weekday-window',unitOptions)).join("")+'</div>':
    '<p class="small schedule-closed-hint">目前公休；將場次數改為 1～50，即可自行新增當日場次。</p>')+
   '</details></section>';
 }).join("");
 const planSection='<section class="schedule-module schedule-module-plans"><div class="schedule-module-heading"><h3>營業方案</h3></div>'+
  '<div class="schedule-module-body"><p class="small">每個方案可自訂名稱及 0～50 場；先按「編輯方案」修改，再按「儲存方案」。已套用的星期不會自動改變。</p>'+
  '<div class="schedule-plan-list">'+planCards+'</div>'+
  '<div class="staff-actionbar schedule-plan-add-bar">'+btn("＋ 新增營業方案","schedule-plan-add","primary")+'</div></div></section>';
 const batchSection='<section class="schedule-module schedule-batch-box"><div class="schedule-module-heading"><h3>批次套用營業方案</h3></div>'+
  '<div class="schedule-module-body"><label for="schedule-batch-plan">選擇營業方案</label>'+
  '<select id="schedule-batch-plan" class="field">'+batchOptions+'</select>'+
  '<p class="schedule-batch-label">套用到哪些星期？</p>'+
  '<div class="schedule-day-checks">'+batchDays+'</div>'+
  '<div class="schedule-batch-actions">'+btn("套用到勾選的星期","schedule-batch-apply","primary")+'</div>'+
  '<p class="small">套用會取代所選星期目前的場次，不影響其他星期；完成後請按「儲存每週營業排程」。</p></div></section>';
 const specialWindows=e.windows||[emptyWindow()];
 const specialWindowEditor=specialWindows.map((w,i)=>windowEditor(w,i,'data-schedule-special-window',unitOptions)).join("");
 const specialCount=e.mode==="CLOSED"?0:specialWindows.length;
 const exceptions=groupedExceptions(c.exceptions||[]).slice(0,40);
 const list=exceptions.length?
   exceptions.map(x=>'<div class="listline"><span><strong>'+esc(x.start)+(x.end!==x.start?'～'+esc(x.end):"")+'</strong><div class="small">'+
     esc(x.mode==="CLOSED"?"公休（0 場）":"臨時營業（"+(x.windows?.length||c.templates?.[x.template_key]?.length||0)+" 場）")+
     (x.note?' · '+esc(x.note):"")+'</div></span>'+
     btn("編輯","schedule-special-edit","outline",'data-start="'+esc(x.start)+'" data-end="'+esc(x.end)+'"')+
     btn("移除此設定","schedule-special-remove","outline",'data-start="'+esc(x.start)+'" data-end="'+esc(x.end)+'"')+'</div>').join(""):
     '<p class="muted">目前沒有設定特殊日期。</p>';
 return box("智慧營業排程",
  '<p class="small">只需設定一次，往後每週自動套用；特殊日期優先於每週規則。適用預約、取號與線上點餐，並保留既有預約和訂單。</p>'+
  '<label class="checklist"><input type="checkbox" id="schedule-enabled"'+(d.enabled?" checked":"")+'> 啟用每週自動排程</label>'+
  (!d.enabled?'<p class="small">尚未啟用時仍保留原有指定日期場次；完成下面的設定並儲存後才會自動套用。</p>':"")+
  planSection+batchSection+
  '<section class="schedule-module schedule-module-weekly"><div class="schedule-module-heading"><h3>每週細部調整</h3></div><div class="schedule-module-body">'+
  '<p class="small">以下是套用後的七天排程摘要。若某一天需要不同內容，可展開「個別調整」修改，其他星期不受影響。</p>'+week+
  '<div class="staff-actionbar" style="margin:16px 0">'+btn("儲存每週營業排程","schedule-weekly-save","primary")+
  btn("放棄尚未儲存的修改","schedule-weekly-reset","outline")+'</div></div></section>'+
  '<section class="schedule-module schedule-module-special"><div class="schedule-module-heading"><h3>特殊日期（節假日、裝修、臨時調整）</h3></div><div class="schedule-module-body">'+
  '<p class="small">直接填寫這段期間每天的場次數：0 場為公休，1～50 場可逐場設定時間、名額與服務窗口。特殊日期會優先於每週排程。</p>'+
  '<div class="grid"><div>'+field("開始日期","schedule-special-start",e.start,"date")+'</div><div>'+field("結束日期","schedule-special-end",e.end,"date")+'</div></div>'+
  '<div class="schedule-special-count"><label for="schedule-special-count">每天場次數（0 為公休）</label>'+
   '<input class="field" type="number" id="schedule-special-count" min="0" max="50" step="1" value="'+specialCount+'"></div>'+
  (specialCount?
   '<div class="schedule-session-list" aria-label="特殊日期場次設定">'+specialWindowEditor+'</div>':
   '<p class="small schedule-closed-hint">這段日期不營業，不開放預約、取號與訂餐。</p>')+
   field("備註（選填）","schedule-special-note",e.note,"text",'maxlength="120" placeholder="例如：店內裝修、國定假日"')+
  '<div class="staff-actionbar" style="margin:16px 0">'+btn("套用特殊日期","schedule-special-save","primary")+'</div>'+
  '<h3 style="margin:20px 0 12px">已設定的特殊日期</h3>'+list+
  '<p class="small">臨時公休與裝修：套用前會先檢查受影響的有效預約、候位與訂餐數量，必須確認後才能儲存。已成立的紀錄不會被自動取消；請至預約管理、叫號與訂餐紀錄逐筆聯繫／安排顧客。</p></div></section>');
}
export async function handleScheduleAction(ev,b,a,id){
 if(!a.startsWith("schedule-"))return false;
 if(a==="schedule-batch-apply"){
  const source=document.getElementById("schedule-batch-plan")?.value||"";
  const days=[...document.querySelectorAll("[data-schedule-batch-day]:checked")].map(el=>el.value);
  const d=capture();
  try{
   validate(d);
   const count=batchApplyPlan(d,source,days);
   serviceUnitsState.scheduleEditWeekday="";
   // Keep the selected weekdays checked after applying, so users can review the selection.
   serviceUnitsState.scheduleBatchDays=days;
   render();
   showActionFeedback("已將「"+(source==="off"?"公休":templateTitle(source,d.templates[source]))+
     "」套用到 "+count+" 天；尚未儲存，請按「儲存每週營業排程」。","success");
  }catch(error){window.alert(error.message);}
  return true;
 }

 if(a==="schedule-plan-add"){
  const d=capture();
  if(Object.keys(d.templates).length>=PLAN_LIMIT){window.alert("營業方案已達上限，請先刪除舊方案");return true;}
  if(serviceUnitsState.scheduleEditingPlan){window.alert("請先儲存或取消正在編輯的方案");return true;}
  const key="plan_"+Date.now().toString(36)+"_"+Object.keys(d.templates).length;
  d.templates[key]=[{...emptyWindow(),title:"新營業方案"}];
  serviceUnitsState.scheduleEditTemplate=key;serviceUnitsState.scheduleEditingPlan=key;
  serviceUnitsState.scheduleSelectedPlan=key;render();return true;
 }
 if(a==="schedule-plan-edit"){
  const d=capture(),key=b.dataset.key;
  if(!planKey(key)||!d.templates[key])return true;
  const previous=serviceUnitsState.scheduleEditingPlan;
  if(previous===key){
   revertPlanChanges(d,key);serviceUnitsState.scheduleEditingPlan="";
   if(!d.templates[key])serviceUnitsState.scheduleEditTemplate=Object.keys(d.templates).find(planKey)||"";
   render();return true;
  }
  if(previous){
   if(!window.confirm("目前的方案尚未儲存，切換編輯將放棄修改。確定繼續？"))return true;
   revertPlanChanges(d,previous);
  }
  serviceUnitsState.scheduleEditingPlan=key;serviceUnitsState.scheduleEditTemplate=key;render();return true;
 }
 if(a==="schedule-plan-save"){
  const key=b.dataset.key;
  if(serviceUnitsState.scheduleEditingPlan!==key)return true;
  const d=capture();
  if(!planKey(key)||!d.templates[key])return true;
  if(!serviceUnitsState.scheduleConfig){window.alert("無法取得最新營業排程，請重新整理後再儲存");return true;}
  const payload=persistedPlanPayload(serviceUnitsState.scheduleConfig,d,key);
  try{validate(payload);}catch(error){window.alert(error.message);return true;}
  const title=templateTitle(key,d.templates[key]);
  await act(async()=>{
   await rpc("so_schedule_manage",{p_slug:routeState.slug,p_action:"weekly",p_data:payload});
   clearPlanDraft();serviceUnitsState.scheduleEditTemplate=key;
   return "「"+title+"」已儲存；已套用的星期不受影響";
  });return true;
 }
 if(a==="schedule-plan-remove"){
  const d=capture(),key=b.dataset.key;
  if(!planKey(key)||!d.templates[key])return true;
  if(serviceUnitsState.scheduleEditingPlan&&serviceUnitsState.scheduleEditingPlan!==key){
   window.alert("請先儲存或取消正在編輯的方案");return true;
  }
  if(!serviceUnitsState.scheduleConfig){window.alert("無法取得最新營業排程，請重新整理後再刪除");return true;}
  const payload=persistedPlanPayload(serviceUnitsState.scheduleConfig,d,key,true);
  if(Object.keys(payload.templates).filter(planKey).length<1){window.alert("請至少保留一組營業方案");return true;}
  if((serviceUnitsState.scheduleConfig?.exceptions||[]).some(x=>x.template_key===key)){
   window.alert("特殊日期仍使用這個方案，請先修改特殊日期設定");return true;
  }
  const title=templateTitle(key,d.templates[key]);
  if(!window.confirm("確定刪除「"+title+"」？刪除會立即儲存，已套用的星期不受影響。"))return true;
  try{validate(payload);}catch(error){window.alert(error.message);return true;}
  if(!serviceUnitsState.schedulePlanBaseline?.[key]&&!serviceUnitsState.scheduleConfig?.templates?.[key]){
   delete d.templates[key];serviceUnitsState.scheduleEditingPlan="";
   if(serviceUnitsState.scheduleEditTemplate===key)serviceUnitsState.scheduleEditTemplate=Object.keys(d.templates).find(planKey)||"";
   if(serviceUnitsState.scheduleSelectedPlan===key)serviceUnitsState.scheduleSelectedPlan="off";
   render();return true;
  }
  await act(async()=>{
   await rpc("so_schedule_manage",{p_slug:routeState.slug,p_action:"weekly",p_data:payload});
   clearPlanDraft();serviceUnitsState.scheduleEditTemplate="";
   serviceUnitsState.scheduleSelectedPlan="off";
   return "「"+title+"」已刪除；已套用的星期不受影響";
  });return true;
 }
 if(a==="schedule-special-slot-add"){
  capture();const e=exceptionDraft();
  if(e.windows.length>=MAX_SESSIONS){window.alert("特殊日期最多可設定 50 場");return true;}
  const last=e.windows[e.windows.length-1];
  const start=last?.end||"09:00";
  const minutes=Number(start.slice(0,2))*60+Number(start.slice(3))+120;
  const end=minutes<1440?String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0"):"23:59";
  const resultStart=start<"23:59"?start:"20:00";
  e.windows.push({name:"加開場次",start:resultStart,end:end>resultStart?end:"23:59",capacity:last?.capacity||10});
  e.mode="CUSTOM";render();return true;
 }
 if(a==="schedule-special-slot-remove"){
  capture();const e=exceptionDraft(),index=Number(b.dataset.index);
  if(e.windows.length>1&&Number.isInteger(index)&&index>=0&&index<e.windows.length){
   e.windows.splice(index,1);e.mode="CUSTOM";render();
  }
  return true;
 }
 if(a==="schedule-special-edit"){
  capture();const cfg=serviceUnitsState.scheduleConfig||{};
  const x=(cfg.exceptions||[]).find(v=>v.date===b.dataset.start);
  if(!x)return true;
  const e=exceptionDraft();
  // Historical special dates may reference weekly templates: copy the saved windows
  // into the standalone editor so changing this date cannot alter the weekly plan.
  const savedWindows=x.windows?.length?x.windows:
   (x.template_key?cfg.templates?.[x.template_key]:null);
  Object.assign(e,{start:b.dataset.start,end:b.dataset.end,note:x.note||"",
    mode:x.mode==="CLOSED"?"CLOSED":"CUSTOM",
    windows:savedWindows?.length?clone(savedWindows).map(({title,...w})=>w):[emptyWindow()]});
  render();return true;
 }
 if(a==="schedule-weekly-reset"){
  clearPlanDraft();serviceUnitsState.scheduleExceptionDraft=null;render();return true;
 }
 if(a==="schedule-template-add"){
  const d=capture(),name=val("schedule-new-template-name").trim();
  if(!name||name.length>40){window.alert("請輸入 1～40 字的模板名稱");return true;}
  const key="template_"+Date.now().toString(36)+"_"+Object.keys(d.templates).length;
  d.templates[key]=[{...emptyWindow(),title:name}];
  serviceUnitsState.scheduleEditTemplate=key;render();return true;
 }
 if(a==="schedule-slot-add"){
  const d=capture(),key=b.dataset.key;
  if(!d.templates[key])return true;
  if(d.templates[key].length>=MAX_SESSIONS){window.alert("一個模板最多 50 場");return true;}
  d.templates[key].push(emptyWindow());serviceUnitsState.scheduleEditTemplate=key;render();return true;
 }
 if(a==="schedule-slot-remove"){
  const d=capture(),key=b.dataset.key,index=Number(b.dataset.index);
  if(!d.templates[key]||d.templates[key].length<=1||!Number.isInteger(index))return true;
  d.templates[key].splice(index,1);serviceUnitsState.scheduleEditTemplate=key;render();return true;
 }
 if(a==="schedule-template-remove"){
  const d=capture(),key=b.dataset.key;
  if(Object.keys(d.templates).length<=1)return true;
  if((serviceUnitsState.scheduleConfig?.exceptions||[]).some(x=>x.template_key===key)){
   window.alert("有特殊日期正在使用此模板，請先移除或改設該特殊日期");return true;
  }
  if(!confirm("刪除「"+templateTitle(key,d.templates[key])+"」？套用此模板的星期將改為公休。"))return true;
  delete d.templates[key];for(let i=1;i<=7;i++)if(d.weekdays[String(i)]===key)d.weekdays[String(i)]="off";
  serviceUnitsState.scheduleEditTemplate=Object.keys(d.templates)[0];render();return true;
 }
 if(a==="schedule-weekly-save"){
  const d=capture();
  try{validate(d);}catch(error){window.alert(error.message);return true;}
  await act(async()=>{
   await rpc("so_schedule_manage",{p_slug:routeState.slug,p_action:"weekly",
    p_data:{enabled:d.enabled,weekdays:d.weekdays,templates:d.templates}});
   clearPlanDraft();return d.enabled?"每週排程已啟用並儲存":"每週排程已儲存，目前未啟用";
  });return true;
 }
 if(a==="schedule-special-save"){
  capture();const e=exceptionDraft();
  if(!e.start||!e.end||e.end<e.start){window.alert("請確認特殊日期的開始與結束日");return true;}
  const countInput=document.getElementById("schedule-special-count");
  const countRaw=String(countInput?.value??"").trim();
  const count=Number(countRaw);
  if(!countRaw||!validCount(count)){window.alert("場次數請輸入 0～50 的整數");return true;}
  if(count>0&&e.windows.length!==count){
   applyScheduleSessionCount(countInput);
   window.alert("場次欄位已更新，請確認各場的時間與名額後再次套用");
   return true;
  }
  e.mode=count===0?"CLOSED":"CUSTOM";
  const data={start:e.start,end:e.end,note:e.note||"",mode:e.mode};
  if(e.mode==="CUSTOM"){
   if(!Array.isArray(e.windows)||e.windows.length<1||e.windows.length>MAX_SESSIONS){window.alert("請設定 1～50 個場次");return true;}
   for(const w of e.windows){
    if(!w.name||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.start)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.end)
      ||w.start>=w.end||!Number.isInteger(w.capacity)||w.capacity<1||w.capacity>300){
     window.alert("特殊日期的場次名稱、時間或名額無效，請逐場確認");return true;
    }
   }
   data.windows=e.windows;
  }
  if(data.mode==="CLOSED"){
   try{
    const impact=await rpc("so_schedule_closure_impact",{p_slug:routeState.slug,p_start:e.start,p_end:e.end});
    const bookings=Number(impact?.reservations||0),tickets=Number(impact?.tickets||0),orders=Number(impact?.orders||0);
    const total=bookings+tickets+orders;
    const message="確定將 "+e.start+" 至 "+e.end+" 設為不營業？\n"+
      (total?"目前有 "+bookings+" 筆有效預約、"+tickets+" 筆候位號碼、"+orders+" 筆未結案訂單會受影響。\n":"目前沒有查到受影響的有效預約、候位或未結案訂單。\n")+
      "已成立紀錄不會被自動刪除或取消。請在預約管理、叫號及訂餐紀錄逐筆聯繫顧客與處理。";
    if(!window.confirm(message))return true;
   }catch(error){
    showActionFeedback("無法確認既有顧客是否受影響，已停止儲存；請重新嘗試。"+(error?.message||""),"error");
    return true;
   }
  }
  await act(async()=>{
   await rpc("so_schedule_manage",{p_slug:routeState.slug,p_action:"exception_set",p_data:data});
   clearPlanDraft();serviceUnitsState.scheduleExceptionDraft=null;
   return data.mode==="CLOSED"
    ?"休業日期已儲存。請至預約管理、叫號與訂餐紀錄逐筆處理既有顧客。"
    :"特殊營業日期已套用，新預約／取號／訂餐將依此規則判斷";
  });return true;
 }
 if(a==="schedule-special-remove"){
  if(!confirm("確定移除 "+b.dataset.start+" ～ "+b.dataset.end+" 的特殊設定？將恢復每週固定排程。"))return true;
  await act(async()=>{
   await rpc("so_schedule_manage",{p_slug:routeState.slug,p_action:"exception_delete",
    p_data:{start:b.dataset.start,end:b.dataset.end}});
   clearPlanDraft();
   return "已移除特殊日期設定，恢復每週規則";
  });return true;
 }
 return false;
}
