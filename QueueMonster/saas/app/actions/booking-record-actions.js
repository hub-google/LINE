import {bookingState} from "../state/bookingState.js";
import {customerState} from "../state/customerState.js";
import {routeState} from "../state/routeState.js";

import {btn,esc,field,showActionFeedback} from "./../shared-ui.js";
import {act,rpc,val} from "./../data-loading.js";
import {normalizeBookingPhone} from "./../customer-booking.js";
import {customerNoticeSuffix,sendLineNotice,lineReplyHandoff} from "./../line-session.js";
import {downloadReservationIcs} from "./../calendar-export.js";
import {openBookingReceipt} from "./../customer-records.js";
import {beginBookingEdit,finishManageLink} from "./../booking-edit.js";
import {render} from "./../staff-layout.js";

export async function handleBookingRecordActions(ev,b,a,id){
if(a==="booking-line-reply"){
 const booking=(customerState.customer?.my_reservations||[]).find(x=>x.id===id&&x.status==="CONFIRMED");
 if(!booking)return true;
 await act(async()=>{
  const handoff=await lineReplyHandoff("reservation",id);
  location.assign(handoff.oaMessageUrl);
  return "正在開啟 LINE 聊天室；請按傳送取得預約確認卡";
 });return true;
}
if(a==="edit-book-contact"){
   const b=(customerState.customer?.my_reservations||[]).find(x=>x.id===id);
   if(!b||b.status!=="CONFIRMED")return true;
   document.getElementById("booking-contact-overlay")?.remove();
   document.body.insertAdjacentHTML("beforeend",'<div id="booking-contact-overlay" class="receipt-backdrop" role="dialog" aria-modal="true" aria-label="修改預約聯絡資料"><article class="receipt-card"><h2>修改預約聯絡資料</h2><p>預約 '+esc(b.number||"")+'</p>'+
     field("預約姓名","contact-edit-name",b.name||"","text",'maxlength="80" required')+
     field("聯絡手機","contact-edit-phone",b.phone||"","tel",'inputmode="tel" required')+
     '<p class="small">修改後會更新店家後台，並向您發送新的 LINE 預約通知。</p><div class="receipt-actions">'+
     btn("儲存修改","save-book-contact","primary",'data-id="'+esc(b.id)+'"')+
     btn("取消","close-book-contact","outline")+'</div></article></div>');
   routeState.$("contact-edit-name")?.focus();return true;
 }
 if(a==="close-book-contact"){document.getElementById("booking-contact-overlay")?.remove();return true;}
 if(a==="save-book-contact"){
   const name=val("contact-edit-name"),phone=normalizeBookingPhone(val("contact-edit-phone"));
   if(!name||name.length>80||/[\r\n\u0000-\u001f]/.test(name)||!/^09\d{8}$/.test(phone)){
     showActionFeedback("請填寫有效的預約姓名與台灣手機號碼","error");return true;
   }
   await act(async()=>{
     const result=await rpc("so_update_booking_contact",{p_slug:routeState.slug,p_booking_id:id,p_name:name,p_phone:phone});
     document.getElementById("booking-contact-overlay")?.remove();
     bookingState.bookingContactName=name;bookingState.bookingContactPhone=phone;bookingState.bookingContactDirty=false;
     if(!result.changed)return "預約聯絡資料沒有變更";
     const notice=await sendLineNotice("notify-reservation-updated",{reservationId:id});
     return "預約姓名和電話已更新；"+notice;
   });return true;
 }
 if(a==="booking-ics"){downloadReservationIcs(id);return true;}
 if(a==="booking-receipt"){openBookingReceipt(id);return true;}
 if(a==="receipt-close"){document.getElementById("booking-receipt-overlay")?.remove();return true;}
 if(a==="receipt-print"){window.print();return true;}
 if(a==="edit-book"){await beginBookingEdit(id);return true;}
 if(a==="close-book-edit"){bookingState.editingBookingId="";finishManageLink();render();return true;}
 if(a==="save-book-edit"){
  const bookingId=bookingState.editingBookingId, targetDate=val("edit-book-date");
  const targetTime=val("edit-book-time"), party=Number(val("edit-book-party"));
  if(!bookingId||!targetDate||!targetTime||!Number.isInteger(party)||party<1||party>20){
    showActionFeedback("請確認預約日期、時間及人數","error");return true;
  }
  const record=(customerState.customer?.my_reservations||[]).find(x=>x.id===bookingId);
  const sessionMode=!!record?.session_id;
  const targetSession=sessionMode?(bookingState.editSlots||[]).find(x=>x.id===targetTime):null;
  if(sessionMode&&!targetSession){showActionFeedback("請選擇有效的預約場次","error");return true;}
  await act(async()=>{
    const result=await rpc(sessionMode?"so_customer_edit_session_booking":"so_customer_edit_booking_with_items",
      sessionMode?{p_slug:routeState.slug,p_booking_id:bookingId,p_session_id:targetTime,p_party:party,p_items:bookingState.editChosenItems.slice()}:
       {p_slug:routeState.slug,p_booking_id:bookingId,p_date:targetDate,p_time:targetTime,p_party:party,p_items:bookingState.editChosenItems.slice()});
    bookingState.editingBookingId="";bookingState.editSlots=null;bookingState.editChosenItems=[];finishManageLink();
    if(!result.changed)return "預約資料沒有變更";
    const notice=await sendLineNotice("notify-reservation-updated",{reservationId:bookingId});
    return "預約已更新："+targetDate+" "+(sessionMode?targetSession.label:targetTime)+"，"+party+" 位"+customerNoticeSuffix(notice);
  });return true;
 }
 if(a==="cancel-my-book"){
  if(!confirm("確定取消這筆預約嗎？取消後將無法直接復原。"))return true;
  await act(async()=>{
    await rpc("so_cancel_booking",{p_id:id});
    if(bookingState.editingBookingId===id)bookingState.editingBookingId="";
    finishManageLink();
    const notice=await sendLineNotice("notify-reservation-cancel",{reservationId:id});
    return "預約已取消"+customerNoticeSuffix(notice);
  });return true;
}
return false;
}
