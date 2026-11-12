import {crossStoreState} from "./state/crossStoreState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";


import {rpc} from "./data-loading.js";
import {render} from "./staff-layout.js";
import {pickupStatusLabel} from "./pickup-mode.js";
import {box,btn,esc,formatTaipeiCreated,selectedItemsHtml,tag} from "./shared-ui.js";

export function stopCrossQueueRealtime(){
 if(!crossStoreState.crossRealtimeChannel)return;
 const ch=crossStoreState.crossRealtimeChannel;crossStoreState.crossRealtimeChannel=null;crossStoreState.crossRealtimeKey="";
 void lineState.supa.removeChannel(ch);
}

// Keep the public call contract for other modules. All customer pages now
// update records only on first load or explicit user action; the public board
// is the sole screen permitted to hold a queue Realtime subscription.
export function syncCrossQueueRealtime(){
  stopCrossQueueRealtime();
}

export async function refreshCrossStoreOverview(){
 if(routeState.view!=="customer"||lineState.lineLinkStatus!=="linked"||crossStoreState.crossRefreshBusy)return;
 const currentSlug=routeState.slug;
 crossStoreState.crossRefreshBusy=true;
 try{
   const activity=await rpc("so_customer_cross_store_overview",{p_slug:currentSlug});
   if(routeState.view!=="customer"||routeState.slug!==currentSlug)return;
   crossStoreState.customerActivity=activity||{tickets:[],reservations:[]};crossStoreState.customerActivityError="";
   crossStoreState.crossLastSuccessAt=new Date().toISOString();crossStoreState.crossLastSuccessShop=currentSlug;
   render();syncCrossQueueRealtime();
 }catch(e){
   if(routeState.view==="customer"&&routeState.slug===currentSlug){
     crossStoreState.customerActivityError="跨店資料暫時無法同步，請重新整理。";
     render();
   }
 }finally{crossStoreState.crossRefreshBusy=false}
}

