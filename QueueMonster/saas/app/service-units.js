import {bookingState} from "./state/bookingState.js";
import {customerState} from "./state/customerState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";


import {box,btn,esc,field,menuChoiceReady,menuSelectSection,taipei} from "./shared-ui.js";
import {bookingContactFields,normalizeBookingPhone,validBookingContact} from "./customer-booking.js";
import {dateInNinetyDays} from "./booking-edit.js";
import {renderBookings} from "./customer-records.js";

export function unitList(){
 let data=(serviceUnitsState.unitConfig?.units||[]).filter(x=>x.active);
 if(serviceUnitsState.unitCategory&&serviceUnitsState.unitConfig?.grouped)data=data.filter(x=>(x.group||"其他")===serviceUnitsState.unitCategory);
 return data;
}

export function unitSessionAvailable(s,mode=routeState.customerTab){
 if(!s?.active||!(serviceUnitsState.unitConfig?.units||[]).some(u=>u.id===s.unit_id&&u.active))return false;
 if(mode!=="queue"&&mode!=="reserve")return true;
 const starts=Date.parse(s.date+"T"+s.start+":00+08:00");
 const ends=Date.parse(s.date+"T"+s.end+":00+08:00");
 const now=Date.now();
 if(!Number.isFinite(starts)||!Number.isFinite(ends))return false;
 if(mode==="queue")return s.date===taipei()&&now>=starts-3*60*60*1000&&now<=ends;
 return starts>now&&s.date>=taipei()&&
   Number(s.capacity)-Number(s.booked||0)>=Math.max(1,Number(bookingState.bookingParty)||1);
}

export function sessionsOf(unitId=serviceUnitsState.unitChoice,mode=routeState.customerTab){
 return (serviceUnitsState.unitConfig?.sessions||[]).filter(s=>(unitId===null||s.unit_id===unitId)&&unitSessionAvailable(s,mode));
}

export function availableUnits(mode=routeState.customerTab){
 return unitList().filter(u=>sessionsOf(u.id,mode).length>0);
}


export function selectedUnitSession(mode=routeState.customerTab){
 const units=availableUnits(mode),useWindows=serviceUnitsState.unitConfig?.picker===true&&units.length>1;
 const actual=units.find(u=>u.id===serviceUnitsState.unitChoice)||units[0];
 const ss=useWindows?sessionsOf(actual?.id,mode):sessionsOf(null,mode);
 return ss.find(s=>s.id===serviceUnitsState.unitSessionChoice)||ss[0]||null;
}

export function unitBookingFingerprint(s,party){
 return JSON.stringify({shop:routeState.slug,day:routeState.day,session:s?.id||"",party,
  name:bookingState.bookingContactName.trim(),phone:normalizeBookingPhone(bookingState.bookingContactPhone),
  items:[...bookingState.bookingChosenItems].sort()});
}

export function unitNameForSession(sid){
 const s=(serviceUnitsState.unitConfig?.sessions||[]).find(x=>x.id===sid),u=(serviceUnitsState.unitConfig?.units||[]).find(x=>x.id===s?.unit_id);
 return u?.is_default?"一般場次":u?.name||"一般場次";
}


export function unitChooseHtml(mode=routeState.customerTab){
 const units=availableUnits(mode);
 const useWindows=serviceUnitsState.unitConfig?.picker===true && units.length>1;
 const groups=[...new Set(units.map(u=>u.group||"其他"))];
 const actual=units.find(x=>x.id===serviceUnitsState.unitChoice)||units[0];
 const sessions=useWindows?sessionsOf(actual?.id,mode):sessionsOf(null,mode);
 const selected=selectedUnitSession(mode);
 return (useWindows?'<div class="unit-form-header"><h3>選擇服務窗口</h3><span>'+units.length+' 個選項</span></div>'+
  (serviceUnitsState.unitConfig?.grouped&&groups.length?'<div class="unit-category-chips">'+["全部",...groups].map(g=>
   btn(g,"unit-category-pill",serviceUnitsState.unitCategory===(g==="全部"?"":g)?"primary":"outline",
    'data-category="'+esc(g==="全部"?"":g)+'"')).join("")+'</div>':'')+
  '<div class="unit-card-grid">'+units.map(u=>{
    const first=sessionsOf(u.id,mode)[0];
    return '<button type="button" class="unit-option '+(u.id===actual?.id?'selected':'')+
      '" data-act="unit-choose" data-id="'+esc(u.id)+'" aria-pressed="'+String(u.id===actual?.id)+'">'+
      '<span class="unit-option-copy"><strong>'+esc(u.is_default?"一般場次":u.name)+'</strong><small>'+
      esc(first?.name||"")+' '+esc(first?.start||"")+'</small></span></button>';
   }).join("")+'</div>':'')+
   (sessions.length?'<label for="unit-session">開放場次</label><select class="field" id="unit-session">'+
    sessions.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?.id?'selected':'')+'>'+
     esc(!useWindows&&units.length>1?unitNameForSession(s.id)+" · ":"")+esc(s.name)+' '+esc(s.start)+'–'+esc(s.end)+
     (mode==="reserve"?' · 剩 '+esc(Math.max(0,s.capacity-Number(s.booked||0)))+' 位':"")+
     '</option>').join("")+'</select>':
   '<p class="notice">'+(mode==="queue"?"目前沒有開放取號的場次，請稍後再查看。":"目前沒有可預約的場次或名額，請選擇其他日期。")+'</p>');
}

