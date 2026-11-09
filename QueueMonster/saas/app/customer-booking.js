function serviceSlotsKey(){return slug+"|"+day+"|"+bookingChosenItems.slice().sort().join(",")}
function currentBookingSlots(){return serviceSlotPreview?.key===serviceSlotsKey()?serviceSlotPreview.slots:[]}
async function refreshServiceSlots(){
 if(view!=="customer"||customerTab!=="reserve"||lineLinkStatus!=="linked")return;
 const key=serviceSlotsKey(),shop=slug,date=day,ids=bookingChosenItems.slice();
 const token=++serviceSlotRequest;
 serviceSlotPreview=null;serviceSlotError="";render();
 try{
   const result=await rpc("so_service_slot_availability",{p_slug:shop,p_date:date,p_items:ids});
   if(token!==serviceSlotRequest||serviceSlotsKey()!==key||view!=="customer"||customerTab!=="reserve")return;
   serviceSlotPreview={key,slots:Array.isArray(result?.slots)?result.slots:[]};
   if(chosenSlot&&!currentBookingSlots().some(x=>x.time===chosenSlot&&availableForParty(x)))chosenSlot="";
   serviceSlotError="";
 }catch(e){
   if(token!==serviceSlotRequest||serviceSlotsKey()!==key)return;
   serviceSlotPreview=null;chosenSlot="";
   serviceSlotError=e?.message||"暫時無法取得服務時段";
 }finally{if(token===serviceSlotRequest&&serviceSlotsKey()===key)render()}
}
function availableForParty(slot,party=bookingParty){
 return Number.isInteger(party)&&party>=1&&party<=20 &&
   Number.isFinite(Number(slot?.available))&&Number(slot.available)>=party;
}
function syncBookingPartyInput(raw){
 const requested=Number(raw);
 bookingParty=Number.isInteger(requested)&&requested>=1&&requested<=20?requested:0;
 const slots=currentBookingSlots();
 if(chosenSlot&&!slots.some(x=>x.time===chosenSlot&&availableForParty(x)))chosenSlot="";
 for(const button of document.querySelectorAll("button[data-slot]")){
   const slot=slots.find(x=>x.time===button.dataset.slot);
   const enabled=!!slot&&availableForParty(slot);
   button.disabled=!enabled;
   button.classList.toggle("active",enabled&&chosenSlot===button.dataset.slot);
   button.setAttribute("aria-disabled",String(!enabled));
 }
 const helper=document.getElementById("booking-capacity-hint");
 if(helper)helper.textContent=bookingParty?
   "已依 "+bookingParty+" 位篩選時段；名額不足的時間不能選擇。":
   "請輸入 1～20 位的有效預約人數。";
 const submit=document.querySelector('button[data-act="book"]');
 if(submit)submit.disabled=!chosenSlot||!bookingParty||!validBookingContact()||
   !menuChoiceReady(customer?.tenant?.menu_booking_mode||"DISABLED",bookingChosenItems,customer?.menu_items||[]);
}
function normalizeBookingPhone(v){let raw=String(v||"").replace(/[\s()-]/g,"");if(/^\+8869\d{8}$/.test(raw))raw="0"+raw.slice(4);return raw}
function validBookingContact(){return !!bookingContactName.trim()&&bookingContactName.trim().length<=80&&!/[\r\n\u0000-\u001f]/.test(bookingContactName)&&/^09\d{8}$/.test(normalizeBookingPhone(bookingContactPhone))}
function bookingConfirmationFingerprint(){return JSON.stringify({merchant:slug,date:day,time:chosenSlot,party:bookingParty,name:bookingContactName.trim(),phone:normalizeBookingPhone(bookingContactPhone),items:[...bookingChosenItems].sort()});}
function customerRender(){
  if(lineLinkStatus!=="linked")return box("門市公開即時叫號",
'<p class="muted">查看現在叫到幾號、後面等候順序，不必登入、不必綁定 LINE。</p><p><a class="btn primary" href="./board.html?merchant='+encodeURIComponent(slug)+'">公開即時叫號看板</a></p>')+
box("LINE 身分授權",'<p class="muted">為避免機器人或惡意假預約，預約前需綁定 LINE 身分。預約姓名及聯絡電話另行填寫，供現場核對與店家聯繫。</p><p class="small">目前指定門市：<strong>'+esc(slug)+'</strong></p>'+lineStatusBadge());
  if(!customer)return box("正在讀取顧客網站",'<p class="muted">正在確認企業設定與登入狀態...</p>');
  const t=customer.tenant,m=t.modules||{},items=customer.my_reservations||[],tickets=customer.my_tickets||[],live=tickets.find(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
  const catalogue=customer.menu_items||[];
 document.documentElement.style.setProperty("--merchant-accent",/^#[a-fA-F0-9]{6}$/.test(t.accent)?t.accent:"#6A398A");
 const menu=nav("首頁","home",customerTab,"customer")+(m.reservation?nav("線上預約","reserve",customerTab,"customer"):"")+(m.queue?nav("現場取號","queue",customerTab,"customer"):"")+nav("我的取號","progress",customerTab,"customer")+nav("我的紀錄","mine",customerTab,"customer");
 let html='';
 if(customerTab==="home") html='<div class="hero"><div class="eyebrow">LINE 門市線上服務</div><h1>'+esc(t.name)+'</h1><p class="muted">'+esc(t.description||"線上預約與現場候位，從這裡開始")+'</p><p class="muted">'+esc(t.address||"")+'</p></div>'+
 '<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",customer.current||"—")+stat("現場候位",customer.waiting+" 組")+stat("我的有效預約",items.filter(x=>x.status==="CONFIRMED").length)+'</div>'+
 '<div class="grid">'+(m.reservation?'<button class="routecard" data-nav="customer" data-tab="reserve"><h2>線上預約</h2><p class="muted">選擇日期與時段，完成預約</p><strong>立即預約 →</strong></button>':"")+
 (m.queue?'<button class="routecard" data-nav="customer" data-tab="queue"><h2>現場取號</h2><p class="muted">直接取得候位號碼與查看進度</p><strong>立即取號 →</strong></button>':"")+
(m.queue&&m.calling?'<a class="routecard" href="./board.html?merchant='+encodeURIComponent(slug)+'"><h2>公開即時叫號看板</h2><p class="muted">直接查看目前叫號及接下來的順序。</p><strong>查看公開看板 →</strong></a>':"")+'</div>';
 else if(customerTab==="reserve"){
  if(!m.reservation)html=box("未開放預約",'<p>企業目前沒有啟用此功能。</p>');
  else if(unitEnabled())html=unitBookingPanel();
  else {
   const needsConfirmation=customer.booking_confirmation_required!==false;
   const confirming=needsConfirmation&&bookingConfirmationKey===bookingConfirmationFingerprint();
   const bookingItems=catalogue.filter(item=>bookingChosenItems.includes(item.id));
   const amountKnown=bookingItems.length>0&&bookingItems.every(item=>item.price!==null&&item.price!==undefined&&Number.isFinite(Number(item.price)));
   const estimatedCost=amountKnown?bookingItems.reduce((sum,item)=>sum+Number(item.price),0):null;
   html=box("選擇預約日期與時間",'<div class="grid"><div>'+field("預約日期","customer-day",day,"date",'min="'+taipei()+'"')+'</div><div>'+field("預約人數","customer-party",bookingParty||"","number",'min="1" max="20" required')+'</div></div><label>可預約時段</label>'+
    '<p class="small" id="booking-capacity-hint" role="status">'+(bookingParty?"已依 "+bookingParty+" 位篩選時段；名額不足的時間不能選擇。":"請輸入 1～20 位的有效預約人數。")+'</p>'+
    (serviceSlotError?'<p class="alert">'+esc(serviceSlotError)+'</p>':serviceSlotPreview?.key===serviceSlotsKey()?"":'<p class="small">正在確認實際服務時間與資源剩餘名額…</p>')+
    '<div class="slots">'+currentBookingSlots().map(s=>'<button class="slot '+(chosenSlot===s.time&&availableForParty(s)?"active":"")+'" data-slot="'+esc(s.time)+'" '+(!availableForParty(s)?"disabled aria-disabled=\"true\"":"")+'>'+esc(s.time)+'<small>'+(!availableForParty(s)?"名額不足・":"")+'剩 '+esc(s.available)+' 位</small></button>').join("")+'</div>'+
    menuSelectSection(t.menu_booking_mode||"DISABLED",catalogue,bookingChosenItems,"booking")+
    '<div class="grid"><div>'+field("預約姓名（現場核對）","customer-book-name",bookingContactName,"text",'required maxlength="80" autocomplete="name" placeholder="請填寫現場方便稱呼的姓名"')+'</div><div>'+field("聯絡手機","customer-book-phone",bookingContactPhone,"tel",'required inputmode="tel" autocomplete="tel" placeholder="0912345678 或 +886912345678"')+'</div></div>'+
    '<p class="small">為避免機器人或惡意假預約，預約前須綁定 LINE 身分。現場核對及預約聯繫使用上方姓名與電話，不使用 LINE 暱稱。資料供本次預約店家聯繫使用。</p>'+
    '<div class="staff-actionbar">'+btn("重新整理服務時段","refresh-service-slots","outline")+'</div>'+
    '<div style="margin-top:15px">'+(confirming?
     '<div class="notice" role="group" aria-label="預約二次確認"><strong>請確認預約內容</strong>'+
     '<p>門市：'+esc(t.name)+'</p><p>日期：'+esc(day)+'（台灣時間 UTC+8）</p>'+
     '<p>時間：'+esc(chosenSlot)+'</p><p>人數：'+esc(bookingParty)+' 位</p>'+
     '<p>預約姓名：'+esc(bookingContactName.trim())+'</p><p>聯絡手機：'+esc(normalizeBookingPhone(bookingContactPhone))+'</p>'+
     '<p>服務／品項：'+esc(bookingItems.map(item=>item.name).join("、")||"依門市設定")+'</p>'+
     '<p>估計價格：'+esc(estimatedCost===null?"依門市公告為準":"NT$ "+estimatedCost.toLocaleString("zh-TW"))+'</p>'+
     '<p class="small">店家條款、取消限制以店家公告為準；送出時系統將再次查核名額。</p></div>'+
     '<div class="grid">'+btn("返回修改","book-back","outline")+btn("確認預約","book-final","primary full")+'</div>':
     btn(needsConfirmation?"下一步：確認預約":"確定送出預約","book","primary full",
       !chosenSlot||!bookingParty||!validBookingContact()||!menuChoiceReady(t.menu_booking_mode,bookingChosenItems,catalogue)?"disabled":""))+'</div>')+
    box("我的近期預約",renderBookings(items,true));
  }
 }else if(customerTab==="queue"){
  if(!m.queue)html=box("尚未開放取號",'<p>本企業只提供線上預約。</p>');
  else if(unitEnabled())html=unitQueuePanel();
  else html=(customer.queue_session?.code==="REST"?'<p class="alert">門市目前休場，暫停新取號。已取得的號碼仍保留，現場人員可繼續處理。</p>':"")+
  '<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",customer.current||"—")+stat("等候組數",customer.waiting)+stat("我的號碼",live?.number||"—")+'</div>'+
   box("我的現場號碼",live?'<div class="ticket">'+esc(live.number)+'</div><p>'+tag(live.status)+'</p>'+
    '<p class="small">取號時間：'+esc(formatTaipeiCreated(live.created_at))+' ・ '+esc(live.party||1)+' 人／組</p>'+
    selectedItemsHtml(live.selected_items)+
    (live.status==="WAITING"?btn("取消取號","cancel-my-number","danger",'data-id="'+esc(live.id)+'"'):""):
    '<p class="muted">現在可在網站上取得號碼。</p>'+
    '<p>取號者：<strong>'+esc(lineDisplayName)+'</strong>（由 LINE 自動帶入）</p>'+ 
    '<div>'+field("本次候位人數（1～20 人）","customer-queue-party",queuePartySize,"number",'min="1" max="20" step="1" inputmode="numeric"')+'</div>'+ 
    '<p class="small">一張號碼牌代表一組。前方等待仍以「組數」計算，人數用於門市安排桌位／服務。</p>'+
    menuSelectSection(t.menu_queue_mode||"DISABLED",catalogue,queueChosenItems,"queue")+
    '<div style="margin-top:14px">'+btn("立即線上取號","take","primary",
    (customer.queue_session?.code==="REST"||!Number.isInteger(queuePartySize)||queuePartySize<1||queuePartySize>20||!menuChoiceReady(t.menu_queue_mode,queueChosenItems,catalogue))?"disabled":"")+'</div>');
 }else if(customerTab==="progress"){
  if(progressTicketId||crossCurrentStore)html=box("即時叫號進度",'<p class="muted">以下為 <strong>'+esc(t.name)+'</strong> 的即時候位資訊。</p>'+
    '<div class="staff-actionbar">'+btn("返回我的取號","cross-back","outline")+'</div>'+queueProgressBoard());
  else html=box("我的取號",crossTicketCards());
 }else html=(manageKind&&manageItem?
    box("我的預約紀錄",renderBookings(items,true))+box("我的號碼紀錄",renderMyTickets(tickets)):
    crossRecords());
 if(customerTab==="home"&&unitEnabled()){
    const units=unitList();
    html+=box("選擇服務單位",'<p class="small">同一家店的各服務單位共用這個網站，不需要切換不同店家。</p>'+
      (unitConfig.grouped?'<div class="unit-category-chips">'+["全部",...[...new Set((unitConfig.units||[]).filter(u=>u.active).map(u=>u.group||"其他"))]].map(g=>
        btn(g,"unit-category-pill",unitCategory===(g==="全部"?"":g)?"primary":"outline",'data-category="'+esc(g==="全部"?"":g)+'"')).join("")+'</div>':'')+
      '<div class="unit-card-grid">'+units.map(u=>'<button class="unit-option" data-act="unit-home-select" data-id="'+esc(u.id)+'">'+
        '<span class="unit-option-copy"><span class="unit-option-group">'+esc(u.group||"服務")+'</span>'+
        '<strong>'+esc(u.name)+'</strong><small>查看預約場次與目前候位</small></span><span class="unit-option-trailing">›</span></button>').join("")+'</div>');
  }
  if(customerTab==="home"&&customerAnnouncements.length){
   html+=box("門市最新公告",customerAnnouncements.map(a=>
      '<article class="inset" style="margin-bottom:15px"><h3>'+esc(a.title)+'</h3>'+
      '<p style="white-space:pre-wrap">'+esc(a.body||"")+'</p>'+
      ((a.images||[]).length?'<div class="announcement-gallery" style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 0">'+
         a.images.map(u=>'<img loading="lazy" alt="'+esc(a.title)+' 門市照片" src="'+esc(u)+'" style="width:220px;height:150px;flex:none;object-fit:cover;border-radius:9px;scroll-snap-align:start">').join("")+
        '</div>':"")+'</article>').join(""));
 }
 return layout(t.name,"預約與取號・即時資料",menu,lineStatusBadge()+html);
}

