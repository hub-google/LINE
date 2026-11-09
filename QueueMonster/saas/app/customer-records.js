import {bookingState} from "./state/bookingState.js";
import {customerState} from "./state/customerState.js";
import {lineState} from "./state/lineState.js";
import {routeState} from "./state/routeState.js";


import {btn,esc,formatTaipeiCreated,jsStatus,selectedItemsHtml,showActionFeedback,tag} from "./shared-ui.js";
import {editBookingForm} from "./booking-edit.js";

export function renderBookings(items,allowCancel){
 if(!items.length)return '<p class="muted">目前沒有預約紀錄。</p>';
 return items.map(x=>{
  const focused=bookingState.manageKind==="reservation"&&bookingState.manageItem===x.id;
  const editable=allowCancel&&x.status==="CONFIRMED";
  const buttons='<div class="staff-actionbar">'+
   btn("查看／列印預約憑證","booking-receipt","outline",'data-id="'+esc(x.id)+'"')+
   (["CONFIRMED","CHECKED_IN"].includes(x.status)?btn("加入行事曆（ICS）","booking-ics","outline",'data-id="'+esc(x.id)+'"'):"")+
   (editable?btn("修改姓名／電話","edit-book-contact","secondary",'data-id="'+esc(x.id)+'"')+(x.session_id?'':btn("編輯預約","edit-book","secondary",'data-id="'+esc(x.id)+'"'))+
   btn(focused&&bookingState.manageMode==="cancel"?"確認取消預約":"取消預約","cancel-my-book","outline",'data-id="'+esc(x.id)+'"'):"")+'</div>';
  return '<article class="staff-record" style="'+(focused?'border:2px solid #0d9488;':'')+'">'+
   '<div class="staff-record-head"><div><strong>'+'預約 '+esc(x.number||"—")+' '+esc(x.day)+' '+esc(x.time)+'</strong>'+
   '<div class="small">預約姓名：'+esc(x.name)+' ・ '+esc(x.party)+' 位</div><div class="small">聯絡手機：'+esc(x.phone||'未提供')+'</div>'+
   '<div class="small">送出預約時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
   (focused&&bookingState.manageMode==="cancel"&&editable?'<p class="staff-help">請核對預約資料，再點「確認取消預約」。</p>':'')+
   buttons+editBookingForm(x)+'</article>';
 }).join("");
}

export function renderMyTickets(tickets){
 if(!tickets.length)return '<p class="muted">目前沒有號碼紀錄。</p>';
 return tickets.map(x=>{
  const focused=bookingState.manageKind==="ticket"&&bookingState.manageItem===x.id;
  return '<article class="staff-record" style="'+(focused?'border:2px solid #0d9488;':'')+'">'+
    '<div class="staff-record-head"><div><strong>'+esc(x.number)+'</strong>'+
    '<div class="small">'+esc(x.date||"")+'</div>'+
    '<div class="small">取號時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
    (x.reference_code?'<div class="small">查核參考碼：'+esc(x.reference_code)+'</div>':"")+
    selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
    (["WAITING","HOLD"].includes(x.status)?(focused&&bookingState.manageMode==="cancel"?'<p class="staff-help">確認不再候位後，點下方取消按鈕。</p>':'')+
      btn(x.status==="HOLD"?"恢復候位":"保留候位",x.status==="HOLD"?"resume-my-number":"hold-my-number","secondary",'data-id="'+esc(x.id)+'"')+
      btn(focused&&bookingState.manageMode==="cancel"?"確認取消排隊":"取消排隊","cancel-my-number","outline",'data-id="'+esc(x.id)+'"'):"")+'</article>';
 }).join("");
}

export function openBookingReceipt(bookingId){
 if(routeState.view!=="customer"||lineState.lineLinkStatus!=="linked"){
   showActionFeedback("請先以原 LINE 帳號驗證，再查閱自己的預約。","error");return;
 }
 const record=(customerState.customer?.my_reservations||[]).find(x=>x.id===bookingId);
 if(!record){showActionFeedback("找不到這筆預約，請重新整理確認。","error");return;}
 document.getElementById("booking-receipt-overlay")?.remove();
 const now=new Date().toISOString();
 const shop=customerState.customer?.tenant?.name||"門市";
 const status=jsStatus(record.status);
 const ref=String(record.reference_code||"—");
 const services=Array.isArray(record.selected_items)?record.selected_items.map(x=>x.name||x.title||"").filter(Boolean):[];
 const markup='<div id="booking-receipt-overlay" class="receipt-backdrop" role="dialog" aria-modal="true" aria-label="預約憑證">'+
   '<article class="receipt-card"><div class="receipt-eyebrow">排隊怪獸 · 預約紀錄</div>'+
   '<h2>'+esc(shop)+'</h2><p class="receipt-number">'+esc(record.number||"—")+'</p>'+
   '<div class="receipt-field"><span>預約日期</span><strong>'+esc(record.day||"—")+'</strong></div>'+
   '<div class="receipt-field"><span>預約時間</span><strong>'+esc(record.time||"—")+'</strong></div>'+
   '<div class="receipt-field"><span>人數</span><strong>'+esc(record.party||"—")+' 位</strong></div><div class="receipt-field"><span>預約姓名</span><strong>'+esc(record.name||"—")+'</strong></div><div class="receipt-field"><span>聯絡電話</span><strong>'+esc(record.phone||"尚未提供")+'</strong></div>'+
   '<div class="receipt-field"><span>目前狀態</span><strong>'+esc(status)+'</strong></div>'+
   '<div class="receipt-field"><span>服務項目</span><strong>'+esc(services.length?services.join("、"):"以門市紀錄為準")+'</strong></div>'+
   '<div class="receipt-field"><span>建立時間</span><strong>'+esc(formatTaipeiCreated(record.created_at))+'</strong></div>'+
   '<div class="receipt-field"><span>查核參考碼</span><strong>'+esc(ref)+'</strong></div>'+
   '<p class="receipt-warning">本憑證為 '+esc(formatTaipeiCreated(now))+' 查詢時的紀錄快照，不是即時有效性保證。改期、取消或刪除後，舊截圖及列印內容可能失效；請由店員在管理後台確認最新狀態。參考碼不能取代身分驗證。</p>'+
   '<div class="receipt-actions">'+btn("列印／儲存 PDF","receipt-print","primary")+
   btn("關閉","receipt-close","outline")+'</div></article></div>';
 document.body.insertAdjacentHTML("beforeend",markup);
 document.querySelector('#booking-receipt-overlay button[data-act="receipt-close"]')?.focus();
}
