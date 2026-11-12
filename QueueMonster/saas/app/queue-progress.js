import {customerState} from "./state/customerState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";



import {rpc} from "./data-loading.js";
import {render} from "./staff-layout.js";
import {btn,esc,formatTaipeiCreated,jsStatus} from "./shared-ui.js";

export function stopQueueRealtime(){
 if(queueState.queueRealtimeChannel){
   const ch=queueState.queueRealtimeChannel;queueState.queueRealtimeChannel=null;queueState.queueRealtimeTenant="";
   void lineState.supa.removeChannel(ch);
 }
}

export function queueTicketToDisplay(){
 const all=customerState.customer?.my_tickets||[];
 return queueState.progressTicketId||
   all.find(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status))?.id||
   all.find(x=>x.status==="PASSED")?.id||null;
}

export async function refreshQueueProgress(){
 if(routeState.view!=="customer"||routeState.customerTab!=="progress"||lineState.lineLinkStatus!=="linked"||queueState.queueLiveLoading)return;
 const shop=routeState.slug;
 queueState.queueLiveLoading=true;
 try{
  const ticket=queueTicketToDisplay();
  // The backend resolves the ticket's session; both queue modes use the same public RPC.
  const data=await rpc("so_queue_live",{p_slug:shop,p_ticket_id:ticket});
  if(routeState.view!=="customer"||routeState.customerTab!=="progress"||routeState.slug!==shop)return;
  queueState.queueLive=data;queueState.queueLiveShop=shop;queueState.queueLiveError="";
  queueState.queueLastSuccessAt=new Date().toISOString();queueState.queueLastSuccessShop=shop;
  const alertTicketId=data?.mine?.id||queueTicketToDisplay();
  if(alertTicketId){
    try{
      // Refresh only on a user-requested reload, including
      // preference changes made on the customer's other device.
      const pref=await rpc("so_customer_get_queue_near_alert",{p_ticket_id:alertTicketId});
      queueState.queueNearAlertSettings[alertTicketId]=[0,3,5].includes(pref.threshold)?pref.threshold:null;
    }catch(e){
      if(!Object.prototype.hasOwnProperty.call(queueState.queueNearAlertSettings,alertTicketId))
        queueState.queueNearAlertSettings[alertTicketId]=null;
    }
  }
  render();
 }catch(e){
  if(routeState.view==="customer"&&routeState.customerTab==="progress"&&routeState.slug===shop){
    queueState.queueLiveError="進度暫時無法同步，請點重新整理。";
    render();
  }
 }finally{queueState.queueLiveLoading=false;}
}

export function queueNearAlertControls(ticket,status){
 if(status!=="WAITING"||!ticket?.id)return "";
 const found=Object.prototype.hasOwnProperty.call(queueState.queueNearAlertSettings,ticket.id);
 if(!found)return '<p class="small">正在讀取 LINE 接近到號提醒設定…</p>';
 const current=queueState.queueNearAlertSettings[ticket.id];
 if(current===null)return '<p class="small">提醒設定暫時無法讀取，請重新整理進度。</p>';
 const options=[[0,"關閉提醒（預設）"],[3,"前方剩 3 組提醒"],[5,"前方剩 5 組提醒"]];
 return '<div class="staff-record" style="text-align:left;margin-top:12px;background:#f8fafc">'+
  '<label for="queue-near-alert-threshold">LINE 接近到號提醒</label>'+
  '<div class="flex"><select id="queue-near-alert-threshold" class="field" style="max-width:230px">'+
  options.map(x=>'<option value="'+x[0]+'" '+(current===x[0]?'selected':'')+'>'+esc(x[1])+'</option>').join("")+
  '</select>'+btn("儲存提醒設定","save-queue-near-alert","secondary",'data-id="'+esc(ticket.id)+'"')+'</div>'+
  '<p class="small">每張號碼最多提醒一次；送達取決於是否加入店家 LINE OA 好友及 LINE 訊息額度。此功能不會持續推播每次叫號變化。</p></div>';
}

