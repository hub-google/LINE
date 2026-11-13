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
const validCount=n=>Number.isInteger(n)&&n>=0&&n<=MAX_SESSIONS;
const clock=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
function resizeWindows(windows,count){
 const list=clone(windows||[]).slice(0,count);
 if(!validCount(count))throw Error("場次數必須是 0～50 的整數");
 const firstTitle=windows?.[0]?.title;
 const current=list.length;
 if(current<count){
  const previousEnd=list.length?Number(list[list.length-1].end.slice(0,2))*60+Number(list[list.length-1].end.slice(3)):540;
  const free=Math.max(0,1439-previousEnd);
  for(let i=current;i<count;i++){
   const remaining=count-current;
   const offset=i-current;
   let start=free>=remaining?previousEnd+Math.floor(offset*free/remaining):Math.floor(i*1440/count);
   let end=free>=remaining?previousEnd+Math.floor((offset+1)*free/remaining):Math.floor((i+1)*1440/count);
   start=Math.min(1438,start);end=Math.min(1439,Math.max(start+1,end));
   list.push({name:"第 "+(i+1)+" 場",start:clock(start),end:clock(end),capacity:10});
  }
 }
 if(list.length&&firstTitle)list[0].title=firstTitle;
 return list;
}
const emptyWindow=()=>({name:"新增場次",start:"09:00",end:"12:00",capacity:10});
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
  serviceUnitsState.scheduleDraft={enabled:c.enabled===true,weekdays:weekdaysRule,templates};
  serviceUnitsState.scheduleEditWeekday=serviceUnitsState.scheduleEditWeekday||"1";
  serviceUnitsState.scheduleEditTemplate=Object.keys(templates)[0];
 }
 return serviceUnitsState.scheduleDraft;
}
function exceptionDraft(){
 if(!serviceUnitsState.scheduleExceptionDraft){
  const keys=Object.keys(draft().templates);
  serviceUnitsState.scheduleExceptionDraft={
   start:taipei(),end:taipei(),mode:"CLOSED",template_key:keys[0]||"",
   note:"",windows:[{name:"特殊營業場",start:"10:00",end:"15:00",capacity:10}]
  };
 }
 return serviceUnitsState.scheduleExceptionDraft;
}
function templateTitle(key,windows){
 return String(windows?.[0]?.title||key);
}
function templateOptions(templates,selected,off=false){
 return (off?'<option value="off"'+(selected==="off"?" selected":"")+'>公休（無場次）</option>':"")+
 Object.entries(templates).map(([key,windows])=>
  '<option value="'+esc(key)+'"'+(selected===key?" selected":"")+'>'+esc(templateTitle(key,windows))+'</option>').join("");
}
function capture(){
 const d=draft(),e=exceptionDraft();
 const enabled=document.getElementById("schedule-enabled");
 if(enabled)d.enabled=enabled.checked;
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
 input("schedule-special-mode","mode");input("schedule-special-template","template_key");
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
 if(!Object.keys(d.templates).length)throw Error("請先新增場次模板");
 for(let i=1;i<=7;i++)if(!["off",...Object.keys(d.templates)].includes(d.weekdays[String(i)]))
  throw Error("星期"+weekdays[i-1]+"的模板不存在");
 for(const [key,windows] of Object.entries(d.templates)){
  if(windows.length<1||windows.length>MAX_SESSIONS)throw Error("「"+templateTitle(key,windows)+"」必須有 1～50 場");
  for(const w of windows)if(!w.name||!/^\d{2}:\d{2}$/.test(w.start)||!/^\d{2}:\d{2}$/.test(w.end)||w.end<=w.start||
   !Number.isInteger(w.capacity)||w.capacity<1||w.capacity>300)
    throw Error("模板「"+templateTitle(key,windows)+"」的場次時間或名額無效");
 }
}
function windowEditor(w,i,marker,unitOptions){
 return '<div class="inset schedule-session-editor" '+marker+'="'+i+'">'+
  '<strong>第 '+(i+1)+' 場</strong>'+
  '<div class="grid"><div><label>場次名稱</label><input class="field" data-schedule-field="name" maxlength="60" value="'+esc(w.name)+'"></div>'+
  '<div><label>名額（人）</label><input class="field" data-schedule-field="capacity" type="number" min="1" max="300" value="'+esc(w.capacity)+'"></div></div>'+
  '<div class="grid"><div><label>開始時間</label><input class="field" data-schedule-field="start" type="time" value="'+esc(w.start)+'"></div>'+
  '<div><label>結束時間</label><input class="field" data-schedule-field="end" type="time" value="'+esc(w.end)+'"></div></div>'+
  '<label>服務窗口（選填）</label><select class="field" data-schedule-field="unit_id"><option value="">一般場次</option>'+
  unitOptions.map(u=>'<option value="'+esc(u.id)+'"'+(u.id===w.unit_id?' selected':'')+'>'+esc(u.name)+'</option>').join("")+'</select></div>';
}
export function applyScheduleSessionCount(el){
 const raw=String(el.value).trim(),count=Number(raw);
 if(!raw||!validCount(count)){
  window.alert("場次數請輸入 0～50 的整數");render();return;
 }
 const d=capture();
 if(el.dataset.scheduleWeekdayCount){
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
  const windows=e.mode==="TEMPLATE" ? clone(d.templates[e.template_key]||[]) : (e.windows||[]);
  e.mode=count===0?"CLOSED":"CUSTOM";
  if(count>0)e.windows=resizeWindows(windows,count).map(({title,...w})=>w);
 }
 render();
}
export function applySpecialScheduleMode(el){
 capture();
 const e=exceptionDraft();
 if(el.id==="schedule-special-mode"){
  if(!["CLOSED","CUSTOM","TEMPLATE"].includes(el.value))return;
  e.mode=el.value;
 }else if(el.id==="schedule-special-template")e.template_key=el.value;
 render();
}

