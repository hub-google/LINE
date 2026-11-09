import {customerState} from "../state/customerState.js";
import {lineState} from "../state/lineState.js";
import {queueState} from "../state/queueState.js";
import {routeState} from "../state/routeState.js";


import {act,rpc,val} from "./../data-loading.js";
import {showActionFeedback} from "./../shared-ui.js";
import {refreshQueueProgress,stopQueueRealtime} from "./../queue-progress.js";
import {render} from "./../staff-layout.js";
import {bridgeConfig,connectLineSession,customerNoticeSuffix,recoverLineLogin,sendLineNotice} from "./../line-session.js";
import {finishManageLink} from "./../booking-edit.js";

export async function handleQueueLineActions(ev,b,a,id){
if(a==="save-queue-near-alert"){
  if(!id||!Object.prototype.hasOwnProperty.call(queueState.queueNearAlertSettings,id))return true;
  const threshold=Number(val("queue-near-alert-threshold"));
  if(![0,3,5].includes(threshold)){
    showActionFeedback("提醒設定只能選擇關閉、前方 3 組或前方 5 組。","error");return true;
  }
  await act(async()=>{
    const result=await rpc("so_customer_set_queue_near_alert",{p_ticket_id:id,p_threshold:threshold});
    queueState.queueNearAlertSettings[id]=result.threshold;
    return threshold===0?"已關閉這張號碼的接近到號 LINE 提醒。":
      "已設定前方剩 "+threshold+" 組時提醒；每張票最多提醒一次。";
  });
  void refreshQueueProgress();return true;
 }
 if(a==="queue-refresh"){void refreshQueueProgress();return true;}
 if(a==="queue-records"){routeState.customerTab="mine";stopQueueRealtime();render();return true;}
 if(a==="line-check-friendship"){await act(async()=>{
  await connectLineSession(true);
  if(lineState.lineLinkStatus!=="linked")throw Error("LINE 身分連結失敗："+(lineState.lineConnectError||"請重新授權"));
  return lineState.lineOaRecipient==="REACHABLE"?
    "已確認：平台官方帳號可以辨識這位 LINE 使用者（不代表已收到 PUSH）":
    lineState.lineOaRecipient==="NOT_REACHABLE"?
    "LINE 官方帳號無法辨識此顧客，請先加入畫面上的官方帳號，再重新檢查":
    "LINE 官方帳號查詢失敗，請確認 LINE 官方帳號與 Login 頻道設定";
 });return true;}
 if(a==="line-connect"||a==="line-reauth"){
   await act(async()=>{
     const cfg=await bridgeConfig();
     if(!cfg.liffId)throw Error("LINE LIFF 尚未配置");
     // A failed OAuth callback must not be processed twice.
     recoverLineLogin(true);
     return "正在開啟 LINE 登入…";
   });return true;
  }
 if(a==="hold-my-number"||a==="resume-my-number"){
   const resume=a==="resume-my-number";
   if(!id||!confirm(resume?"確定恢復候位？順位會依門市設定重新計算。":"確定保留候位？保留期間不會被叫號，且恢復可能返回隊尾。"))return true;
   await act(async()=>{
     await rpc("so_customer_hold_ticket",{p_ticket_id:id,p_resume:resume});
     return resume?"已恢復候位；最新前方組數請以即時進度為準。":"號碼已保留，請在期限內恢復候位。";
   });
   queueState.queueLive=null;queueState.queueLiveShop="";void refreshQueueProgress();return true;
  }
  if(a==="cancel-my-number"){
  if(!confirm("確定取消排隊號碼嗎？"))return true;
  await act(async()=>{
    const ticket=(customerState.customer?.my_tickets||[]).find(x=>x.id===id);
    await rpc("so_cancel_number",{p_id:id});
    finishManageLink();
    const notice=await sendLineNotice("notify-ticket-cancel",{ticketId:id});
    return "已取消排隊"+(ticket?.number?"："+ticket.number:"")+customerNoticeSuffix(notice);
  });return true;
}
return false;
}
