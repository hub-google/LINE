import {bookingState} from "./state/bookingState.js";
import {customerState} from "./state/customerState.js";
import {routeState} from "./state/routeState.js";

import {btn,esc,field,menuSelectSection,showActionFeedback,taipei} from "./shared-ui.js";
import {render} from "./staff-layout.js";
import {rpc} from "./data-loading.js";

export function finishManageLink(){
 bookingState.manageKind="";bookingState.manageItem="";bookingState.manageMode="view";
 const url=new URL(location.href);
 for(const key of ["manage","item","mode"])url.searchParams.delete(key);
 if(!url.searchParams.has("liff.state"))history.replaceState(null,"",url.pathname+url.search+url.hash);
}

export function dateInThirtyDays(){
 const d=new Date(taipei()+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+30);
 return d.toISOString().slice(0,10);
}

// Session-based shops can create sessions 90 days ahead; keep the customer date picker in sync.
export function dateInNinetyDays(){
 const d=new Date(taipei()+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+90);
 return d.toISOString().slice(0,10);
}

export async function fetchBookingEditSlots(){
 const id=bookingState.editingBookingId,lookup=bookingState.editDate;
 bookingState.editLoading=true;bookingState.editSlots=null;render();
 try{
   const record=(customerState.customer?.my_reservations||[]).find(x=>x.id===id);
   const sessionMode=!!record?.session_id;
   const viewData=await rpc(sessionMode?"so_unit_config":"so_public_state",
     {p_slug:routeState.slug,p_date:lookup});
   if(bookingState.editingBookingId===id&&bookingState.editDate===lookup){
     if(sessionMode){
       const units=new Map((viewData.units||[]).filter(u=>u.active).map(u=>[u.id,u]));
       bookingState.editSlots=(viewData.sessions||[]).filter(s=>s.active&&units.has(s.unit_id)&&
         Date.parse(s.date+"T"+s.start+":00+08:00")>Date.now()).map(s=>({
           id:s.id,time:s.start,
           label:(units.get(s.unit_id)?.is_default?"一般場次":units.get(s.unit_id)?.name||"場次")+
             " · "+s.name+" "+s.start+"–"+s.end,
           available:Math.max(0,Number(s.capacity)-Number(s.booked||0)+
             (s.id===record.session_id?Number(record.party):0))
         }));
     }else bookingState.editSlots=viewData.slots||[];
     if(!bookingState.editSlots.some(s=>(sessionMode?s.id:s.time)===bookingState.editTime))bookingState.editTime="";
   }
 }catch(e){
   showActionFeedback("無法取得可預約時段："+(e.message||String(e)),"error");
 }finally{bookingState.editLoading=false;render();}
}

export async function beginBookingEdit(id){
 const record=(customerState.customer?.my_reservations||[]).find(x=>x.id===id);
 if(!record||record.status!=="CONFIRMED"){showActionFeedback("這筆預約目前無法編輯","error");return;}
 bookingState.editingBookingId=id;bookingState.editDate=String(record.day);bookingState.editTime=String(record.session_id||record.time);bookingState.editParty=Number(record.party);
 bookingState.editChosenItems=Array.isArray(record.selected_items)?record.selected_items.map(x=>x.id):[];
 routeState.customerTab="mine";bookingState.manageMode="edit";bookingState.manageKind="reservation";bookingState.manageItem=id;
 await fetchBookingEditSlots();
}

export function editBookingForm(record){
 if(bookingState.editingBookingId!==record.id)return "";
 const sessionMode=!!record.session_id;
 const choices=(bookingState.editSlots||[]).map(x=>{
  const value=sessionMode?x.id:x.time;
  const isOriginal=sessionMode?x.id===record.session_id:x.time===record.time&&bookingState.editDate===record.day;
  return '<option value="'+esc(value)+'" '+(bookingState.editTime===value?'selected ':'')+
   (!isOriginal&&x.available<bookingState.editParty?'disabled ':'')+'>'+esc(x.label||x.time)+'（剩餘 '+esc(x.available)+' 位）</option>';
 }).join("");
 return '<div class="staff-record" style="margin-top:12px;background:#f8fafc">'+
  '<h3 style="margin-top:0">編輯預約資訊</h3><div class="grid">'+
  '<div>'+field("預約日期","edit-book-date",bookingState.editDate,"date",'min="'+taipei()+'" max="'+(sessionMode?dateInNinetyDays():dateInThirtyDays())+'"')+'</div>'+
  '<div>'+field("預約人數","edit-book-party",bookingState.editParty,"number",'min="1" max="20"')+'</div></div>'+
  '<label for="edit-book-time">'+(sessionMode?'預約場次':'預約時間')+'</label>'+
  (bookingState.editLoading?'<p class="muted">正在讀取可預約時段…</p>':
   '<select id="edit-book-time" class="field"><option value="">請選擇時段</option>'+choices+'</select>')+
  menuSelectSection(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",customerState.customer?.menu_items||[],bookingState.editChosenItems,"edit")+
  '<p class="staff-help">修改後會再次確認名額，預約編號維持不變，並發送更新通知。</p>'+
  '<div class="staff-actionbar">'+btn("儲存預約修改","save-book-edit","primary",!bookingState.editTime||bookingState.editLoading?'disabled':'')+
  btn("返回","close-book-edit","outline")+'</div></div>';
}
