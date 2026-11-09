function staffBookingMatches(record,term=staffBookingSearch,dateFilter=staffBookingDateFilter,statusFilter=staffBookingStatusFilter,now=taipei()){
 const date=String(record.day||"").slice(0,10);
 const keyword=String(term||"").trim().toLocaleLowerCase("zh-Hant");
 const searchable=[record.name,record.number,record.day,record.time,
   ...(Array.isArray(record.selected_items)?record.selected_items.map(x=>x?.name||""):[])
 ].join(" ").toLocaleLowerCase("zh-Hant");
 if(keyword&&!searchable.includes(keyword))return false;
 if(statusFilter!=="all"&&record.status!==statusFilter)return false;
 if(dateFilter==="today"&&date!==now)return false;
 if(dateFilter==="tomorrow"){
   const dt=new Date(now+"T00:00:00Z");
   dt.setUTCDate(dt.getUTCDate()+1);
   if(date!==dt.toISOString().slice(0,10))return false;
 }
 if(dateFilter==="next7"){
   const dt=new Date(now+"T00:00:00Z");
   dt.setUTCDate(dt.getUTCDate()+6);
   if(date<now||date>dt.toISOString().slice(0,10))return false;
 }
 return true;
}
// CSV cells are quoted and neutralize leading spreadsheet formula expressions.
function safeHistoryCsvCell(value){
 let v=String(value??"").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g," ");
 if(/^[\s\uFEFF]*[=+@-]/u.test(v))v="'"+v;
 return '"'+v.replace(/"/g,'""')+'"';
}
function historyCsvContent(items){
 const columns=["預約日期","預約時間","預約編號","永久參考碼","編號批次","預約姓名","聯絡電話","人數","狀態","服務項目","送出預約時間","最後更新時間","顧客端已隱藏"];
 const rows=items.map(x=>[
  x.day,x.time,x.number,x.reference_code,x.round,x.name,x.phone||'',x.party,jsStatus(x.status),
  Array.isArray(x.selected_items)?x.selected_items.map(i=>i?.name||"").filter(Boolean).join("、"):"",
  formatTaipeiCreated(x.created_at),formatTaipeiCreated(x.updated_at),x.deleted_at?"是":"否"
 ]);
 return "\uFEFF"+[columns,...rows].map(row=>row.map(safeHistoryCsvCell).join(",")).join("\r\n");
}
async function exportHistoricalBookings(){
 if(view!=="staff"||staffTab!=="bookings"||!["OWNER","MANAGER","PLATFORM"].includes(staff?.role)){
  showActionFeedback("僅企業管理者可匯出預約資料。","error");return;
 }
 if(historicalBookingLoading||!historicalBookingResult){
  showActionFeedback("請先完成完整歷史搜尋，再匯出符合條件的結果。","error");return;
 }
 const total=Number(historicalBookingResult.total||0);
 if(!Number.isInteger(total)||total<0||total>20000){
  showActionFeedback("最多一次匯出 20,000 筆；請縮小日期或搜尋條件後重試。","error");return;
 }
 if(total===0){showActionFeedback("沒有符合條件的預約可匯出。","warning");return;}
 if(historicalBookingDeleted!=="active"&&!confirm("匯出內容包含已隱藏於顧客端的預約，確定繼續嗎？"))return;
 const merchant=slug;
 const query={p_slug:merchant,p_search:historicalBookingQuery,
  p_date_from:historicalBookingStart||null,p_date_to:historicalBookingEnd||null,
  p_status:historicalBookingStatus,p_deleted:historicalBookingDeleted};
 busy=true;showActionFeedback("正在整理符合條件的預約紀錄…","pending");
 try{
  const records=[],ids=new Set();
  const pages=Math.ceil(total/100);
  for(let page=1;page<=pages;page++){
   const data=await rpc("so_staff_reservation_search",{...query,p_page:page,p_page_size:100});
   if(merchant!==slug||Number(data?.total)!==total)
    throw Error("搜尋結果在匯出期間發生變動；請重新查詢後匯出，避免資料缺漏。");
   for(const record of data.items||[]){
    if(ids.has(record.id))throw Error("預約排序在匯出期間發生變動，請重新查詢後重試。");
    ids.add(record.id);records.push(record);
   }
  }
  if(records.length!==total)throw Error("匯出筆數不一致，已取消下載；請重新查詢後重試。");
  const csv=historyCsvContent(records);
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;
  link.download="LINE_booking_history_"+merchant+"_"+taipei()+".csv";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  showActionFeedback("已匯出符合條件的 "+total+" 筆預約，請保管好顧客資料。","success");
 }catch(e){
  showActionFeedback("預約匯出失敗："+(e.message||String(e)),"error");
 }finally{busy=false;render();}
}
function customerHistoryDialog(){
 if(view!=="staff"||staffTab!=="settings"||!staff||!customerHistoryUserId)return "";
 const data=customerHistoryData;
 const total=Number(data?.total||0),page=Number(data?.page||customerHistoryPage);
 const pages=Math.max(1,Math.ceil(total/25));
 const rows=(data?.items||[]).map(x=>'<article class="customer-history-entry">'+
   '<div class="customer-history-entry-head"><strong>預約 '+esc(x.number||"—")+'　'+esc(x.day||"")+' '+esc(x.time||"")+'</strong>'+tag(x.status)+'</div>'+
   '<div class="small">預約姓名：'+esc(x.name||"—")+' ・ '+esc(x.party||0)+' 位</div>'+
   '<div class="small">送出時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   '<div class="small">永久參考碼：'+esc(x.reference_code||"—")+'</div>'+
   selectedItemsHtml(x.selected_items)+
   (x.deleted_at?'<div class="small">此筆已從顧客端隱藏（歷史仍保留）。</div>':"")+
   '</article>').join("");
 const body=customerHistoryLoading?'<p class="muted" role="status">正在查詢預約紀錄…</p>':
   customerHistoryError?'<p class="alert" role="alert">'+esc(customerHistoryError)+'</p>':
   data?'<p class="small">共 '+esc(total)+' 筆預約，顯示第 '+esc(page)+' / '+esc(pages)+' 頁。</p>'+
     (rows||'<p class="muted">這位顧客尚無預約紀錄。</p>')+
     '<div class="staff-actionbar">'+btn("上一頁","customer-history-prev","outline",page<=1?"disabled":"")+
     btn("下一頁","customer-history-next","outline",!data.has_more?"disabled":"")+'</div>':"";
 return '<div class="receipt-backdrop customer-history-backdrop" role="presentation">'+
  '<section class="receipt-card customer-history-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-history-title">'+
  '<div class="customer-history-toolbar"><div><h2 id="customer-history-title">'+esc(customerHistoryName||"顧客")+'｜歷史預約</h2>'+
  '<p class="small">依顧客身分識別查詢，不會將同名顧客的紀錄混在一起。</p></div>'+
  btn("關閉","customer-history-close","outline")+'</div>'+body+'</section></div>';
}
async function loadCustomerHistory(page=1){
 if(view!=="staff"||staffTab!=="settings"||!staff||!customerHistoryUserId)return;
 const seq=++customerHistorySeq,customerId=customerHistoryUserId,merchant=slug;
 customerHistoryLoading=true;customerHistoryError="";render();
 try{
   const result=await rpc("so_staff_customer_reservation_history",{
     p_slug:merchant,p_customer_user_id:customerId,p_page:page,p_page_size:25
   });
   if(seq!==customerHistorySeq||customerId!==customerHistoryUserId||merchant!==slug)return;
   customerHistoryData=result;customerHistoryPage=page;
 }catch(e){
   if(seq!==customerHistorySeq||customerId!==customerHistoryUserId)return;
   customerHistoryData=null;customerHistoryError=e?.message||"查詢顧客預約歷史失敗";
 }finally{
   if(seq===customerHistorySeq&&customerId===customerHistoryUserId){
     customerHistoryLoading=false;render();
   }
 }
}

