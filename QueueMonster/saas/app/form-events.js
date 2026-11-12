import {bookingState} from "./state/bookingState.js";
import {calendarState} from "./state/calendarState.js";
import {customerState} from "./state/customerState.js";
import {feedbackState} from "./state/feedbackState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";
import {sharedUiState} from "./state/sharedUiState.js";
import {staffHistoryState} from "./state/staffHistoryState.js";
import {staffState} from "./state/staffState.js";



import {refreshServiceSlots,syncBookingPartyInput,validBookingContact} from "./customer-booking.js";
import {jsStatus,menuChoiceReady} from "./shared-ui.js";
import {render} from "./staff-layout.js";
import {act,load,rpc} from "./data-loading.js";
import {loadBookingCalendar} from "./booking-calendar.js";
import {availableUnits} from "./service-units.js";
import {ticketStatusRpc} from "./actions/staff-queue-actions.js";
import {fetchBookingEditSlots} from "./booking-edit.js";
import {customerNoticeSuffix,notifyLineCalled,sendLineNotice} from "./line-session.js";



export function initializeFormEvents(){
document.addEventListener("input",ev=>{
 const el=ev.target;
 if(el?.id==="customer-party")syncBookingPartyInput(el.value);
 if(el?.id==="customer-book-name"||el?.id==="customer-book-phone"){
   if(el.id==="customer-book-name")bookingState.bookingContactName=el.value;
   else bookingState.bookingContactPhone=el.value;
   bookingState.bookingContactDirty=true;bookingState.bookingConfirmationKey="";serviceUnitsState.unitConfirmKey="";
   const submit=document.querySelector('button[data-act="book"]');
   if(submit)submit.disabled=!bookingState.chosenSlot||!bookingState.bookingParty||!validBookingContact()||
     !menuChoiceReady(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",bookingState.bookingChosenItems,customerState.customer?.menu_items||[]);
 }
});
document.addEventListener("change",async ev=>{
 const el=ev.target;
 if(el.dataset.menuChoice){
   const flow=el.dataset.menuChoice;
   const list=flow==="booking"?bookingState.bookingChosenItems:flow==="queue"?queueState.queueChosenItems:bookingState.editChosenItems;
   const id=el.value;
   if(el.checked&&!list.includes(id))list.push(id);
   if(!el.checked){const index=list.indexOf(id);if(index>=0)list.splice(index,1);}
   if(flow==="booking"){bookingState.chosenSlot="";bookingState.serviceSlotPreview=null;serviceUnitsState.unitConfirmKey="";if(!serviceUnitsState.unitEnabled())void refreshServiceSlots();}
   render();return;
 }
 if(["set-service-reservation","set-service-queue","set-service-pickup"].includes(el.id)){
   const kind=el.id==="set-service-reservation"?"reserve":el.id==="set-service-queue"?"queue":"order";
   const section=document.querySelector('[data-service-url-kind="'+kind+'"]');
   if(section){
     const active=section.querySelector("[data-service-url-active]");
     const inactive=section.querySelector("[data-service-url-inactive]");
     if(active)active.style.display=el.checked?"":"none";
     if(inactive)inactive.style.display=el.checked?"none":"";
   }
   return;
 }
 if(el.id==="schedule-special-mode"){
  const mode=el.value;
  if(!["CLOSED","CUSTOM","TEMPLATE"].includes(mode))return;
  if(serviceUnitsState.scheduleExceptionDraft)serviceUnitsState.scheduleExceptionDraft.mode=mode;
  for(const section of document.querySelectorAll("[data-schedule-template-choice]"))
   section.style.display=mode==="CLOSED"?"none":"";
  for(const section of document.querySelectorAll("[data-schedule-custom]"))
   section.style.display=mode==="CUSTOM"?"":"none";
  return;
 }
 if(el.id==="menu-kind"){
   const custom=el.value==="__CUSTOM__";
   const wrap=routeState.$("menu-custom-kind-wrap");
   const input=routeState.$("menu-custom-kind");
   if(wrap)wrap.hidden=!custom;
   if(input){input.disabled=!custom;if(custom)input.focus();}
   return;
 }
 if(el.id==="rule-service"){
   const rule=(staffState.staff?.resourceContext?.service_rules||[]).find(x=>x.item_id===el.value);
   if(routeState.$("rule-duration"))routeState.$("rule-duration").value=String(rule?.duration_minutes??staffState.staff?.tenant?.slot_minutes??30);
   if(routeState.$("rule-buffer"))routeState.$("rule-buffer").value=String(rule?.buffer_minutes??0);
   if(routeState.$("rule-resource"))routeState.$("rule-resource").value=rule?.resource_id||"";
   if(routeState.$("rule-show-duration"))routeState.$("rule-show-duration").checked=rule?.show_duration_to_customer!==false;
   return;
 }
 if(el.id==="staff-history-days"){staffHistoryState.staffHistoryDays=Number(el.value);await load();return;}
 if(el.id==="analytics-days"){staffState.analyticsDays=Number(el.value);await load();return;}
 if(el.id==="platform-pickup-filter"){
   if(!["all","enabled","disabled"].includes(el.value))return;
   routeState.platformPickupFilter=el.value;render();return;
 }
 if(el.id==="calendar-status"){
   if(!["ALL","CONFIRMED","CHECKED_IN","COMPLETED","CANCELLED","NO_SHOW"].includes(el.value))return;
   calendarState.calendarStatus=el.value;calendarState.calendarPage=1;void loadBookingCalendar(1);return;
 }
 if(el.id==="customer-flag-picker"){staffState.customerFlagSelected=el.value;render();return;}
 if(el.id==="customer-day"){routeState.day=el.value;bookingState.chosenSlot="";bookingState.serviceSlotPreview=null;serviceUnitsState.unitConfirmKey="";await load();return;}
 if(el.id==="unit-admin-date"){serviceUnitsState.unitAdminDate=el.value;serviceUnitsState.unitEditingSession="";serviceUnitsState.showSessionForm=false;await load();return;}
 if(el.id==="customer-unit"){serviceUnitsState.unitChoice=el.value;serviceUnitsState.unitSessionChoice="";serviceUnitsState.unitConfirmKey="";render();return;}
 if(el.id==="unit-category"){serviceUnitsState.unitCategory=el.value;serviceUnitsState.unitChoice=availableUnits(routeState.customerTab)[0]?.id||"";serviceUnitsState.unitSessionChoice="";serviceUnitsState.unitConfirmKey="";render();return;}
 if(el.id==="unit-session"){serviceUnitsState.unitSessionChoice=el.value;serviceUnitsState.unitConfirmKey="";render();return;}
 if(el.id==="staff-unit-session"){serviceUnitsState.unitStaffSession=el.value;render();return;}
 if(el.id==="staff-booking-unit-filter"){bookingState.bookingUnitFilter=el.value;render();return;}
 if(el.id==="unit-admin-unit"){serviceUnitsState.unitAdminUnit=el.value;return;}
 if(el.id==="customer-party"){syncBookingPartyInput(el.value);serviceUnitsState.unitConfirmKey="";if(serviceUnitsState.unitEnabled()&&routeState.customerTab==="reserve")render();return;}
 if(el.id==="customer-queue-party"){
  const n=Number(el.value);queueState.queuePartySize=Number.isInteger(n)&&n>=1&&n<=20?n:0;
  const button=document.querySelector('button[data-act="take"],button[data-act="unit-take"]');
  if(button)button.disabled=!queueState.queuePartySize||!menuChoiceReady(customerState.customer?.tenant?.menu_queue_mode||"DISABLED",queueState.queueChosenItems,customerState.customer?.menu_items||[]);
  return;
 }
 if(el.id==="edit-book-date"){bookingState.editDate=el.value;bookingState.editTime="";await fetchBookingEditSlots();return;}
 if(el.id==="edit-book-time"){bookingState.editTime=el.value;render();return;}
 if(el.id==="edit-book-party"){bookingState.editParty=Number(el.value);render();return;}
 if(el.dataset.deleteKind){
  if(feedbackState.busy)return;
  const kind=el.dataset.deleteKind,id=el.dataset.id,deleted=el.checked;
  if(!id||!["reservation","ticket"].includes(kind))return;
  if(deleted&&!confirm("確定刪除這筆"+(kind==="reservation"?"預約":"號碼牌")+"？\n顧客的預約或取號畫面將直接不顯示，且不會發送 LINE 通知。")){render();return;}
  await act(async()=>{
    const result=await rpc("so_staff_set_record_deleted",{p_slug:routeState.slug,p_kind:kind,p_id:id,p_deleted:deleted});
    sharedUiState.lastStaffChange=null;
    return (result.changed?(deleted?"已刪除":"已恢復"):"無須變更")+
      (kind==="reservation"?"預約":"號碼牌")+"；不會發送 LINE 通知";
  });return;
 }
 if(el.dataset.statusKind){
  if(feedbackState.busy)return;
  const kind=el.dataset.statusKind, id=el.dataset.id, previous=el.dataset.previous, desired=el.value;
  if(!id||!previous||desired===previous)return;
  if(desired==="CANCELLED"&&!confirm("確定取消嗎？系統會通知顧客。")){render();return;}
  await act(async()=>{
   const unitRelated=serviceUnitsState.unitEnabled()&&(kind==="ticket"?(serviceUnitsState.unitRecords.tickets||[]).some(x=>x.id===id):(serviceUnitsState.unitRecords.reservations||[]).some(x=>x.id===id));
   if(kind==="reservation"&&desired==="CHECKED_IN"&&serviceUnitsState.unitConfig?.linked&&unitRelated){
     const result=await rpc("so_unit_checkin",{p_slug:routeState.slug,p_reservation_id:id});
     return "已報到並加入對應叫號隊列："+result.number;
   }
   const procedure=kind==="reservation"?"so_staff_set_reservation_status":ticketStatusRpc(id);
   const args=kind==="reservation"?
    {p_slug:routeState.slug,p_reservation_id:id,p_status:desired,p_expected_status:previous}:
    {p_slug:routeState.slug,p_ticket_id:id,p_status:desired,p_expected_status:previous};
   const result=await rpc(procedure,args);
   const label=kind==="ticket"?(staffState.staff?.tickets||[]).find(x=>x.id===id)?.number:
    (staffState.staff?.reservations||[]).find(x=>x.id===id)?.name;
   if(result.changed)sharedUiState.lastStaffChange={kind,id,label:label||(kind==="ticket"?"號碼牌":"預約"),before:previous,after:desired,slug:routeState.slug,day:routeState.day};
   let msg=(kind==="ticket"?"號碼牌 ":"預約 ")+(label||"")+"：已改為「"+jsStatus(desired)+"」";
   if(kind==="reservation"&&desired==="CHECKED_IN")msg+="，已完成預約報到（不會自動取號）";
   if(kind==="ticket"&&desired==="CALLED"&&result.changed)
     msg+="；"+await notifyLineCalled(result.number,result.ticket_id,result.line_call_event_id);
   if(result.changed&&desired==="CANCELLED"){
     const notice=kind==="ticket"
       ?await sendLineNotice("notify-ticket-cancel",{ticketId:id})
       :await sendLineNotice("notify-reservation-cancel",{reservationId:id});
     msg+=customerNoticeSuffix(notice);
   }
   if(result.changed&&kind==="ticket"&&previous==="CANCELLED"&&["WAITING","HOLD"].includes(desired)){
     msg+="；"+await sendLineNotice("notify-ticket-restored",{ticketId:id,eventId:result.line_restore_event_id});
   }
   if(result.changed&&kind==="reservation"&&previous==="CANCELLED"&&desired==="CONFIRMED"){
     // Restored reservations reuse the existing booking confirmation LINE card.
     const notice=await sendLineNotice("notify-reservation-restored",{reservationId:id});
     msg+="；"+notice;
   }
   return msg;
  });return;
 }
});
}
