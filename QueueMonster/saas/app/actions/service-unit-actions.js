import {bookingState} from "../state/bookingState.js";
import {customerState} from "../state/customerState.js";
import {lineState} from "../state/lineState.js";
import {queueState} from "../state/queueState.js";
import {routeState} from "../state/routeState.js";
import {serviceUnitsState} from "../state/serviceUnitsState.js";


import {act,clearCustomerBookingRequest,customerBookingRequestId,rpc,val} from "./../data-loading.js";
import {render} from "./../staff-layout.js";
import {customerNoticeSuffix,notifyLineCalled,sendLineNotice} from "./../line-session.js";
import {selectedUnitSession,unitBookingFingerprint,unitNameForSession,unitSessionAvailable} from "./../service-units.js";
import {bookingRequestDetails,normalizeBookingPhone,validBookingContact} from "./../customer-booking.js";
import {showActionFeedback} from "./../shared-ui.js";

export async function handleServiceUnitActions(ev,b,a,id){
if(a==="save-unit-mode"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:routeState.slug,p_action:"settings",p_data:{
     multi:!!routeState.$("enable-units")?.checked,grouped:!!routeState.$("group-units")?.checked,linked:!!routeState.$("link-units")?.checked
    }});
    return "服務單位顯示與連動設定已儲存";
   });return true;
 }
 if(a==="unit-edit"){serviceUnitsState.unitEditingId=id;render();return true;}
 if(a==="unit-new"){serviceUnitsState.unitEditingId="";render();return true;}
 if(a==="unit-save"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:routeState.slug,p_action:"unit",p_data:{
     id:serviceUnitsState.unitEditingId||null,name:val("unit-name"),group:val("unit-group"),
     sort_order:Number(val("unit-order")||0),active:!!routeState.$("unit-active")?.checked
    }});
    serviceUnitsState.unitEditingId="";return "服務單位已儲存";
   });return true;
 }
 if(a==="unit-session-edit"){serviceUnitsState.unitEditingSession=id;serviceUnitsState.showSessionForm=true;const s=(serviceUnitsState.unitConfig?.sessions||[]).find(x=>x.id===id);serviceUnitsState.unitAdminUnit=s?.unit_id||"";render();return true;}
 if(a==="unit-session-new"){serviceUnitsState.unitEditingSession="";serviceUnitsState.unitAdminUnit="";serviceUnitsState.showSessionForm=true;render();return true;}
 if(a==="unit-session-cancel"){serviceUnitsState.unitEditingSession="";serviceUnitsState.unitAdminUnit="";serviceUnitsState.showSessionForm=false;render();return true;}
 if(a==="unit-session-delete"){
   const selected=(serviceUnitsState.unitConfig?.sessions||[]).find(x=>x.id===id);
   if(!selected)return true;
   if(!confirm("確定刪除「"+selected.name+"」（"+selected.start+"－"+selected.end+"）嗎？\n\n如有有效預約或候位號碼，系統會禁止刪除；過往紀錄會保留。"))return true;
   await act(async()=>{
     await rpc("so_unit_manage",{p_slug:routeState.slug,p_action:"session_delete",p_data:{id}});
     serviceUnitsState.unitEditingSession="";serviceUnitsState.showSessionForm=false;
     return "場次已刪除，歷史紀錄仍保留";
   });return true;
 }
 if(a==="unit-session-save"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:routeState.slug,p_action:"session",p_data:{
      id:serviceUnitsState.unitEditingSession||null,unit_id:val("unit-admin-unit")||null,date:serviceUnitsState.unitAdminDate,
      name:val("unit-session-name"),start:val("unit-session-start"),
      end:val("unit-session-end"),capacity:Number(val("unit-session-capacity")),
      active:!!routeState.$("unit-session-active")?.checked
    }});
    serviceUnitsState.unitEditingSession="";serviceUnitsState.unitAdminUnit="";serviceUnitsState.showSessionForm=false;return "場次設定已儲存";
   });return true;
 }
 if(a==="unit-call"||a==="unit-recall"){
   await act(async()=>{
    const res=await rpc("so_unit_call",{p_slug:routeState.slug,p_session_id:b.dataset.session,
      p_action:a==="unit-call"?"call":"recall",p_ticket_id:a==="unit-recall"?id:null});
    const notice=await notifyLineCalled(res.number,res.ticket_id,res.line_call_event_id);
    return "已叫號 "+res.number+"；"+notice;
   });return true;
 }
 if(a==="unit-book-review"){
    const s=selectedUnitSession("reserve");
    if(!s||!unitSessionAvailable(s,"reserve")||!validBookingContact())return true;
    serviceUnitsState.unitConfirmKey=unitBookingFingerprint(s,Number(bookingState.bookingParty));render();return true;
 }
 if(a==="unit-book-back"){serviceUnitsState.unitConfirmKey="";render();return true;}
 if(a==="unit-book-final"){
   if(customerState.customer?.booking_confirmation_required!==false&&serviceUnitsState.unitConfirmKey!==unitBookingFingerprint(selectedUnitSession(),Number(bookingState.bookingParty))){
      showActionFeedback("預約資料已變動，請重新確認。","warning");serviceUnitsState.unitConfirmKey="";render();return true;
   }
   await act(async()=>{
    if(lineState.lineLinkStatus!=="linked")throw Error("請先完成 LINE 身分驗證");
    const s=selectedUnitSession();
    if(!s||!unitSessionAvailable(s,"reserve"))throw Error("此場次已無法預約，請重新選擇");
    if(!validBookingContact())throw Error("請填寫姓名及有效手機號碼");
    const party=Number(val("customer-party")),items=bookingState.bookingChosenItems.slice();
    if(!Number.isInteger(party)||party<1||party>20)throw Error("請填寫正確人數");
    const requestId=customerBookingRequestId(bookingRequestDetails(s.id,party,items));
    const result=await rpc("so_unit_book_once",{p_slug:routeState.slug,p_session_id:s.id,
      p_name:bookingState.bookingContactName.trim(),p_phone:normalizeBookingPhone(bookingState.bookingContactPhone),
      p_party:party,p_items:items,p_request_id:requestId});
    clearCustomerBookingRequest(requestId);
    routeState.customerTab="mine";serviceUnitsState.unitSessionChoice="";bookingState.bookingChosenItems=[];serviceUnitsState.unitConfirmKey="";
    const notice=result.replayed?"":await sendLineNotice("notify-reservation",{reservationId:result.id});
    return (result.replayed?"已找到先前的預約":"預約已成立")+"；"+unitNameForSession(s.id)+" "+s.name+
      (notice?customerNoticeSuffix(notice):"");
   });return true;
 }
 if(a==="unit-take"){
   await act(async()=>{
    if(lineState.lineLinkStatus!=="linked")throw Error("請先完成 LINE 身分驗證");
    const s=selectedUnitSession();
    if(!s||!unitSessionAvailable(s,"queue"))throw Error("目前沒有開放取號的場次，請重新選擇");
    const result=await rpc("so_unit_take_number",{p_slug:routeState.slug,p_session_id:s.id,
      p_party:Number(val("customer-queue-party")),p_items:queueState.queueChosenItems.slice()});
    queueState.progressTicketId=result.id;routeState.customerTab="progress";queueState.queueChosenItems=[];
    const notice=await sendLineNotice("notify-ticket",{ticketId:result.id});
    return "已取得號碼 "+result.number+customerNoticeSuffix(notice);
   });return true;
 }
return false;
}