export function queueProgressBoard(){
 const fresh=queueState.queueLiveShop===routeState.slug?queueState.queueLive:null;
 const lastSync=queueState.queueLastSuccessShop===routeState.slug?queueState.queueLastSuccessAt:"";
 const notLive=!!queueState.queueLiveError||navigator.onLine===false;
 const own=fresh?.mine||null;
 const fallbackTicket=(customerState.customer?.my_tickets||[]).find(x=>x.id===queueState.progressTicketId)||
   (customerState.customer?.my_tickets||[]).find(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
 const ownNumber=own?.number||fallbackTicket?.number||"—";
 const ownStatus=own?.status||fallbackTicket?.status||"";
 const ownParty=own?.party||fallbackTicket?.party||1;
 const syncMode=document.documentElement.dataset.storeLiveMode;
 let note=syncMode==="realtime"?"叫號變動會即時更新；也可手動重新整理核對。":syncMode==="api"?"叫號進度約每 5 秒更新一次；也可手動重新整理核對。":"正在建立進度同步，必要時請手動重新整理。";
 if(ownStatus==="CALLED")note="已叫到您的號碼，請依現場人員指示報到。";
 else if(ownStatus==="ARRIVED")note="門市已確認您到場，請依現場指示等待進場。";
  else if(ownStatus==="ADMITTED")note="門市已確認您進場，請依現場人員指示。";
  else if(ownStatus==="SERVING")note="您的號碼目前服務中。";
 else if(ownStatus==="COMPLETED")note="您的服務已完成。";
 else if(ownStatus==="CANCELLED")note="這張號碼已取消，不再參與候位。";
 else if(ownStatus==="PASSED")note="您的號碼已過號，如需協助請洽門市。";
  else if(ownStatus==="HOLD")note="您的候位已暫時保留，不會在保留期間被叫號；恢復後會依門市規則重新排序。";
 return '<div class="queue-board" aria-live="polite">'+
   '<div class="queue-board-lead">現在叫到</div>'+
    '<p class="small">我的候位人數：'+esc(ownParty)+' 人／組</p>'+
   '<div class="queue-board-current">'+esc(fresh?.current||"—")+'</div>'+
   '<div class="queue-board-sub">'+esc(fresh?.current?"請依現場叫號進度為準":"目前尚未開始叫號")+'</div>'+
   '<div class="queue-board-grid">'+
     '<div class="queue-board-stat"><span>我的號碼</span><strong>'+esc(ownNumber)+'</strong>'+
       (ownStatus?'<small>'+esc(jsStatus(ownStatus))+'</small>':"")+'</div>'+
     '<div class="queue-board-stat"><span>前面還有</span><strong>'+
       (own?.ahead===null||own?.ahead===undefined?"—":esc(own.ahead)+" 組")+
       '</strong><small>依實際候位與服務中計算</small></div>'+
   '</div>'+
   '<p class="queue-board-note">'+esc(note)+'</p>'+
   '<p class="small" role="status">'+
      (notLive?"<strong>最新進度無法確認：</strong>"+(navigator.onLine===false?"目前離線。":esc(queueState.queueLiveError))+"以下為最後取得的資料，請重新連線再確認。":
        (syncMode==="realtime"?"即時同步中；如需立即核對，可按重新整理。":syncMode==="api"?"每 5 秒備援更新中；如需立即核對，可按重新整理。":"目前顯示最近一次查詢結果；可按重新整理。"))+
      " 最後成功更新："+(lastSync?esc(formatTaipeiCreated(lastSync)):"尚未成功同步")+
      "（台灣時間）。"+'</p>'+
   queueNearAlertControls(own||fallbackTicket,ownStatus)+
   '<div class="staff-actionbar">'+btn("重新整理進度","queue-refresh","outline")+
      btn("返回歷史紀錄","cross-back","secondary")+
      (ownStatus==="WAITING"&&own?.id?btn("保留候位","hold-my-number","secondary",'data-id="'+esc(own.id)+'"'):"")+
      (ownStatus==="HOLD"&&own?.id?btn("恢復候位","resume-my-number","primary",'data-id="'+esc(own.id)+'"'):"")+
      (["WAITING","HOLD"].includes(ownStatus)&&own?.id?btn("取消排隊","cancel-my-number","outline",'data-id="'+esc(own.id)+'"'):"")+
   '</div></div>';
}
