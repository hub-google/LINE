import {bookingState} from "../state/bookingState.js";
import {customerState} from "../state/customerState.js";
import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";


import {render} from "./../staff-layout.js";
import {act,clearCustomerBookingRequest,customerBookingRequestId,rpc,val} from "./../data-loading.js";
import {availableForParty,bookingConfirmationFingerprint,currentBookingSlots,normalizeBookingPhone,validBookingContact} from "./../customer-booking.js";
import {jsStatus,menuChoiceReady,showActionFeedback} from "./../shared-ui.js";
import {customerNoticeSuffix,sendLineNotice} from "./../line-session.js";

export async function handleBookingSubmit(ev,b,a,id){
if(a==="book-back"){bookingState.bookingConfirmationKey="";render();return true;}
 if(a==="book"&&customerState.customer?.booking_confirmation_required!==false){
  const party=Number(val("customer-party"));
  const slot=currentBookingSlots().find(x=>x.time===bookingState.chosenSlot);
  if(!Number.isInteger(party)||party<1||party>20||!bookingState.chosenSlot||!availableForParty(slot,party)||
     !validBookingContact()||!menuChoiceReady(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",bookingState.bookingChosenItems,customerState.customer?.menu_items||[])){
    showActionFeedback("請先選擇有效人數、時段與服務項目。","warning");return true;
  }
  bookingState.bookingParty=party;bookingState.bookingConfirmationKey=bookingConfirmationFingerprint();render();return true;
 }
 if(a==="book-final"&&(customerState.customer?.booking_confirmation_required===false||
    bookingState.bookingConfirmationKey!==bookingConfirmationFingerprint())){
    bookingState.bookingConfirmationKey="";showActionFeedback("預約內容已變更，請重新確認。","warning");render();return true;
 }
 if(a==="book"||a==="book-final"){await act(async()=>{
  if(lineState.lineLinkStatus!=="linked")throw Error("請先完成 LINE 授權");
  if(!bookingState.chosenSlot)throw Error("請先選擇時段");
  const party=bookingState.bookingParty,time=bookingState.chosenSlot;
  if(!Number.isInteger(party)||party<1||party>20)throw Error("請輸入 1～20 位的有效預約人數。");
  if(!validBookingContact())throw Error("請填寫預約姓名及有效的台灣手機號碼。");
  const selected=currentBookingSlots().find(x=>x.time===time);
  if(!availableForParty(selected,party))throw Error("此時段已沒有足夠名額，請重新選擇時間。");
  const items=bookingState.bookingChosenItems.slice();
  const requestId=customerBookingRequestId({merchant:routeState.slug,date:routeState.day,time,party,name:bookingState.bookingContactName.trim(),phone:normalizeBookingPhone(bookingState.bookingContactPhone),items});
  const result=await rpc("so_book_with_contact_once",{p_slug:routeState.slug,p_date:routeState.day,p_time:time,p_name:bookingState.bookingContactName.trim(),p_phone:normalizeBookingPhone(bookingState.bookingContactPhone),p_party:party,p_items:items,p_request_id:requestId});
  // Clear only AFTER the database has acknowledged this ID. A lost response
  // leaves the same ID ready for a safe retry.
  clearCustomerBookingRequest(requestId);
  bookingState.chosenSlot="";bookingState.bookingChosenItems=[];bookingState.bookingConfirmationKey="";routeState.customerTab="mine";
  if(result.status!=="CONFIRMED")return "先前送出的預約已找到，最新狀態："+jsStatus(result.status)+"。請到我的預約確認。";
  if(result.replayed)return "已查到先前成立的預約："+routeState.day+" "+time+"，"+party+" 位；系統沒有重複建立第二筆。";
  const notice=await sendLineNotice("notify-reservation",{reservationId:result.id});
  return "預約已成立："+routeState.day+" "+time+"，"+party+" 位"+customerNoticeSuffix(notice);
 });return true;}
return false;
}