function historyBookingResultHtml(){
 const data=historicalBookingResult;
 if(historicalBookingLoading)return '<p class="muted" role="status">正在查詢資料，請稍後…</p>';
 if(historicalBookingError)return '<p class="alert" role="alert">'+esc(historicalBookingError)+'</p>';
 if(!data)return '<p class="muted">按「查詢完整歷史」開始搜尋。</p>';
 const items=Array.isArray(data.items)?data.items:[];
 const total=Math.max(0,Number(data.total||0)),size=Math.max(1,Number(data.page_size||25));
 const page=Math.max(1,Number(data.page||1)),pages=Math.max(1,Math.ceil(total/size));
 const count='<p class="small" role="status">共找到 <strong>'+esc(total)+'</strong> 筆；第 '+esc(page)+' / '+esc(pages)+' 頁（每頁最多 '+esc(size)+' 筆）。</p>';
 const cards=items.map(x=>'<article class="staff-record'+(x.deleted_at?' staff-deleted-record':'')+'">'+
  '<div class="staff-record-head"><div><div class="staff-record-title">預約 '+esc(x.number||"—")+'　'+esc(x.day||"")+'　'+esc(x.time||"")+'</div>'+
  '<div class="small">'+esc(x.name||"")+" ・ "+esc(x.party||0)+' 位</div>'+
  '<div class="small">聯絡電話：'+(x.phone?'<a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a>':'尚未提供')+'</div>'+
  '<div class="small">建立時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
  '<div class="small">永久參考碼：'+esc(x.reference_code||"—")+' ・ 編號批次：'+esc(x.round??"—")+'</div>'+
  selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
  (x.deleted_at?'<p class="small">此筆紀錄已在顧客端隱藏，仍保留供店家管理查閱。</p>':"")+'</article>').join("");
 return count+(cards||'<p class="muted">沒有符合條件的預約。</p>')+
  '<div class="staff-actionbar">'+btn("上一頁","historical-prev","outline",page<=1?"disabled":"")+
  btn("下一頁","historical-next","outline",!data.has_more?"disabled":"")+'</div>';
}
async function searchHistoricalBookings(page=historicalBookingPage){
 const request=++historicalBookingToken,merchant=slug;
 if(view!=="staff"||!staff?.tenant||!authReady()){
  historicalBookingResult=null;historicalBookingError="請先完成店員登入並選擇可管理的門市";render();return;
 }
 historicalBookingLoading=true;historicalBookingError="";render();
 try{
  const result=await rpc("so_staff_reservation_search",{
   p_slug:merchant,p_search:historicalBookingQuery,
   p_date_from:historicalBookingStart||null,p_date_to:historicalBookingEnd||null,
   p_status:historicalBookingStatus,p_deleted:historicalBookingDeleted,
   p_page:page,p_page_size:25
  });
  if(request!==historicalBookingToken||merchant!==slug||view!=="staff")return;
  historicalBookingResult=result;historicalBookingPage=page;historicalBookingTenant=merchant;
 }catch(e){
  if(request!==historicalBookingToken||merchant!==slug)return;
  historicalBookingResult=null;historicalBookingError=e?.message||"無法取得完整預約歷史";
 }finally{
  if(request===historicalBookingToken&&merchant===slug){
   historicalBookingLoading=false;
   if(view==="staff"&&staffTab==="bookings")render();
  }
 }
}