export function renderScheduleSettings(isManager){
 const c=serviceUnitsState.scheduleConfig||{};
 if(!isManager)return box("智慧營業排程",'<p class="small">僅店家管理者可以編輯每週場次及特殊營業日期。</p>');
 const d=draft(),e=exceptionDraft(),keys=Object.keys(d.templates);
 if(!keys.includes(e.template_key))e.template_key=keys[0]||"";
 const unitOptions=(serviceUnitsState.unitConfig?.units||[]).filter(u=>u.active&&!u.is_default);
 const week=weekdays.map((day,i)=>{
  const key=String(i+1),templateKey=d.weekdays[key];
  const windows=templateKey==="off"?[]:(d.templates[templateKey]||[]);
  return '<section class="schedule-weekday-panel" data-schedule-weekday-panel="'+key+'">'+
   '<div class="schedule-weekday-head"><label for="schedule-weekday-count-'+key+'">星期'+day+'</label>'+
   '<div class="schedule-weekday-count"><input class="field" id="schedule-weekday-count-'+key+'" data-schedule-weekday-count="'+key+'" type="number" min="0" max="50" step="1" value="'+windows.length+'"><span>場（0 為公休）</span></div></div>'+
   (windows.length?'<details class="schedule-weekday-details"'+(serviceUnitsState.scheduleEditWeekday===key?' open':'')+'><summary>設定星期'+day+'的 '+windows.length+' 場時間與名額</summary>'+
    '<div class="schedule-session-list">'+windows.map((w,j)=>windowEditor(w,j,'data-schedule-weekday-window',unitOptions)).join("")+'</div></details>':
    '<p class="small schedule-closed-hint">這一天公休，不開放場次。</p>')+'</section>';
 }).join("");
 const specialWindows=e.windows||[emptyWindow()];
 const specialWindowEditor=specialWindows.map((w,i)=>windowEditor(w,i,'data-schedule-special-window',unitOptions)).join("");
 const specialCount=e.mode==="CLOSED"?0:e.mode==="TEMPLATE"?(d.templates[e.template_key]?.length||0):specialWindows.length;
 const exceptions=groupedExceptions(c.exceptions||[]).slice(0,40);
 const list=exceptions.length?
   exceptions.map(x=>'<div class="listline"><span><strong>'+esc(x.start)+(x.end!==x.start?'～'+esc(x.end):"")+'</strong><div class="small">'+
     esc(x.mode==="CLOSED"?"不營業":x.template_key?"套用 "+templateTitle(x.template_key,d.templates[x.template_key]):"自訂營業時段")+
     (x.note?' · '+esc(x.note):"")+'</div></span>'+
     btn("編輯","schedule-special-edit","outline",'data-start="'+esc(x.start)+'" data-end="'+esc(x.end)+'"')+
     btn("移除此設定","schedule-special-remove","outline",'data-start="'+esc(x.start)+'" data-end="'+esc(x.end)+'"')+'</div>').join(""):
     '<p class="muted">目前沒有設定特殊日期。</p>';
 return box("智慧營業排程",
  '<p class="small">只需設定一次，往後每週自動套用；特殊日期優先於每週規則。適用預約、取號與線上點餐，並保留既有預約和訂單。</p>'+
  '<label class="checklist"><input type="checkbox" id="schedule-enabled"'+(d.enabled?" checked":"")+'> 啟用每週自動排程</label>'+
  (!d.enabled?'<p class="small">尚未啟用時仍保留原有指定日期場次；完成下面的設定並儲存後才會自動套用。</p>':"")+
  '<h3 style="margin:20px 0 12px">每週固定規則</h3>'+
  '<p class="small">每一天自行填入 0～50 場。輸入數字並離開欄位後，該星期下方會顯示對應數量的場次設定；0 場就是公休。</p>'+week+
  '<div class="staff-actionbar" style="margin:16px 0">'+btn("儲存每週營業排程","schedule-weekly-save","primary")+
  btn("放棄尚未儲存的修改","schedule-weekly-reset","outline")+'</div>'+
  '<hr style="margin:24px 0">'+
  '<h3 style="margin:0 0 8px">特殊日期（節假日、裝修、臨時調整）</h3>'+
  '<p class="small">同一處即可設定整日不營業，或臨時改用其他場次及營業時間。指定日期的設定會覆蓋每週規則。</p>'+
  '<div class="grid"><div>'+field("開始日期","schedule-special-start",e.start,"date")+'</div><div>'+field("結束日期","schedule-special-end",e.end,"date")+'</div></div>'+
  '<label for="schedule-special-mode">這段期間的營業安排</label>'+
  '<select id="schedule-special-mode" class="field">'+
   [["CLOSED","不營業（休假／裝修）"],["TEMPLATE","改套用其他場次模板"],["CUSTOM","臨時調整營業時間"]].map(([v,label])=>
    '<option value="'+v+'"'+(e.mode===v?" selected":"")+'>'+label+'</option>').join("")+'</select>'+
  '<div class="schedule-special-count"><label for="schedule-special-count">特殊日期場次數（0～50）</label>'+
   '<input class="field" type="number" id="schedule-special-count" min="0" max="50" step="1" value="'+specialCount+'"></div>'+
  '<div data-schedule-template-choice style="'+(e.mode==="CLOSED"?"display:none;":"")+'">'+
   '<label for="schedule-special-template">套用已有場次設定</label>'+
   '<select id="schedule-special-template" class="field">'+templateOptions(d.templates,e.template_key)+'</select></div>'+
   '<div data-schedule-custom style="'+(e.mode==="CUSTOM"?"":"display:none;")+'">'+
   '<p class="small">可自訂 0～50 場，各場均可調整時間、名額與服務窗口。</p>'+
   '<div class="staff-actionbar">'+btn("帶入所選模板的全部場次","schedule-special-copy-template","outline")+'</div'+'> '+
   specialWindowEditor+'</div>'+
   field("備註（選填）","schedule-special-note",e.note,"text",'maxlength="120" placeholder="例如：店內裝修、國定假日"')+
  '<div class="staff-actionbar" style="margin:16px 0">'+btn("套用特殊日期","schedule-special-save","primary")+'</div>'+
  '<h3 style="margin:20px 0 12px">已設定的特殊日期</h3>'+list+
  '<p class="small">臨時公休與裝修：套用前會先檢查受影響的有效預約、候位與訂餐數量，必須確認後才能儲存。已成立的紀錄不會被自動取消；請至預約管理、叫號與訂餐紀錄逐筆聯繫／安排顧客。</p>');
}
export async function handleScheduleAction(ev,b,a,id){
 if(!a.startsWith("schedule-"))return false;
 if(a==="schedule-special-copy-template"){
  const d=capture(),e=exceptionDraft(),windows=d.templates[e.template_key];
  if(!windows){window.alert("請先選擇要帶入的場次模板");return true;}
  e.mode="CUSTOM";e.windows=clone(windows).map(({title,...w})=>w);
  render();return true;
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
  Object.assign(e,{start:b.dataset.start,end:b.dataset.end,note:x.note||"",
    mode:x.mode==="CLOSED"?"CLOSED":x.template_key?"TEMPLATE":"CUSTOM",
    template_key:x.template_key||Object.keys(draft().templates)[0],
    windows:x.windows?.length?clone(x.windows):[emptyWindow()]});
  render();return true;
 }
 if(a==="schedule-weekly-reset"){
  serviceUnitsState.scheduleDraft=null;serviceUnitsState.scheduleExceptionDraft=null;render();return true;
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
   serviceUnitsState.scheduleDraft=null;return d.enabled?"每週排程已啟用並儲存":"每週排程已儲存，目前未啟用";
  });return true;
 }
 if(a==="schedule-special-save"){
  capture();const e=exceptionDraft();
  if(!e.start||!e.end||e.end<e.start){window.alert("請確認特殊日期的開始與結束日");return true;}
  if(!serviceUnitsState.scheduleConfig?.enabled){window.alert("請先啟用並儲存每週自動排程");return true;}
  const data={start:e.start,end:e.end,note:e.note||"",mode:e.mode==="CLOSED"?"CLOSED":"CUSTOM"};
  if(e.mode==="TEMPLATE")data.template_key=e.template_key;
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
   serviceUnitsState.scheduleDraft=null;serviceUnitsState.scheduleExceptionDraft=null;
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
   serviceUnitsState.scheduleDraft=null;
   return "已移除特殊日期設定，恢復每週規則";
  });return true;
 }
 return false;
}
