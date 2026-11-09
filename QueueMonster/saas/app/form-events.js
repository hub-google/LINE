document.addEventListener("input",ev=>{
 const el=ev.target;
 if(el?.id==="customer-party")syncBookingPartyInput(el.value);
 if(el?.id==="customer-book-name"||el?.id==="customer-book-phone"){
   if(el.id==="customer-book-name")bookingContactName=el.value;
   else bookingContactPhone=el.value;
   bookingContactDirty=true;bookingConfirmationKey="";unitConfirmKey="";
   const submit=document.querySelector('button[data-act="book"]');
   if(submit)submit.disabled=!chosenSlot||!bookingParty||!validBookingContact()||
     !menuChoiceReady(customer?.tenant?.menu_booking_mode||"DISABLED",bookingChosenItems,customer?.menu_items||[]);
 }
});
document.addEventListener("change",async ev=>{
 const el=ev.target;
 if(el.dataset.menuChoice){
   const flow=el.dataset.menuChoice;
   const list=flow==="booking"?bookingChosenItems:flow==="queue"?queueChosenItems:editChosenItems;
   const id=el.value;
   if(el.checked&&!list.includes(id))list.push(id);
   if(!el.checked){const index=list.indexOf(id);if(index>=0)list.splice(index,1);}
   if(flow==="booking"){chosenSlot="";serviceSlotPreview=null;unitConfirmKey="";if(!unitEnabled())void refreshServiceSlots();}
   render();return;
 }
 if(el.id==="rule-service"){
   const rule=(staff?.resourceContext?.service_rules||[]).find(x=>x.item_id===el.value);
   if($("rule-duration"))$("rule-duration").value=String(rule?.duration_minutes??staff?.tenant?.slot_minutes??30);
   if($("rule-buffer"))$("rule-buffer").value=String(rule?.buffer_minutes??0);
   if($("rule-resource"))$("rule-resource").value=rule?.resource_id||"";
   if($("rule-show-duration"))$("rule-show-duration").checked=rule?.show_duration_to_customer!==false;
   return;
 }
 if(el.id==="staff-history-days"){staffHistoryDays=Number(el.value);await load();return;}
 if(el.id==="analytics-days"){analyticsDays=Number(el.value);await load();return;}
 if(el.id==="calendar-status"){
   if(!["ALL","CONFIRMED","CHECKED_IN","COMPLETED","CANCELLED","NO_SHOW"].includes(el.value))return;
   calendarStatus=el.value;calendarPage=1;void loadBookingCalendar(1);return;
 }
 if(el.id==="customer-flag-picker"){customerFlagSelected=el.value;render();return;}
 if(el.id==="customer-day"){day=el.value;chosenSlot="";serviceSlotPreview=null;unitConfirmKey="";await load();return;}
 if(el.id==="unit-admin-date"){unitAdminDate=el.value;unitEditingSession="";await load();return;}
 if(el.id==="customer-unit"){unitChoice=el.value;unitSessionChoice="";unitConfirmKey="";render();return;}
 if(el.id==="unit-category"){unitCategory=el.value;unitChoice=availableUnits(customerTab)[0]?.id||"";unitSessionChoice="";unitConfirmKey="";render();return;}
 if(el.id==="unit-session"){unitSessionChoice=el.value;unitConfirmKey="";render();return;}
 if(el.id==="staff-unit-session"){unitStaffSession=el.value;render();return;}
 if(el.id==="staff-booking-unit-filter"){bookingUnitFilter=el.value;render();return;}
 if(el.id==="unit-admin-unit"){unitAdminUnit=el.value;return;}
 if(el.id==="customer-party"){syncBookingPartyInput(el.value);unitConfirmKey="";if(unitEnabled()&&customerTab==="reserve")render();return;}
 if(el.id==="customer-queue-party"){
  const n=Number(el.value);queuePartySize=Number.isInteger(n)&&n>=1&&n<=20?n:0;
  const button=document.querySelector('button[data-act="take"],button[data-act="unit-take"]');
  if(button)button.disabled=!queuePartySize||!menuChoiceReady(customer?.tenant?.menu_queue_mode||"DISABLED",queueChosenItems,customer?.menu_items||[]);
  return;
 }
 if(el.id==="edit-book-date"){editDate=el.value;editTime="";await fetchBookingEditSlots();return;}
 if(el.id==="edit-book-time"){editTime=el.value;render();return;}
 if(el.id==="edit-book-party"){editParty=Number(el.value);render();return;}
 if(el.dataset.deleteKind){
  if(busy)return;
  const kind=el.dataset.deleteKind,id=el.dataset.id,deleted=el.checked;
  if(!id||!["reservation","ticket"].includes(kind))return;
  if(deleted&&!confirm("確定刪除這筆"+(kind==="reservation"?"預約":"號碼牌")+"？\n顧客的預約或取號畫面將直接不顯示，且不會發送 LINE 通知。")){render();return;}
  await act(async()=>{
    const result=await rpc("so_staff_set_record_deleted",{p_slug:slug,p_kind:kind,p_id:id,p_deleted:deleted});
    lastStaffChange=null;
    return (result.changed?(deleted?"已刪除":"已恢復"):"無須變更")+
      (kind==="reservation"?"預約":"號碼牌")+"；不會發送 LINE 通知";
  });return;
 }
 if(el.dataset.statusKind){
  if(busy)return;
  const kind=el.dataset.statusKind, id=el.dataset.id, previous=el.dataset.previous, desired=el.value;
  if(!id||!previous||desired===previous)return;
  if(desired==="CANCELLED"&&!confirm("確定取消嗎？系統會通知顧客。")){render();return;}
  await act(async()=>{
   const unitRelated=unitEnabled()&&(kind==="ticket"?(unitRecords.tickets||[]).some(x=>x.id===id):(unitRecords.reservations||[]).some(x=>x.id===id));
   if(kind==="reservation"&&desired==="CHECKED_IN"&&unitConfig?.linked&&unitRelated){
     const result=await rpc("so_unit_checkin",{p_slug:slug,p_reservation_id:id});
     return "已報到並加入對應叫號隊列："+result.number;
   }
   const procedure=kind==="reservation"?"so_staff_set_reservation_status":unitRelated?"so_unit_set_ticket_status":"so_staff_set_ticket_status";
   const args=kind==="reservation"?
    {p_slug:slug,p_reservation_id:id,p_status:desired,p_expected_status:previous}:
    {p_slug:slug,p_ticket_id:id,p_status:desired,p_expected_status:previous};
   const result=await rpc(procedure,args);
   const label=kind==="ticket"?(staff?.tickets||[]).find(x=>x.id===id)?.number:
    (staff?.reservations||[]).find(x=>x.id===id)?.name;
   if(result.changed)lastStaffChange={kind,id,label:label||(kind==="ticket"?"號碼牌":"預約"),before:previous,after:desired,slug,day};
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

