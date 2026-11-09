import {crossStoreState} from "../state/crossStoreState.js";
import {customerState} from "../state/customerState.js";
import {lineState} from "../state/lineState.js";
import {queueState} from "../state/queueState.js";
import {routeState} from "../state/routeState.js";
import {sharedUiState} from "../state/sharedUiState.js";



import {act,rpc,val} from "./../data-loading.js";
import {customerNoticeSuffix,sendLineNotice} from "./../line-session.js";
import {render} from "./../staff-layout.js";
import {refreshCrossStoreOverview,stopCrossQueueRealtime,syncCrossQueueRealtime} from "./../cross-store.js";
import {refreshQueueProgress,stopQueueRealtime} from "./../queue-progress.js";
import {isSafeMerchant} from "./../route-state.js";
import {showActionFeedback} from "./../shared-ui.js";

export async function handleCrossStoreActions(ev,b,a,id){
if(a==="take"){await act(async()=>{
  if(customerState.customer?.queue_session?.code==="REST")throw Error("門市目前休場，暫停新取號");
  if(lineState.lineLinkStatus!=="linked")throw Error("請先完成 LINE 授權");
  const party=Number(val("customer-queue-party"));
  if(!Number.isInteger(party)||party<1||party>20)throw Error("請輸入 1～20 人的有效候位人數。");
  queueState.queuePartySize=party;
  const result=await rpc("so_take_number_with_party",{p_slug:routeState.slug,p_name:lineState.lineDisplayName,p_items:queueState.queueChosenItems.slice(),p_party_size:party});
  queueState.queueChosenItems=[];
  queueState.progressTicketId=result.id;crossStoreState.crossCurrentStore=false;routeState.customerTab="progress";queueState.queueLive=null;queueState.queueLiveShop="";
  const notice=await sendLineNotice("notify-ticket",{ticketId:result.id});
  return "取號成功！您的號碼是 "+result.number+"（"+party+" 人／組）"+customerNoticeSuffix(notice);
 });return true;}
 if(a==="cross-filter"){
   crossStoreState.crossFilter=b.dataset.filter||"active";crossStoreState.crossPageSize=12;render();return true;
 }
 if(a==="cross-more"){crossStoreState.crossPageSize+=12;render();return true;}
 if(a==="cross-refresh"){void refreshCrossStoreOverview();return true;}
 if(a==="cross-current-store"){
   crossStoreState.crossCurrentStore=true;queueState.queueLive=null;queueState.queueLiveShop="";
   stopCrossQueueRealtime();render();void refreshQueueProgress();return true;
 }
 if(a==="cross-back"){
   queueState.progressTicketId="";crossStoreState.crossCurrentStore=false;queueState.queueLive=null;queueState.queueLiveShop="";stopQueueRealtime();
   const u=new URL(location.href);u.searchParams.delete("ticket");
   history.replaceState(null,"",u.pathname+u.search+u.hash);
   render();syncCrossQueueRealtime();return true;
 }
 if(a==="open-cross-ticket"){
   const merchant=b.dataset.merchant,ticket=b.dataset.ticket;
   if(!isSafeMerchant(merchant)||!/^[0-9a-f-]{36}$/i.test(ticket||"")){
     showActionFeedback("號碼資料不正確，請重新整理","error");return true;
   }
   if(merchant===routeState.slug){
     queueState.progressTicketId=ticket;crossStoreState.crossCurrentStore=false;routeState.customerTab="progress";stopCrossQueueRealtime();
     const u=new URL(location.href);u.searchParams.set("merchant",routeState.slug);
     u.searchParams.set("tab","progress");u.searchParams.set("ticket",ticket);
     history.replaceState(null,"",u.pathname+u.search+u.hash);
     queueState.queueLive=null;queueState.queueLiveShop="";render();void refreshQueueProgress();
   }else{
     location.assign(sharedUiState.route("customer",merchant,"progress")+"&ticket="+encodeURIComponent(ticket));
   }
   return true;
 }
 if(a==="open-cross-booking"){
   const merchant=b.dataset.merchant,booking=b.dataset.id;
   if(!isSafeMerchant(merchant)||!/^[0-9a-f-]{36}$/i.test(booking||"")){
     showActionFeedback("預約資料不正確，請重新整理","error");return true;
   }
   location.assign(sharedUiState.route("customer",merchant,"mine")+"&manage=reservation&item="+encodeURIComponent(booking)+"&mode=view");
   return true;
 }
return false;
}
