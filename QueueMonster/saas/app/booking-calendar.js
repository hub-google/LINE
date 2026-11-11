import {calendarState} from "./state/calendarState.js";
import {routeState} from "./state/routeState.js";
import {staffState} from "./state/staffState.js";

import {authReady,box,btn,esc,field,selectedItemsHtml,stat,tag} from "./shared-ui.js";
import {render} from "./staff-layout.js";
import {rpc} from "./data-loading.js";

export function calendarPeriod(mode,anchor){
 const d=new Date(String(anchor)+"T12:00:00Z");
 if(!["day","week","month"].includes(mode)||!Number.isFinite(d.getTime())||
    d.toISOString().slice(0,10)!==anchor)throw Error("無效的日曆日期或檢視方式");
 const iso=x=>x.toISOString().slice(0,10);
 const copy=x=>new Date(x.getTime());
 const shift=(x,n)=>{const y=copy(x);y.setUTCDate(y.getUTCDate()+n);return y;};
 let first=copy(d),last=copy(d);
 if(mode==="week"){
  first=shift(d,-((d.getUTCDay()+6)%7));last=shift(first,6);
 }else if(mode==="month"){
  first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1,12));
  last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12));
  first=shift(first,-((first.getUTCDay()+6)%7));
  last=shift(last,(7-last.getUTCDay())%7);
 }
 const days=[];
 for(let current=copy(first);current<=last;current=shift(current,1)){
  days.push(iso(current));
  if(days.length>42)throw Error("日曆查詢不得超過 42 天");
 }
 const title=mode==="month"
  ?String(d.getUTCFullYear())+" 年 "+String(d.getUTCMonth()+1)+" 月"
  :mode==="week"?"本週 "+iso(first)+" ～ "+iso(last)
  :iso(d);
 return {start:iso(first),end:iso(last),days,title};
}

export function calendarShiftAnchor(mode,anchor,step){
 const d=new Date(anchor+"T12:00:00Z");
 if(mode==="month"){
  const target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+step,1,12));
  return target.toISOString().slice(0,10);
 }
 d.setUTCDate(d.getUTCDate()+step*(mode==="week"?7:1));
 return d.toISOString().slice(0,10);
}

