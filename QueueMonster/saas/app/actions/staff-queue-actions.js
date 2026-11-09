import {feedbackState} from "../state/feedbackState.js";
import {routeState} from "../state/routeState.js";
import {sharedUiState} from "../state/sharedUiState.js";
import {staffState} from "../state/staffState.js";


import {jsStatus,showActionFeedback} from "./../shared-ui.js";
import {render} from "./../staff-layout.js";
import {act,rpc} from "./../data-loading.js";
import {customerNoticeSuffix,notifyLineCalled,sendLineNotice} from "./../line-session.js";

export async function handleStaffQueueActions(ev,b,a,id){
if(a==="undo-staff"){
  const previous=sharedUiState.lastStaffChange;
  if(!previous||previous.slug!==routeState.slug){feedbackState.err="沒有可還原的操作";showActionFeedback(feedbackState.err,"error");render();return true;}
  await act(async()=>{
    const proc=previous.kind==="reservation"?"so_staff_set_reservation_status":"so_staff_set_ticket_status";
    const args=previous.kind==="reservation"?
      {p_slug:routeState.slug,p_reservation_id:previous.id,p_status:previous.before,p_expected_status:previous.after}:
      {p_slug:routeState.slug,p_ticket_id:previous.id,p_status:previous.before,p_expected_status:previous.after};
    const result=await rpc(proc,args);
    if(result.changed)sharedUiState.lastStaffChange=null;
    if(result.changed&&previous.kind==="reservation"&&previous.after==="CANCELLED"&&previous.before==="CONFIRMED"){
      const notice=await sendLineNotice("notify-reservation-restored",{reservationId:previous.id});
      return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；"+notice;
    }
    if(result.changed&&previous.kind==="ticket"&&previous.after==="CANCELLED"&&["WAITING","HOLD"].includes(previous.before)){
      const notice=await sendLineNotice("notify-ticket-restored",{ticketId:previous.id,eventId:result.line_restore_event_id});
      return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；"+notice;
    }
    return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；不會重新發送 LINE 通知";
  });return true;
 }

 if(a==="call-selected"){
  if(!id||!staffState.staff||!["OWNER","MANAGER","PLATFORM"].includes(staffState.staff.role))return true;
  const reason=window.prompt("指定叫號原因（必填，2～200 字，將保留操作紀錄）：","");
  if(reason===null)return true;
  const why=reason.trim();
  if(why.length<2||why.length>200||/[\u0000-\u001f\u007f]/.test(why)){
    showActionFeedback("請輸入 2～200 字的指定叫號原因，不可包含控制字元。","error");return true;
  }
  await act(async()=>{
    const result=await rpc("so_staff_call_selected",{p_slug:routeState.slug,p_ticket_id:id,p_reason:why});
    if(result.ticket_id&&result.number)sharedUiState.lastStaffChange={kind:"ticket",id:result.ticket_id,label:result.number,before:"WAITING",after:"CALLED",slug:routeState.slug,day:routeState.day};
    const notice=await notifyLineCalled(result.number,result.ticket_id,result.line_call_event_id);
    return "已指定叫號 "+result.number+"；"+notice;
  });return true;
 }
 if(["call","recall","start","complete","pass","return","cancel","checkin","no-show","cancel-book-staff"].includes(a)){
 if(["cancel","no-show","cancel-book-staff"].includes(a)&&!confirm("確定執行此操作？"))return true;
 const x=a==="no-show"?"no_show":a==="cancel-book-staff"?"cancel_booking":a;
 await act(async()=>{
  const nextBefore=x==="call"?(staffState.staff?.tickets||[]).find(k=>k.status==="WAITING"):null;
  const result=await rpc("so_staff_action",{p_slug:routeState.slug,p_action:x,p_ticket_id:["call","checkin","no_show","cancel_booking"].includes(x)?null:id,p_reservation_id:["checkin","no_show","cancel_booking"].includes(x)?id:null});
  if(x==="call"&&result.number&&nextBefore)sharedUiState.lastStaffChange={kind:"ticket",id:nextBefore.id,label:result.number,before:"WAITING",after:"CALLED",slug:routeState.slug,day:routeState.day};
  if((x==="call"||x==="recall")&&result.number){
    const notice=await notifyLineCalled(result.number,result.ticket_id,result.line_call_event_id);
    return (x==="call"?"已叫號 ":"已重新呼叫 ")+result.number+"；"+notice;
  }
  let notice="";
  if(x==="cancel"&&result.ticket_id)notice=await sendLineNotice("notify-ticket-cancel",{ticketId:result.ticket_id});
  if(x==="cancel_booking"&&id)notice=await sendLineNotice("notify-reservation-cancel",{reservationId:id});
  return "已完成「"+({checkin:"到店報到",start:"開始服務",complete:"完成服務",pass:"標記過號",return:"回到候位",cancel:"取消號碼",no_show:"預約未到",cancel_booking:"取消預約"}[x]||jsStatus(x))+"」"+(result.number?"："+result.number:"")+customerNoticeSuffix(notice);
 });return true;
 }
return false;
}
