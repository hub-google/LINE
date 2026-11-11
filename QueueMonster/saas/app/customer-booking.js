import {bookingState} from "./state/bookingState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {customerState} from "./state/customerState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";



import {render} from "./staff-layout.js";
import {rpc} from "./data-loading.js";
import {box,btn,esc,field,formatTaipeiCreated,layout,menuChoiceReady,menuSelectSection,nav,selectedItemsHtml,stat,tag,taipei} from "./shared-ui.js";
import {lineStatusBadge,lineLoginUrl} from "./line-session.js";
import {unitBookingPanel,unitList,unitQueuePanel} from "./service-units.js";
import {renderBookings,renderMyTickets} from "./customer-records.js";
import {queueProgressBoard} from "./queue-progress.js";
import {crossRecords,crossTicketCards} from "./cross-store.js";

export function serviceSlotsKey(){return routeState.slug+"|"+routeState.day+"|"+bookingState.bookingChosenItems.slice().sort().join(",")}

export function currentBookingSlots(){return bookingState.serviceSlotPreview?.key===serviceSlotsKey()?bookingState.serviceSlotPreview.slots:[]}

export async function refreshServiceSlots(){
 if(routeState.view!=="customer"||routeState.customerTab!=="reserve"||lineState.lineLinkStatus!=="linked")return;
 const key=serviceSlotsKey(),shop=routeState.slug,date=routeState.day,ids=bookingState.bookingChosenItems.slice();
 const token=++bookingState.serviceSlotRequest;
 bookingState.serviceSlotPreview=null;bookingState.serviceSlotError="";render();
 try{
   const result=await rpc("so_service_slot_availability",{p_slug:shop,p_date:date,p_items:ids});
   if(token!==bookingState.serviceSlotRequest||serviceSlotsKey()!==key||routeState.view!=="customer"||routeState.customerTab!=="reserve")return;
   bookingState.serviceSlotPreview={key,slots:Array.isArray(result?.slots)?result.slots:[]};
   if(bookingState.chosenSlot&&!currentBookingSlots().some(x=>x.time===bookingState.chosenSlot&&availableForParty(x)))bookingState.chosenSlot="";
   bookingState.serviceSlotError="";
 }catch(e){
   if(token!==bookingState.serviceSlotRequest||serviceSlotsKey()!==key)return;
   bookingState.serviceSlotPreview=null;bookingState.chosenSlot="";
   bookingState.serviceSlotError=e?.message||"暫時無法取得服務時段";
 }finally{if(token===bookingState.serviceSlotRequest&&serviceSlotsKey()===key)render()}
}

export function availableForParty(slot,party=bookingState.bookingParty){
 return Number.isInteger(party)&&party>=1&&party<=20 &&
   Number.isFinite(Number(slot?.available))&&Number(slot.available)>=party;
}

export function syncBookingPartyInput(raw){
 const requested=Number(raw);
 bookingState.bookingParty=Number.isInteger(requested)&&requested>=1&&requested<=20?requested:0;
 const slots=currentBookingSlots();
 if(bookingState.chosenSlot&&!slots.some(x=>x.time===bookingState.chosenSlot&&availableForParty(x)))bookingState.chosenSlot="";
 for(const button of document.querySelectorAll("button[data-slot]")){
   const slot=slots.find(x=>x.time===button.dataset.slot);
   const enabled=!!slot&&availableForParty(slot);
   button.disabled=!enabled;
   button.classList.toggle("active",enabled&&bookingState.chosenSlot===button.dataset.slot);
   button.setAttribute("aria-disabled",String(!enabled));
 }
 const helper=document.getElementById("booking-capacity-hint");
 if(helper)helper.textContent=bookingState.bookingParty?
   "已依 "+bookingState.bookingParty+" 位篩選時段；名額不足的時間不能選擇。":
   "請輸入 1～20 位的有效預約人數。";
 const submit=document.querySelector('button[data-act="book"]');
 if(submit)submit.disabled=!bookingState.chosenSlot||!bookingState.bookingParty||!validBookingContact()||
   !menuChoiceReady(customerState.customer?.tenant?.menu_booking_mode||"DISABLED",bookingState.bookingChosenItems,customerState.customer?.menu_items||[]);
}

export function normalizeBookingPhone(v){let raw=String(v||"").replace(/[\s()-]/g,"");if(/^\+8869\d{8}$/.test(raw))raw="0"+raw.slice(4);return raw}