export function unitBookingPanel(){
 const s=selectedUnitSession();
 const available=s&&Number(s.booked||0)+Number(bookingState.bookingParty)<=s.capacity;
 const confirming=customerState.customer?.booking_confirmation_required!==false&&serviceUnitsState.unitConfirmKey===unitBookingFingerprint(s,Number(bookingState.bookingParty));
 return box("選擇預約場次",
   '<p class="small">選擇可預約的場次；若店家有不同服務窗口，也可先選擇窗口。</p>'+
   field("預約日期","customer-day",routeState.day,"date",'min="'+taipei()+'" max="'+dateInNinetyDays()+'"')+
   unitChooseHtml("reserve")+
   '<div class="grid"><div>'+field("本次人數","customer-party",bookingState.bookingParty||1,"number",'min="1" max="20"')+'</div></div>'+
   menuSelectSection(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",customerState.customer?.menu_items||[],bookingState.bookingChosenItems,"booking")+
   bookingContactFields("unit")+
   '<p class="small">預約場次代表可報到的時段，實際開始服務時間依現場叫號與人員安排。</p>'+
   (confirming?'<div class="notice"><strong>確認預約資訊</strong><p>'+esc(unitNameForSession(s?.id))+' · '+esc(s?.name||"")+
    '</p><p>日期：'+esc(routeState.day)+' '+esc(s?.start||"")+'–'+esc(s?.end||"")+'</p>'+
    '<p>姓名：'+esc(bookingState.bookingContactName.trim())+'，'+esc(bookingState.bookingParty)+' 位</p></div>':'')+
   '<div class="staff-actionbar">'+btn(confirming?"確認送出預約":"下一步：確認預約",
    confirming?"unit-book-final":customerState.customer?.booking_confirmation_required===false?"unit-book-final":"unit-book-review",
    "primary full",(!available||!validBookingContact()||
    !menuChoiceReady(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",bookingState.bookingChosenItems,customerState.customer?.menu_items||[])?'disabled':''))+
    (confirming?btn("返回修改","unit-book-back","outline"):"")+'</div>')+
   box("我的近期預約",renderBookings(customerState.customer?.my_reservations||[],true));
}

export function unitQueuePanel(){
 const s=selectedUnitSession();
 return box("選擇取號場次",
   '<p class="small">每個場次獨立叫號，取號後可從「我的取號」查看實際順序。</p>'+
   unitChooseHtml("queue")+
   field("本次候位人數","customer-queue-party",queueState.queuePartySize||1,"number",'min="1" max="20"')+
   menuSelectSection(customerState.customer?.tenant?.menu_queue_mode||"DISABLED",customerState.customer?.menu_items||[],queueState.queueChosenItems,"queue")+
   '<div class="staff-actionbar">'+btn("立即取號","unit-take","primary full",
      (!s||!queueState.queuePartySize||!unitSessionAvailable(s,"queue")||!menuChoiceReady(customerState.customer?.tenant?.menu_queue_mode||"DISABLED",queueState.queueChosenItems,customerState.customer?.menu_items||[])?'disabled':''))+'</div>');
}


export function unitSettingsPanel(isManager){
 const units=serviceUnitsState.unitConfig?.units||[];
 const realUnits=units.filter(u=>!u.is_default);
 const chosen=realUnits.find(u=>u.id===serviceUnitsState.unitEditingId);
 const sessions=serviceUnitsState.unitConfig?.sessions||[];
 const editing=sessions.find(s=>s.id===serviceUnitsState.unitEditingSession);
 const showForm=serviceUnitsState.showSessionForm===true || !!editing;
 const options='<option value="">不指定（一般場次）</option>'+
  realUnits.filter(u=>u.active).map(u=>'<option value="'+esc(u.id)+'" '+
   ((editing?.unit_id||serviceUnitsState.unitAdminUnit)===u.id?'selected':'')+'>'+esc(u.name)+'</option>').join("");
 const sessionRows=sessions.map(s=>
   '<tr><td><strong>'+esc(s.name)+'</strong><div class="small">'+esc(unitNameForSession(s.id))+'</div></td>'+
   '<td>'+esc(s.start)+'－'+esc(s.end)+'</td><td>'+esc(s.capacity)+' 人</td>'+
   '<td>'+esc(s.active?'開放中':'未開放')+'</td><td><div class="staff-actionbar">'+
   (isManager?btn("編輯","unit-session-edit","outline",'data-id="'+esc(s.id)+'"')+
     btn("刪除","unit-session-delete","outline",'data-id="'+esc(s.id)+'" data-name="'+esc(s.name)+'"'):'—')+
   '</div></td></tr>').join("");
 const sessionCard=box("場次管理",
   '<p class="small">小吃店、餐廳可直接新增場次，無需建立服務窗口。每個場次可獨立設定時間與名額。</p>'+
   field("場次日期","unit-admin-date",serviceUnitsState.unitAdminDate,"date")+
   '<div class="scroll"><table class="rows"><thead><tr><th>場次</th><th>時間</th><th>名額</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+
   (sessions.length?sessionRows:'<tr><td colspan="5">這一天沒有設定場次，按下方「新增場次」開始設定。</td></tr>')+
   '</tbody></table></div>'+
   (isManager?'<div class="staff-actionbar" style="margin-top:14px">'+btn("＋ 新增場次","unit-session-new","primary")+'</div>':'')+
   (isManager&&showForm?'<div class="inset" style="margin-top:16px"><h3>'+esc(editing?"編輯場次":"新增場次")+'</h3>'+
    '<label for="unit-admin-unit">服務窗口（選填）</label><select class="field" id="unit-admin-unit" '+''+'>'+options+'</select>'+
    '<p class="small">例如：1診、2診、售後窗口、維修窗口；一般店家可保持「不指定」。建立後仍可調整服務窗口，原預約與叫號紀錄會保留。</p>'+
    field("場次日期","unit-session-date",editing?.date||serviceUnitsState.unitAdminDate,"date")+
    '<div class="grid"><div>'+field("場次名稱","unit-session-name",editing?.name||"上午場","text",'maxlength="60"')+
      field("開始時間","unit-session-start",editing?.start||"09:00","time")+'</div>'+
    '<div>'+field("開放名額","unit-session-capacity",editing?.capacity??10,"number",'min="1" max="300"')+
      field("結束時間","unit-session-end",editing?.end||"12:00","time")+'</div></div>'+
    '<label class="checklist"><input id="unit-session-active" type="checkbox" '+(editing?.active!==false?'checked':'')+'> 開放此場次</label>'+
    '<div class="staff-actionbar">'+btn(editing?"儲存修改":"儲存新場次","unit-session-save","primary")+
      btn("取消","unit-session-cancel","outline")+'</div></div>':''));
 const windowsCard=box("服務窗口（選填）",
   '<p class="small">例如：1診、2診、售後窗口、維修窗口。沒有分窗口的店家不必設定這裡。</p>'+
   (realUnits.length?'<div class="staff-actionbar">'+realUnits.map(u=>
     btn((u.active?'':'〔停用〕')+u.name,"unit-edit","outline",'data-id="'+esc(u.id)+'"')).join("")+'</div>':'<p class="small">目前沒有額外服務窗口。</p>')+
   (isManager?'<div class="grid"><div>'+field("服務窗口名稱","unit-name",chosen?.name||"","text",'placeholder="例如：1診、售後窗口"')+
     field("分類（選填）","unit-group",chosen?.group||"")+'</div>'+
     '<div>'+field("排序","unit-order",chosen?.sort_order??0,"number")+'</div></div>'+
     '<label class="checklist"><input id="unit-active" type="checkbox" '+(chosen?.active!==false?'checked':'')+'> 啟用此窗口</label>'+
     '<div class="staff-actionbar">'+btn(chosen?"儲存窗口修改":"新增服務窗口","unit-save","primary")+
      (chosen?btn("取消編輯","unit-new","outline"):"")+'</div>':'')+
   '<div class="inset" style="margin-top:14px"><p class="small">有多個窗口時，可選擇是否讓顧客先挑選窗口；不勾選時顧客仍可直接選場次。</p>'+
   '<label class="checklist"><input type="checkbox" id="enable-units" '+
      (serviceUnitsState.unitConfig?.picker?'checked':'')+(!isManager||!realUnits.some(u=>u.active)?' disabled':'')+'> 讓顧客選擇服務窗口</label>'+
   '<label class="checklist"><input type="checkbox" id="group-units" '+(serviceUnitsState.unitConfig?.grouped?'checked':'')+
      (isManager?'':' disabled')+'> 顯示窗口分類</label>'+
   '<label class="checklist"><input type="checkbox" id="link-units" '+(serviceUnitsState.unitConfig?.linked?'checked':'')+
      (isManager?'':' disabled')+'> 預約報到後自動加入場次叫號</label>'+
   (isManager?'<div class="staff-actionbar">'+btn("儲存窗口顯示方式","save-unit-mode","primary")+'</div>':'')+'</div>');
 return sessionCard+windowsCard;
}


export function initializeServiceUnits(){
serviceUnitsState.unitEnabled=()=>serviceUnitsState.unitConfig?.multi===true;
}
