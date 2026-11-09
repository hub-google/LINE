function stopCrossQueueRealtime(){
 if(!crossRealtimeChannel)return;
 const ch=crossRealtimeChannel;crossRealtimeChannel=null;crossRealtimeKey="";
 void supa.removeChannel(ch);
}
function syncCrossQueueRealtime(){
 if(view!=="customer"||customerTab!=="progress"||(progressTicketId||crossCurrentStore)||lineLinkStatus!=="linked"){
   stopCrossQueueRealtime();return;
 }
 const ids=[...new Set((customerActivity?.tickets||[])
   .filter(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status))
   .map(x=>x.tenant_id).filter(x=>/^[0-9a-f-]{36}$/i.test(x||"")))].sort().slice(0,20);
 const nextKey=ids.join(",");
 if(nextKey===crossRealtimeKey)return;
 stopCrossQueueRealtime();
 if(!ids.length)return;
 crossRealtimeKey=nextKey;
 const ch=supa.channel("customer-cross-store-queues");
 for(const id of ids){
   ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"so_queue_displays",
      filter:"tenant_id=eq."+id},()=>{void refreshCrossStoreOverview();});
 }
 crossRealtimeChannel=ch.subscribe();
}
async function refreshCrossStoreOverview(){
 if(view!=="customer"||lineLinkStatus!=="linked"||crossRefreshBusy)return;
 const currentSlug=slug;
 crossRefreshBusy=true;
 try{
   const activity=await rpc("so_customer_cross_store_overview",{p_slug:currentSlug});
   if(view!=="customer"||slug!==currentSlug)return;
   customerActivity=activity||{tickets:[],reservations:[]};customerActivityError="";
   crossLastSuccessAt=new Date().toISOString();crossLastSuccessShop=currentSlug;
   render();syncCrossQueueRealtime();
 }catch(e){
   if(view==="customer"&&slug===currentSlug){
     customerActivityError="跨店資料暫時無法同步，請重新整理。";
     render();
   }
 }finally{crossRefreshBusy=false}
}
function crossTicketCards(){
 const all=customerActivity?.tickets||[];
 const lastCrossSync=crossLastSuccessShop===slug?crossLastSuccessAt:"";
 const crossStale=!!customerActivityError||navigator.onLine===false;
 const active=all.filter(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
 const history=all.filter(x=>!["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
 const shown=crossFilter==="active"?active:crossFilter==="history"?history:all;
 const tabs=[["active","進行中",active.length],["history","已完成／過號",history.length],["all","全部紀錄",all.length]];
 return '<p class="muted">同一個 LINE 帳號在不同門市取得的號碼，統一顯示於此。各門市叫號進度互不影響。</p>'+
   '<p class="small" role="status">'+(crossStale?"跨店進度未即時同步，以下紀錄可能不是最新狀態。":"跨店紀錄已同步。")+
    " 最後成功更新："+(lastCrossSync?esc(formatTaipeiCreated(lastCrossSync)):"尚未成功同步")+"（台灣時間）。"+'</p>'+
   '<div class="cross-tabs" role="group" aria-label="取號狀態">'+
   tabs.map(x=>'<button type="button" data-act="cross-filter" data-filter="'+x[0]+'" class="'+(crossFilter===x[0]?'active':'')+'">'+x[1]+'（'+x[2]+'）</button>').join("")+'</div>'+
   (customerActivityError?'<p class="alert">'+esc(customerActivityError)+'</p>':"")+
   (shown.length?shown.slice(0,crossPageSize).map(x=>{
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
   }).join(""):'<p class="muted">'+(crossFilter==="active"?"目前沒有進行中的取號。":"此分類目前沒有紀錄。")+'</p>')+
   (shown.length>crossPageSize?'<div class="staff-actionbar">'+btn("顯示更多（剩餘 "+(shown.length-crossPageSize)+" 筆）","cross-more","outline")+'</div>':"")+
   '<div class="staff-actionbar">'+btn("手動更新跨店進度","cross-refresh","outline")+
    btn("查看目前門市叫號","cross-current-store","outline")+'</div>'+
   '<p class="small">進度會在頁面開啟期間更新；進入單店後可查看該店的即時叫號。</p>';
}
function crossRecords(){
 const bookings=customerActivity?.reservations||[];
 const tickets=customerActivity?.tickets||[];
 const errMessage=customerActivityError?'<p class="alert">'+esc(customerActivityError)+'</p>':"";
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
 return errMessage+box("我的跨店預約紀錄",bookingHtml)+box("我的跨店取號紀錄",ticketHtml);
}