export function validBookingContact(){return !!bookingState.bookingContactName.trim()&&bookingState.bookingContactName.trim().length<=80&&!/[\r\n\u0000-\u001f]/.test(bookingState.bookingContactName)&&/^09\d{8}$/.test(normalizeBookingPhone(bookingState.bookingContactPhone))}

export function bookingContactFields(mode="standard"){
 const unit=mode==="unit";
 const nameAttrs=unit?'maxlength="60" required autocomplete="name"':
   'required maxlength="80" autocomplete="name" placeholder="請填寫現場方便稱呼的姓名"';
 const phoneAttrs=unit?'required inputmode="tel" autocomplete="tel"':
   'required inputmode="tel" autocomplete="tel" placeholder="0912345678 或 +886912345678"';
 return '<div class="grid"><div>'+
   field(unit?"預約姓名":"預約姓名（現場核對）","customer-book-name",bookingState.bookingContactName,"text",nameAttrs)+
   '</div><div>'+field("聯絡手機","customer-book-phone",bookingState.bookingContactPhone,"tel",phoneAttrs)+'</div></div>'+
   (unit?"":'<p class="small">為避免機器人或惡意假預約，預約前須綁定 LINE 身分。現場核對及預約聯繫使用上方姓名與電話，不使用 LINE 暱稱。資料供本次預約店家聯繫使用。</p>');
}

// Shared idempotency key input for all booking variants. Keep property order unchanged.
export function bookingRequestDetails(time,party,items){
 return {merchant:routeState.slug,date:routeState.day,time,party,
   name:bookingState.bookingContactName.trim(),
   phone:normalizeBookingPhone(bookingState.bookingContactPhone),items};
}


export function bookingConfirmationFingerprint(){return JSON.stringify({merchant:routeState.slug,date:routeState.day,time:bookingState.chosenSlot,party:bookingState.bookingParty,name:bookingState.bookingContactName.trim(),phone:normalizeBookingPhone(bookingState.bookingContactPhone),items:[...bookingState.bookingChosenItems].sort()});}


function applyCustomerBrand(tenant){
 const accent=/^#[0-9a-fA-F]{6}$/.test(String(tenant?.accent||""))?tenant.accent.toUpperCase():"#693C8B";
 const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16));
 const linear=rgb.map(v=>{const n=v/255;return n<=0.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});
 const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 const contrast=luminance>.179?"#281B31":"#FFFFFF";
 const ink="#"+rgb.map(v=>Math.round(v*.54).toString(16).padStart(2,"0")).join("").toUpperCase();
 document.documentElement.style.setProperty("--merchant-accent",accent);
 document.documentElement.style.setProperty("--merchant-contrast",contrast);
 document.documentElement.style.setProperty("--merchant-ink",ink);
}