export function crossTicketCards(){
 const all=crossStoreState.customerActivity?.tickets||[];
 const lastCrossSync=crossStoreState.crossLastSuccessShop===routeState.slug?crossStoreState.crossLastSuccessAt:"";
 const crossStale=!!crossStoreState.customerActivityError||navigator.onLine===false;
 const active=all.filter(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
 const history=all.filter(x=>!["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
 const shown=crossStoreState.crossFilter==="active"?active:crossStoreState.crossFilter==="history"?history:all;
 const tabs=[["active","進行中",active.length],["history","已完成／過號",history.length],["all","全部紀錄",all.length]];
 return '<p class="muted">同一個 LINE 帳號在不同門市取得的號碼，統一顯示於此。各門市叫號進度互不影響。</p>'+
   '<p class="small" role="status">'+(crossStale?"跨店進度未即時同步，以下紀錄可能不是最新狀態。":"目前顯示上次取得的跨店紀錄。")+
    " 最後成功更新："+(lastCrossSync?esc(formatTaipeiCreated(lastCrossSync)):"尚未成功同步")+"（台灣時間）。"+'</p>'+
   '<div class="cross-tabs" role="group" aria-label="取號狀態">'+
   tabs.map(x=>'<button type="button" data-act="cross-filter" data-filter="'+x[0]+'" class="'+(crossStoreState.crossFilter===x[0]?'active':'')+'">'+x[1]+'（'+x[2]+'）</button>').join("")+'</div>'+
   (crossStoreState.customerActivityError?'<p class="alert">'+esc(crossStoreState.customerActivityError)+'</p>':"")+
   (shown.length?shown.slice(0,crossStoreState.crossPageSize).map(x=>{
     const live=["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status);
     const ahead=x.ahead===null||x.ahead===undefined?"—":x.ahead+" 組";
     return '<article class="cross-ticket">'+
       '<div class="cross-ticket-head"><strong>'+esc(x.shop_name)+'</strong>'+tag(x.status)+'</div>'+
       '<div class="cross-ticket-meta">取號時間：'+esc(formatTaipeiCreated(x.created_at))+' ・ '+esc(x.party||1)+' 人／組</div>'+
       '<div class="cross-ticket-stats">'+
         '<div class="cross-ticket-stat"><span>我的號碼</span><strong>'+esc(x.number||"—")+'</strong></div>'+
         '<div class="cross-ticket-stat"><span>目前叫號</span><strong>'+esc(x.current||"—")+'</strong></div>'+
         '<div class="cross-ticket-stat"><span>前方等待</span><strong>'+esc(live?ahead:"—")+'</strong></div>'+
       '</div>'+
       '<div class="staff-actionbar">'+
       btn("查看該店詳細進度","open-cross-ticket","secondary",'data-merchant="'+esc(x.slug)+'" data-ticket="'+esc(x.id)+'"')+
       '</div></article>';
   }).join(""):'<p class="muted">'+(crossStoreState.crossFilter==="active"?"目前沒有進行中的取號。":"此分類目前沒有紀錄。")+'</p>')+
   (shown.length>crossStoreState.crossPageSize?'<div class="staff-actionbar">'+btn("顯示更多（剩餘 "+(shown.length-crossStoreState.crossPageSize)+" 筆）","cross-more","outline")+'</div>':"")+
   '<div class="staff-actionbar">'+btn("手動更新跨店進度","cross-refresh","outline")+
    btn("查看目前門市叫號","cross-current-store","outline")+'</div>'+
   '<p class="small">此頁不會自動更新資料；請按重新整理查看最新紀錄，或開啟商家的叫號看板。</p>';
}

export function crossRecords(){
 const bookings=crossStoreState.customerActivity?.reservations||[];
 const tickets=crossStoreState.customerActivity?.tickets||[];
 const orders=crossStoreState.customerActivity?.orders||[];
 const errMessage=crossStoreState.customerActivityError?
   '<p class="alert">'+esc(crossStoreState.customerActivityError)+'</p>':"";
 const item=(x,type,label,meta,action,idAttr)=>{
  const status=type==="order"?pickupStatusLabel(x.status):tag(x.status);
  const right=type==="order"?'<span class="customer-history-state">'+esc(status)+'</span>':status;
  return '<button type="button" class="customer-history-entry" data-act="'+action+
    '" data-merchant="'+esc(x.slug)+'" '+idAttr+'="'+esc(x.id)+'"'+
    ' aria-label="開啟 '+esc(x.shop_name)+' 的'+esc(label)+'詳情">'+
    '<span class="customer-history-entry-top"><strong>'+esc(x.shop_name||"店家")+'</strong>'+right+'</span>'+
    '<span class="customer-history-entry-number">'+esc(label)+'</span>'+
    '<span class="customer-history-entry-meta">'+meta+'</span>'+
    '<span class="customer-history-entry-open">點開查看這家店的專屬'+esc(type==="ticket"?"叫號進度":type==="reservation"?"預約資訊":"取餐進度")+' <span aria-hidden="true">›</span></span>'+
    '</button>';
 };
 const bookingHtml=bookings.length?bookings.slice(0,80).map(x=>
   item(x,"reservation","預約 "+(x.number||"—"),
     '預約時間：'+esc(x.day)+' '+esc(x.time)+' ・ '+esc(x.party||1)+' 位',
     "open-cross-booking","data-id")).join(""):'<p class="muted">目前沒有預約紀錄。</p>';
 const ticketHtml=tickets.length?tickets.slice(0,80).map(x=>
   item(x,"ticket","我的號碼 "+(x.number||"—"),
     '取號：'+esc(formatTaipeiCreated(x.created_at))+' ・ '+esc(x.party||1)+' 人／組',
     "open-cross-ticket","data-ticket")).join(""):'<p class="muted">目前沒有取號紀錄。</p>';
 const orderHtml=orders.length?orders.slice(0,80).map(x=>
   item(x,"order","訂單 "+(x.number||"—"),
     '取餐：'+esc(x.pickup_at)+' ・ NT$ '+esc(Number(x.total||0).toLocaleString("zh-TW")),
     "open-cross-order","data-id")).join(""):'<p class="muted">目前沒有訂餐紀錄。</p>';
 const stale=crossStoreState.customerActivityError?'<p class="small">目前無法確認最新紀錄；請重新整理再試。</p>':"";
 return '<div class="customer-history-intro"><strong>我的歷史紀錄</strong>'+
   '<p class="small">每間店、每筆預約與訂單都可以直接點開。開啟後只顯示該筆紀錄，不再把不同店家的叫號資訊放在一起。</p></div>'+
   errMessage+stale+
   box("預約紀錄（"+bookings.length+"）",'<div class="customer-history-grid">'+bookingHtml+'</div>')+
   box("叫號紀錄（"+tickets.length+"）",'<div class="customer-history-grid">'+ticketHtml+'</div>')+
   box("訂餐紀錄（"+orders.length+"）",'<div class="customer-history-grid">'+orderHtml+'</div>')+
   '<div class="staff-actionbar">'+btn("重新整理歷史紀錄","cross-refresh","outline")+'</div>';
}