export function bookingCalendarPanel(){
 const period=calendarPeriod(calendarState.calendarMode,calendarState.calendarAnchor);
 const sameData=calendarState.calendarDataKey===period.start+"/"+period.end+"/"+calendarState.calendarStatus&&calendarState.calendarTenant===routeState.slug;
 const data=sameData?calendarState.calendarResult:null;
 const summary=new Map((data?.daily||[]).map(x=>[String(x.day),x]));
 const control='<div class="booking-calendar-controls">'+
  '<div class="staff-actionbar">'+
   [["month","月曆"],["week","週曆"],["day","日曆"]].map(([m,label])=>
    btn(label,"calendar-mode",m===calendarState.calendarMode?"primary":"outline",'data-mode="'+m+'" aria-pressed="'+(m===calendarState.calendarMode)+'"')).join("")+
  '</div><div class="staff-actionbar">'+
   btn("上一個","calendar-prev","outline")+btn("今天","calendar-today","outline")+
   btn("下一個","calendar-next","outline")+
  '</div></div>'+
  '<div class="grid"><div>'+field("跳至日期","calendar-jump-date",calendarState.calendarAnchor,"date")+
    btn("前往日期","calendar-jump","outline")+'</div>'+
  '<div><label for="calendar-status">依預約狀態篩選</label><select id="calendar-status" class="field">'+
    [["ALL","全部狀態"],["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["CANCELLED","已取消"],["NO_SHOW","未到"]].map(([v,label])=>
      '<option value="'+v+'" '+(calendarState.calendarStatus===v?"selected":"")+'>'+label+'</option>').join("")+
  '</select></div></div>'+
  '<h3 class="booking-calendar-title">'+esc(period.title)+'</h3>';
 const totals=data?(data.daily||[]).reduce((a,x)=>({
   count:a.count+Number(x.total||0),people:a.people+Number(x.booked_people||0),
   confirmed:a.confirmed+Number(x.confirmed||0),checked:a.checked+Number(x.checked_in||0)
 }),{count:0,people:0,confirmed:0,checked:0}):null;
 const overview=totals?'<div class="grid3">'+stat("區間預約筆數",totals.count)+
  stat("已預約／報到人數",totals.people)+stat("已預約／報到筆數",totals.confirmed+totals.checked)+'</div>':"";
 let grid="";
 if(calendarState.calendarMode!=="day"){
  const weekNames=["一","二","三","四","五","六","日"];
  const activeMonth=calendarState.calendarAnchor.slice(0,7);
  grid='<div class="booking-calendar-scroll"><div class="booking-calendar-weekdays">'+
    weekNames.map(x=>'<span>週'+x+'</span>').join("")+'</div>'+
    '<div class="booking-calendar-grid" role="grid" aria-label="'+esc(period.title)+'">'+
    period.days.map(date=>{
     const sum=summary.get(date),n=Number(sum?.total||0);
     const outside=calendarState.calendarMode==="month"&&!date.startsWith(activeMonth);
     const selected=date===calendarState.calendarAnchor;
     const label=date+"，共 "+n+" 筆預約";
     return '<button type="button" class="booking-calendar-cell'+(outside?" other-month":"")+
      (selected?" selected":"")+'" data-act="calendar-day" data-date="'+date+
      '" role="gridcell" aria-label="'+esc(label)+'">'+
      '<strong>'+esc(Number(date.slice(-2)))+'</strong>'+
      '<span class="booking-calendar-count">'+(n?esc(n)+" 筆":"—")+'</span>'+
      (Number(sum?.confirmed||0)+Number(sum?.checked_in||0)>0
       ?'<small>待處理 '+esc(Number(sum.confirmed||0)+Number(sum.checked_in||0))+'</small>':"")+
      '</button>';
    }).join("")+'</div></div>';
 }else{
  const today=summary.get(calendarState.calendarAnchor);
  grid='<p class="small">當日 '+esc(today?.total||0)+' 筆預約，其中待處理 '+
    esc(Number(today?.confirmed||0)+Number(today?.checked_in||0))+' 筆。</p>';
 }
 let details="";
 if(calendarState.calendarLoading)details='<p role="status" class="muted">正在讀取預約日曆…</p>';
 else if(calendarState.calendarError)details='<p role="alert" class="alert">'+esc(calendarState.calendarError)+'</p>';
 else if(!data)details='<p class="muted">尚未取得本店日曆資料，請按重新查詢。</p>';
 else{
  const entries=(data.items||[]).map(x=>
   '<article class="staff-record"><div class="staff-record-head"><div>'+
    '<strong>'+esc(x.day)+' '+esc(x.time)+' ・ '+esc(x.number||"—")+'</strong>'+
    '<div class="small">'+esc(x.name||"")+" ・ "+esc(x.party||0)+' 位</div>'+
  '<div class="small">聯絡電話：'+(x.phone?'<a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a>':'尚未提供')+'</div>'+
    '<div class="small">編號批次 '+esc(x.round??"—")+' ・ '+esc(x.reference_code||"—")+'</div>'+
    selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div></article>').join("");
  const total=Number(data.total||0);
  const pages=Math.max(1,Math.ceil(total/100));
  details='<h3>預約時段清單</h3><p class="small">依日期及時間排列。共 '+esc(total)+' 筆，第 '+
    esc(calendarState.calendarPage)+' / '+esc(pages)+' 頁；清單每頁最多顯示 100 筆。</p>'+
   (entries||'<p class="muted">這個區間沒有符合條件的預約。</p>')+
   '<div class="staff-actionbar">'+btn("上一頁","calendar-page-prev","outline",calendarState.calendarPage<=1?"disabled":"")+
     btn("下一頁","calendar-page-next","outline",!data.has_more?"disabled":"")+
     btn("重新查詢","calendar-refresh","outline")+'</div>';
 }
 return box("預約日／週／月曆",'<p class="small">僅顯示本店未刪除的預約；按日期可查看當天紀錄。查看日曆不會自動取號，也不會安排員工或服務名額。</p>'+
  control+overview+grid+details);
}

export async function loadBookingCalendar(page=calendarState.calendarPage){
 const request=++calendarState.calendarRequestToken,merchant=routeState.slug;
 if(routeState.view!=="staff"||!staffState.staff?.tenant||!authReady()){
  calendarState.calendarResult=null;calendarState.calendarError="請先完成店員驗證後再查看日曆";render();return;
 }
 const period=calendarPeriod(calendarState.calendarMode,calendarState.calendarAnchor);
 const key=period.start+"/"+period.end+"/"+calendarState.calendarStatus;
 calendarState.calendarLoading=true;calendarState.calendarError="";calendarState.calendarResult=null;
 if(calendarState.pickupCalendarPeriod!==period.start+"/"+period.end){calendarState.pickupCalendarPage=1;calendarState.pickupCalendarResult=null;}
 render();
 try{
  const [data,pickup] = await Promise.all([
  rpc("so_staff_reservation_calendar",{
   p_slug:merchant,p_start:period.start,p_end:period.end,
   p_status:calendarState.calendarStatus,p_page:page,p_page_size:100
  }),
  rpc("so_pickup_calendar",{p_slug:merchant,p_start:period.start,p_end:period.end,p_page:calendarState.pickupCalendarPage||1})
    .then(data=>({data,error:""})).catch(e=>({data:null,error:e?.message||"無法讀取取餐日曆"}))
 ]);
  if(request!==calendarState.calendarRequestToken||routeState.view!=="staff"||routeState.slug!==merchant||staffState.staffTab!=="calendar")return;
  calendarState.pickupCalendarResult=pickup.data;calendarState.pickupCalendarError=pickup.error;calendarState.pickupCalendarPeriod=period.start+"/"+period.end;
  calendarState.calendarResult=data;calendarState.calendarPage=page;calendarState.calendarTenant=merchant;calendarState.calendarDataKey=key;
 }catch(e){
  if(request!==calendarState.calendarRequestToken||routeState.slug!==merchant)return;
  calendarState.calendarResult=null;calendarState.calendarError=e?.message||"無法讀取預約日曆";
 }finally{
  if(request===calendarState.calendarRequestToken&&routeState.slug===merchant){
   calendarState.calendarLoading=false;
   if(routeState.view==="staff"&&staffState.staffTab==="calendar")render();
  }
 }
}