export function customerRender(){
  if(!routeState.slug){
    return lineState.lineLinkStatus==="linked"?
      box("已登入排隊怪獸",'<p class="muted">LINE 身分驗證完成。現在可以自由搜尋店家，選擇後再預約或取號。</p><p><a class="btn primary" href="./directory.html?mode=search">搜尋店家</a> <a class="btn outline" href="./directory.html?mode=mine">我的預約與取號</a></p>'):
      box("使用 LINE 登入排隊怪獸",'<p class="muted">不需要先選擇店家，登入後即可搜尋、預約及取號。</p>'+lineStatusBadge()+'<p><a href="./directory.html?mode=search">先搜尋店家</a></p>');
  }
  if(lineState.lineLinkStatus!=="linked"){
   const brand=customerState.publicBrand;
   if(brand)applyCustomerBrand(brand);
   const logo=String(brand?.logo_url||"").trim();
   const safeLogo=/^https:\/\/[^\s<>"']{1,490}$/i.test(logo)?logo:"";
   const brandHeader=brand?
    '<section class="toolbar customer-shop-toolbar"><div class="customer-shop-identity">'+
      '<div class="customer-shop-avatar">'+(safeLogo?
       '<img src="'+esc(safeLogo)+'" alt="'+esc(brand.name)+' 店家 LOGO">':
       '<span class="customer-shop-avatar-fallback" aria-hidden="true">'+esc(brand.name.slice(0,2))+'</span>')+'</div>'+
      '<div class="customer-shop-title"><div class="customer-shop-overline">店家預約與取號</div><h1>'+esc(brand.name)+'</h1>'+
      '<div class="muted">由排隊怪獸提供預約與取號服務</div></div></div></section>':"";
   // Primary action follows the customer's intent. The public board is optional,
   // not the first screen for somebody opening a booking/number URL.
   const entryTitle=routeState.customerTab==="reserve"?"線上預約":
     routeState.customerTab==="queue"?"現場取號":
     routeState.customerTab==="mine"?"我的預約與取號":
     routeState.customerTab==="progress"?"我的取號進度":"線上預約與取號";
   const loginHref=lineState.lineConfig?.liffId?lineLoginUrl():"";
   const waiting=lineState.lineLinkStatus==="connecting"||
     lineState.lineLinkStatus==="not-ready"&&lineState.lineLinkAttempted===false;
   const prompt=waiting?
     '<p class="muted" role="status">正在確認 LINE 登入狀態…</p>':
     '<p class="muted">為避免機器人或惡意假預約，請先透過 LINE 登入，再進行預約或取號。</p>'+
       (loginHref?
         '<a class="btn primary" href="'+esc(loginHref)+'">LINE 登入</a>':
         '<p class="alert">LINE 登入暫時無法使用，請稍後重新整理。</p>');
   return brandHeader+
     '<section class="card customer-entry-card"><h2>'+entryTitle+'</h2>'+prompt+'</section>'+
     '<p class="customer-public-board-link"><a href="./board.html?merchant='+
       encodeURIComponent(routeState.slug)+'">只想查看目前叫號？前往即時叫號看板</a></p>';
  }
  if(!customerState.customer)return box("正在讀取顧客網站",'<p class="muted">正在確認企業設定與登入狀態...</p>');
  const t=customerState.customer.tenant,m=t.modules||{},items=customerState.customer.my_reservations||[],tickets=customerState.customer.my_tickets||[],live=tickets.find(x=>["WAITING","HOLD","CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status));
  const catalogue=customerState.customer.menu_items||[];
 applyCustomerBrand(t);
 const menu=nav("首頁","home",routeState.customerTab,"customer")+(m.reservation?nav("線上預約","reserve",routeState.customerTab,"customer"):"")+(m.queue?nav("現場取號","queue",routeState.customerTab,"customer"):"")+nav("我的取號","progress",routeState.customerTab,"customer")+nav("我的紀錄","mine",routeState.customerTab,"customer");
 let html='';
 if(routeState.customerTab==="home"){
  const homepage=customerState.customer.homepage||{};
  const displayTitle=homepage.title===undefined?t.name:homepage.title;
  const displaySubtitle=homepage.subtitle===undefined?(t.description||""):homepage.subtitle;
  const displayLabel=homepage.label||"";
  html=(homepage.show_intro!==true?"":'<section class="card customer-welcome" style="padding:18px 22px;margin-bottom:16px">'+
   (homepage.show_label&&displayLabel?'<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">'+esc(displayLabel)+'</div>':"")+
   (displayTitle?'<h2 style="font-size:clamp(18px,4vw,24px);line-height:1.4;margin:0 0 6px">'+esc(displayTitle)+'</h2>':"")+
   (displaySubtitle?'<p class="muted" style="margin:0 0 7px;white-space:pre-wrap">'+esc(displaySubtitle)+'</p>':"")+
   (t.address?'<p class="muted" style="font-size:13px;margin:0">'+esc(t.address)+'</p>':"")+'</section>')+
 '<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",customerState.customer.current||"—")+stat("現場候位",customerState.customer.waiting+" 組")+stat("我的有效預約",items.filter(x=>x.status==="CONFIRMED").length)+'</div>'+
 '<div class="grid">'+(m.reservation?'<button class="routecard" data-nav="customer" data-tab="reserve"><h2>線上預約</h2><p class="muted">選擇日期與時段，完成預約</p><strong>立即預約 →</strong></button>':"")+
 (m.queue?'<button class="routecard" data-nav="customer" data-tab="queue"><h2>現場取號</h2><p class="muted">直接取得候位號碼與查看進度</p><strong>立即取號 →</strong></button>':"")+
(m.queue&&m.calling?'<a class="routecard" href="./board.html?merchant='+encodeURIComponent(routeState.slug)+'"><h2>公開即時叫號看板</h2><p class="muted">直接查看目前叫號及接下來的順序。</p><strong>查看公開看板 →</strong></a>':"")+'</div>';
 }
 else if(routeState.customerTab==="reserve"){
  if(!m.reservation)html=box("未開放預約",'<p>企業目前沒有啟用此功能。</p>');
  else if(serviceUnitsState.unitEnabled())html=unitBookingPanel();
  else {
   const needsConfirmation=customerState.customer.booking_confirmation_required!==false;
   const confirming=needsConfirmation&&bookingState.bookingConfirmationKey===bookingConfirmationFingerprint();
   const bookingItems=catalogue.filter(item=>bookingState.bookingChosenItems.includes(item.id));
   const amountKnown=bookingItems.length>0&&bookingItems.every(item=>item.price!==null&&item.price!==undefined&&Number.isFinite(Number(item.price)));
   const estimatedCost=amountKnown?bookingItems.reduce((sum,item)=>sum+Number(item.price),0):null;
   html=box("選擇預約日期與時間",'<div class="grid"><div>'+field("預約日期","customer-day",routeState.day,"date",'min="'+taipei()+'"')+'</div><div>'+field("預約人數","customer-party",bookingState.bookingParty||"","number",'min="1" max="20" required')+'</div></div><label>可預約時段</label>'+
    '<p class="small" id="booking-capacity-hint" role="status">'+(bookingState.bookingParty?"已依 "+bookingState.bookingParty+" 位篩選時段；名額不足的時間不能選擇。":"請輸入 1～20 位的有效預約人數。")+'</p>'+
    (bookingState.serviceSlotError?'<p class="alert">'+esc(bookingState.serviceSlotError)+'</p>':bookingState.serviceSlotPreview?.key===serviceSlotsKey()?"":'<p class="small">正在確認實際服務時間與資源剩餘名額…</p>')+
    '<div class="slots">'+currentBookingSlots().map(s=>'<button class="slot '+(bookingState.chosenSlot===s.time&&availableForParty(s)?"active":"")+'" data-slot="'+esc(s.time)+'" '+(!availableForParty(s)?"disabled aria-disabled=\"true\"":"")+'>'+esc(s.time)+'<small>'+(!availableForParty(s)?"名額不足・":"")+'剩 '+esc(s.available)+' 位</small></button>').join("")+'</div>'+
    menuSelectSection(t.menu_booking_mode||"DISABLED",catalogue,bookingState.bookingChosenItems,"booking")+
    bookingContactFields()+
    '<div class="staff-actionbar">'+btn("重新整理服務時段","refresh-service-slots","outline")+'</div>'+
    '<div style="margin-top:15px">'+(confirming?
     '<div class="notice" role="group" aria-label="預約二次確認"><strong>請確認預約內容</strong>'+
     '<p>門市：'+esc(t.name)+'</p><p>日期：'+esc(routeState.day)+'（台灣時間 UTC+8）</p>'+
     '<p>時間：'+esc(bookingState.chosenSlot)+'</p><p>人數：'+esc(bookingState.bookingParty)+' 位</p>'+
     '<p>預約姓名：'+esc(bookingState.bookingContactName.trim())+'</p><p>聯絡手機：'+esc(normalizeBookingPhone(bookingState.bookingContactPhone))+'</p>'+
     '<p>服務／品項：'+esc(bookingItems.map(item=>item.name).join("、")||"依門市設定")+'</p>'+
     '<p>估計價格：'+esc(estimatedCost===null?"依門市公告為準":"NT$ "+estimatedCost.toLocaleString("zh-TW"))+'</p>'+
     '<p class="small">店家條款、取消限制以店家公告為準；送出時系統將再次查核名額。</p></div>'+
     '<div class="grid">'+btn("返回修改","book-back","outline")+btn("確認預約","book-final","primary full")+'</div>':
     btn(needsConfirmation?"下一步：確認預約":"確定送出預約","book","primary full",
       !bookingState.chosenSlot||!bookingState.bookingParty||!validBookingContact()||!menuChoiceReady(t.menu_booking_mode,bookingState.bookingChosenItems,catalogue)?"disabled":""))+'</div>')+
    box("我的近期預約",renderBookings(items,true));
  }
 }else if(routeState.customerTab==="queue"){
  if(!m.queue)html=box("尚未開放取號",'<p>本企業只提供線上預約。</p>');
  else if(serviceUnitsState.unitEnabled())html=unitQueuePanel();
  else html=(customerState.customer.queue_session?.code==="REST"?'<p class="alert">門市目前休場，暫停新取號。已取得的號碼仍保留，現場人員可繼續處理。</p>':"")+
  '<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",customerState.customer.current||"—")+stat("等候組數",customerState.customer.waiting)+stat("我的號碼",live?.number||"—")+'</div>'+
   box("我的現場號碼",live?'<div class="ticket">'+esc(live.number)+'</div><p>'+tag(live.status)+'</p>'+
    '<p class="small">取號時間：'+esc(formatTaipeiCreated(live.created_at))+' ・ '+esc(live.party||1)+' 人／組</p>'+
    selectedItemsHtml(live.selected_items)+
    (live.status==="WAITING"?btn("取消取號","cancel-my-number","danger",'data-id="'+esc(live.id)+'"'):""):
    '<p class="muted">現在可在網站上取得號碼。</p>'+
    '<p>取號者：<strong>'+esc(lineState.lineDisplayName)+'</strong>（由 LINE 自動帶入）</p>'+
    '<div>'+field("本次候位人數（1～20 人）","customer-queue-party",queueState.queuePartySize,"number",'min="1" max="20" step="1" inputmode="numeric"')+'</div>'+
    '<p class="small">一張號碼牌代表一組。前方等待仍以「組數」計算，人數用於門市安排桌位／服務。</p>'+
    menuSelectSection(t.menu_queue_mode||"DISABLED",catalogue,queueState.queueChosenItems,"queue")+
    '<div style="margin-top:14px">'+btn("立即線上取號","take","primary",
    (customerState.customer.queue_session?.code==="REST"||!Number.isInteger(queueState.queuePartySize)||queueState.queuePartySize<1||queueState.queuePartySize>20||!menuChoiceReady(t.menu_queue_mode,queueState.queueChosenItems,catalogue))?"disabled":"")+'</div>');
 }else if(routeState.customerTab==="progress"){
  if(queueState.progressTicketId||crossStoreState.crossCurrentStore)html=box("即時叫號進度",'<p class="muted">以下為 <strong>'+esc(t.name)+'</strong> 的即時候位資訊。</p>'+
    '<div class="staff-actionbar">'+btn("返回我的取號","cross-back","outline")+'</div>'+queueProgressBoard());
  else html=box("我的取號",crossTicketCards());
 }else html=(bookingState.manageKind&&bookingState.manageItem?
    box("我的預約紀錄",renderBookings(items,true))+box("我的號碼紀錄",renderMyTickets(tickets)):
    crossRecords());
 if(routeState.customerTab==="home"&&serviceUnitsState.unitEnabled()&&serviceUnitsState.unitConfig?.picker&&unitList().length>1){
    const units=unitList();
    html+=box("選擇服務窗口",'<p class="small">需要不同服務窗口時，可在此挑選；一般場次不必選擇窗口。</p>'+
      (serviceUnitsState.unitConfig.grouped?'<div class="unit-category-chips">'+["全部",...[...new Set((serviceUnitsState.unitConfig.units||[]).filter(u=>u.active).map(u=>u.group||"其他"))]].map(g=>
        btn(g,"unit-category-pill",serviceUnitsState.unitCategory===(g==="全部"?"":g)?"primary":"outline",'data-category="'+esc(g==="全部"?"":g)+'"')).join("")+'</div>':'')+
      '<div class="unit-card-grid">'+units.map(u=>'<button class="unit-option" data-act="unit-home-select" data-id="'+esc(u.id)+'">'+
        '<span class="unit-option-copy"><span class="unit-option-group">'+esc(u.group||"服務")+'</span>'+
        '<strong>'+esc(u.name)+'</strong><small>查看預約場次與目前候位</small></span><span class="unit-option-trailing">›</span></button>').join("")+'</div>');
  }
  if(routeState.customerTab==="home"&&routeState.customerAnnouncements.length){
   html+=box("門市最新公告",routeState.customerAnnouncements.map(a=>
      '<article class="inset" style="margin-bottom:15px"><h3>'+esc(a.title)+'</h3>'+
      '<p style="white-space:pre-wrap">'+esc(a.body||"")+'</p>'+
      ((a.images||[]).length?'<div class="announcement-gallery" style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 0">'+
         a.images.map(u=>'<img loading="lazy" alt="'+esc(a.title)+' 門市照片" src="'+esc(u)+'" style="width:220px;height:150px;flex:none;object-fit:cover;border-radius:9px;scroll-snap-align:start">').join("")+
        '</div>':"")+'</article>').join(""));
 }
 return layout(t.name,"預約與取號・即時資料",menu,lineStatusBadge()+html);
}
