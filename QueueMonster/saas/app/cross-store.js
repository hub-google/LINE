import {crossStoreState} from "./state/crossStoreState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";


import {rpc} from "./data-loading.js";
import {render} from "./staff-layout.js";
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
   '<p class="small">此頁不會自動更新資料；請按重新整理查看最新紀錄，或開啟商家的公開叫號看板。</p>';
}

export function crossRecords(){
 const bookings=crossStoreState.customerActivity?.reservations||[];
 const tickets=crossStoreState.customerActivity?.tickets||[];
 const errMessage=crossStoreState.customerActivityError?'<p class="alert">'+esc(crossStoreState.customerActivityError)+'</p>':"";
 const bookingHtml=bookings.length?bookings.slice(0,80).map(x=>
   '<article class="cross-record"><div class="cross-ticket-head"><strong>'+esc(x.shop_name)+'</strong>'+tag(x.status)+'</div>'+
   '<div>預約 '+esc(x.number||"—")+' ・ '+esc(x.day)+' '+esc(x.time)+' ・ '+esc(x.party)+' 位</div><div class="small">預約姓名：'+esc(x.name||'—')+' ・ 聯絡電話：'+esc(x.phone||'未提供')+'</div>'+
   '<div class="small">送出預約時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   selectedItemsHtml(x.selected_items)+
   '<div class="staff-actionbar">'+btn("查看／管理預約","open-cross-booking","secondary",
     'data-merchant="'+esc(x.slug)+'" data-id="'+esc(x.id)+'"')+'</div></article>'
 ).join(""):'<p class="muted">目前沒有預約紀錄。</p>';
 const ticketHtml=tickets.length?tickets.slice(0,80).map(x=>
   '<article class="cross-record"><div class="cross-ticket-head"><strong>'+esc(x.shop_name)+'</strong>'+tag(x.status)+'</div>'+
   '<strong>我的號碼：'+esc(x.number)+'</strong><div class="small">候位人數：'+esc(x.party||1)+' 人／組</div>'+
   '<div class="small">取號時間：'+esc(formatTaipeiCreated(x.created_at))+' ・ '+esc(x.party||1)+' 人／組</div>'+
   selectedItemsHtml(x.selected_items)+
   '<div class="staff-actionbar">'+btn("查看該店進度","open-cross-ticket","secondary",
     'data-merchant="'+esc(x.slug)+'" data-ticket="'+esc(x.id)+'"')+'</div></article>'
 ).join(""):'<p class="muted">目前沒有號碼紀錄。</p>';
 const orderHtml=orders.length?orders.slice(0,80).map(x=>
    '<article class="cross-record"><div class="cross-ticket-head"><strong>'+esc(x.shop_name)+'</strong><span>'+esc(x.status)+'</span></div>'+
    '<strong>訂單 '+esc(x.number)+'</strong><div>取餐：'+esc(x.pickup_at)+'</div>'+
    '<div class="small">'+esc((x.items||[]).map(i=>i.name+" × "+i.qty).join("、"))+' ・ NT$ '+esc(Number(x.total||0).toLocaleString("zh-TW"))+'</div>'+
    '<div class="staff-actionbar"><a class="btn secondary" href="'+esc(sharedUiState.route("customer",x.slug,"order"))+'">查看店家取餐進度</a></div></article>'
  ).join(""):'<p class="muted">目前沒有訂餐紀錄。</p>';
  return errMessage+box("我的跨店預約紀錄",bookingHtml)+box("我的跨店取號紀錄",ticketHtml)+box("我的跨店訂餐紀錄",orderHtml);
}
