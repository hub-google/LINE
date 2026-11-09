const staffVisibleLimits=new Map();
function staffListPage(items,key,renderItem){
 const limit=Math.min(500,staffVisibleLimits.get(key)||12);
 return items.slice(0,limit).map(renderItem).join("")+(items.length>limit?
  '<div class="staff-list-more"><span>已顯示 '+Math.min(limit,items.length)+' / '+items.length+' 筆</span>'+
  btn("再顯示 12 筆","staff-show-more","outline",'data-list-key="'+esc(key)+'"')+'</div>':"");
}
function staffRender(){
 if(!authReady())return requireAuth();
 const memberships=context?.memberships||[];
 if(!staff){return box("企業員工後台",'<p class="muted">請先加入企業或由公司平台管理員核發邀請。'+(memberships.length?"請從下列企業進入：":"")+'</p>'+memberships.map(m=>'<p><a href="'+esc(route("staff",m.slug))+'">'+esc(m.name)+'（'+esc(m.role)+'）→</a></p>').join("")+
    (context?.invitations||[]).map(i=>'<div class="listline"><div>'+esc(i.tenant)+'－'+esc(i.role)+'</div>'+btn("接受邀請","accept-invite","primary",'data-id="'+esc(i.id)+'"')+'</div>').join("")); }
 if(staff.tenant?.onboarding_complete===false)staffTab="settings";
 const t=staff.tenant,openBookings=staff.pending_reservations||[],doneBookings=staff.processed_reservations||[],openTickets=staff.active_tickets||[],doneTickets=staff.processed_tickets||[],deletedBookings=staff.deleted_reservations||[],deletedTickets=staff.deleted_tickets||[];
 const r=openBookings.concat(doneBookings),q=openTickets.concat(doneTickets);
 const active=openTickets.find(x=>["CALLED","ARRIVED","ADMITTED","SERVING"].includes(x.status)),waiting=openTickets.filter(x=>x.status==="WAITING"),passed=openTickets.filter(x=>x.status==="PASSED"),held=openTickets.filter(x=>x.status==="HOLD");
 const pendingBookings=openBookings.filter(x=>x.status==="CONFIRMED"), finishedBookings=doneBookings.filter(x=>x.status==="COMPLETED");
 const role=staff.role,isManager=["OWNER","MANAGER","PLATFORM"].includes(role);
 const menu='<div class="staff-side-label">日常作業</div>'+
 nav("工作台","dashboard",staffTab,"staff")+nav("預約管理","bookings",staffTab,"staff")+
 nav("叫號管理","queue",staffTab,"staff")+nav("預約日曆","calendar",staffTab,"staff")+
 '<div class="staff-side-label">營運與設定</div>'+nav("服務單位與場次","units",staffTab,"staff")+
 nav("營運分析","analytics",staffTab,"staff")+nav("菜單及服務設定","menu",staffTab,"staff")+
 nav("員工管理","members",staffTab,"staff")+nav("多分店管理","branches",staffTab,"staff")+
 nav("企業設定","settings",staffTab,"staff")+ '<div class="staff-side-label">使用支援</div><a class="side-item guide-link" href="./merchant-center.html#guide">操作說明 ↗</a>';
 let html=(["bookings","queue"].includes(staffTab)?
  '<div class="staff-context-bar staff-context-compact"><div class="staff-history-controls">'+
  '<label for="staff-history-days">歷史紀錄</label><select class="field" id="staff-history-days" aria-label="已處理紀錄範圍">'+
  [7,14,30,90].map(n=>'<option value="'+n+'" '+(n===staffHistoryDays?"selected":"")+'>最近 '+n+' 天</option>').join("")+
  '</select></div></div>':"");

 if(staffTab==="dashboard"){
  if(isManager&&staffNoticeHealth&&(Number(staffNoticeHealth.failed||0)>0||Number(staffNoticeHealth.retry||0)>0))
    html+=box("LINE 通知異常｜需管理者處理",
      '<div class="alert">最近 7 天有 '+esc(staffNoticeHealth.retry||0)+' 筆等待重試、'+esc(staffNoticeHealth.failed||0)+
      ' 筆已達重試上限。請檢查通知資格與額度。</div>');
  html+='<div class="staff-stats grid4">'+
   stat("待報到",pendingBookings.length)+
   stat("已報到",openBookings.filter(x=>x.status==="CHECKED_IN").length)+
   stat("候位中",waiting.length)+
   stat("目前叫號",active?.number||"—")+'</div>'+
   '<div class="staff-dashboard-quick">'+
   btn("查看預約（"+openBookings.length+"）","open-bookings","primary")+
   btn("進入叫號（"+openTickets.length+"）","open-queue","outline")+'</div>'+
   '<div class="staff-dashboard-grid">'+
   box("近期待處理預約",openBookings.length?openBookings.slice(0,5).map(x=>
     '<div class="staff-dash-row"><div><strong>'+esc(x.day)+'　'+esc(x.time)+'</strong><span>'+esc(x.name)+' · '+esc(x.party||1)+' 人</span></div>'+tag(x.status)+'</div>'
   ).join(""):'<p class="muted">目前沒有待處理預約。</p>')+
   box("候位清單",waiting.length?waiting.slice(0,5).map(x=>
     '<div class="staff-dash-row"><div><strong>'+esc(x.number)+'</strong><span>'+esc(x.name)+' · '+esc(x.party||1)+' 人</span></div>'+tag(x.status)+'</div>'
   ).join(""):'<p class="muted">目前沒有候位號碼。</p>')+'</div>';
 }else if(staffTab==="analytics"){
  if(!isManager)html+=box("營運分析",'<p class="muted">僅企業管理者可查看跨日營運報表。</p>');
  else {
   const a=staffAnalytics||{},r=a.reservations||{},q=a.queue||{},days=a.daily||[];
   const ratio=(num,total)=>total?((Number(num||0)/Number(total))*100).toFixed(1)+"%":"—";
   html+=box("營運統計區間",
     '<div class="flex"><label for="analytics-days">最近天數</label><select id="analytics-days" class="field">'+
     [7,30,90].map(x=>'<option value="'+x+'" '+(x===analyticsDays?"selected":"")+'>'+x+' 天</option>').join("")+
     '</select>'+btn("下載 Excel 相容 CSV","export-analytics","outline")+'</div>')+
     '<div class="grid4">'+stat("預約筆數",r.total||0)+stat("預約取消率",ratio(r.cancelled,r.total))+
      stat("預約未到率",ratio(r.no_show,r.total))+stat("取號筆數",q.total||0)+
      stat("取號完成率",ratio(q.completed,q.total))+stat("平均取號等待",q.avg_wait_minutes==null?"尚無資料":q.avg_wait_minutes+" 分鐘")+'</div>'+
     box("每日預約與取號量",'<p class="small">依門市營業日期統計。取消率、未到率按目前狀態計算；平均等待只計已實際叫號的紀錄。</p>'+
       '<div class="scroll"><table class="rows"><thead><tr><th>日期</th><th>預約筆數</th><th>取號筆數</th></tr></thead><tbody>'+
       days.slice().reverse().map(x=>'<tr><td>'+esc(x.date).slice(0,10)+'</td><td>'+esc(x.reservations)+'</td><td>'+esc(x.tickets)+'</td></tr>').join("")+
       '</tbody></table></div>');
  }
 }else if(staffTab==="bookings"){
  const unitMatch=x=>!unitEnabled()||!bookingUnitFilter||x.service_unit_id===bookingUnitFilter;
  const visibleOpen=openBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const visibleDone=doneBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const visibleDeleted=deletedBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const card=x=>{
   
   return '<article class="staff-record '+(x.deleted_at?'staff-deleted-record':'')+'"><div class="staff-record-head"><div><div class="staff-record-title">'+'預約 '+esc(x.number||'—')+'　'+esc(x.day)+'　'+esc(x.time)+'　'+esc(x.name)+'</div>'+
   (x.unit?'<div class="small">'+esc(x.group||"")+' '+esc(x.unit)+' · '+esc(x.session||"")+'</div>':'')+
   '<div class="small">預約人數 '+esc(x.party)+' 位</div><div class="small">聯絡電話：'+(x.phone?'<a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a>':'尚未提供')+'</div>'+
   '<div class="small">送出預約時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
   (x.deleted_at?'<p class="staff-help">此預約已從顧客端隱藏；取消勾選刪除即可恢復。</p>':staffStatusPicker("reservation",x,x.day>taipei()?["CONFIRMED","CANCELLED"]:true))+staffDeletePicker("reservation",x)+
   ''+'</article>';
  };
  html+=
   (unitEnabled()?box("服務單位篩選",'<label for="staff-booking-unit-filter">顯示哪個服務單位</label>'+
      '<select id="staff-booking-unit-filter" class="field"><option value="">全部服務單位</option>'+
      (unitConfig.units||[]).map(u=>'<option value="'+esc(u.id)+'" '+(bookingUnitFilter===u.id?'selected':'')+'>'+esc(u.name)+'</option>').join("")+
      '</select>'):"")+
   box("搜尋與篩選預約",'<p class="small">此處僅篩選目前已載入的資料：跨日未結案預約，以及最近 '+staffHistoryDays+' 天已處理紀錄；完整歷史請使用下方「歷史預約查詢」，也可切換日／週／月曆查看。</p>'+
    '<div class="grid3"><div>'+field("搜尋預約編號、姓名或服務","staff-booking-search",staffBookingSearch,"search",'placeholder="輸入關鍵字"')+'</div>'+
    '<div><label for="staff-booking-date">預約日期</label><select id="staff-booking-date" class="field">'+
     [["all","全部日期"],["today","今天"],["tomorrow","明天"],["next7","未來 7 天"]].map(([id,label])=>'<option value="'+id+'" '+(staffBookingDateFilter===id?"selected":"")+'>'+label+'</option>').join("")+'</select></div>'+
    '<div><label for="staff-booking-status">預約狀態</label><select id="staff-booking-status" class="field">'+
     [["all","全部狀態"],["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]].map(([id,label])=>'<option value="'+id+'" '+(staffBookingStatusFilter===id?"selected":"")+'>'+label+'</option>').join("")+'</select></div></div>'+
    '<div class="staff-actionbar">'+btn("套用篩選","apply-booking-filter","primary")+
    btn("清除篩選","clear-booking-filter","outline")+
    (isManager?btn("匯出篩選結果 CSV","export-bookings","secondary"):"")+'</div>')+
   '<div class="grid4" style="margin-bottom:16px">'+stat("待處理預約",openBookings.length)+stat("待報到",pendingBookings.length)+
    stat("已報到未結案",openBookings.filter(x=>x.status==="CHECKED_IN").length)+stat("已處理預約",doneBookings.length)+'</div>'+
   box("預約管理方式",'<p class="muted">只要沒有標記完成、未到或取消，預約就不因跨過午夜而消失。店員可直接勾選狀態，也可重新選擇修正手誤。</p>'+
    '<p class="staff-help">'+(unitConfig?.linked?
     '已啟用連動：報到後會為此場次建立一張候診票券，重複報到不會重複發號。':
     '預約獨立管理：報到不會產生叫號號碼。')+'未來預約僅可取消或恢復。</p>'+
    '<div class="staff-actionbar">'+
    (lastStaffChange&&lastStaffChange.slug===slug?btn("還原上一步","undo-staff","outline"):"")+
    '<a class="btn outline" href="./poster.html?merchant='+encodeURIComponent(slug)+'&type=reserve" target="_blank" rel="noopener noreferrer">製作預約 QR 立牌</a></div>')+
   box("待處理預約（"+visibleOpen.length+" / "+openBookings.length+" 筆）",visibleOpen.length?staffListPage(visibleOpen,"booking-open",card):'<p class="muted">目前沒有未結案預約。</p>')+
   box("已處理預約（最近 "+staffHistoryDays+" 天，"+visibleDone.length+" / "+doneBookings.length+" 筆）",'<p class="staff-help">包含已完成、未到、已取消。此區仍可修正狀態，資料依處理時間排序。</p>'+
    (visibleDone.length?staffListPage(visibleDone,"booking-done",card):'<p class="muted">選定範圍內還沒有已處理預約。</p>'))+
   box("已刪除預約（最近 "+staffHistoryDays+" 天，"+visibleDeleted.length+" / "+deletedBookings.length+" 筆）",
    '<p class="staff-help">顧客不會看到這些預約，也不會收到刪除通知。取消勾選即可恢復。</p>'+
    (visibleDeleted.length?staffListPage(visibleDeleted,"booking-deleted",card):'<p class="muted">目前沒有已刪除預約。</p>'))+
   box("完整預約歷史",'<p class="small">查詢本店全部歷史預約，不受工作清單「最近 7～90 天／每類最多 500 筆」限制。本區僅提供查閱，不修改狀態，也不發送 LINE 通知。</p>'+
    '<div class="grid3"><div>'+field("姓名、編號、參考碼、服務","historical-booking-search",historicalBookingQuery,"search",'maxlength="100"')+'</div>'+
    '<div>'+field("預約日期起","historical-booking-from",historicalBookingStart,"date")+'</div>'+
    '<div>'+field("預約日期迄","historical-booking-to",historicalBookingEnd,"date")+'</div></div>'+
    '<div class="grid"><div><label for="historical-booking-status">預約狀態</label><select id="historical-booking-status" class="field">'+
      [["ALL","全部狀態"],["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]].map(([v,label])=>
       '<option value="'+v+'" '+(historicalBookingStatus===v?"selected":"")+'>'+label+'</option>').join("")+'</select></div>'+
    '<div><label for="historical-booking-deleted">顧客端隱藏狀態</label><select id="historical-booking-deleted" class="field">'+
     [["active","未刪除"],["deleted","已刪除"],["all","全部（含已刪除）"]].map(([v,label])=>
      '<option value="'+v+'" '+(historicalBookingDeleted===v?"selected":"")+'>'+label+'</option>').join("")+'</select></div></div>'+
    '<div class="staff-actionbar">'+btn("查詢完整歷史","historical-search","primary")+
      btn("重設歷史篩選","historical-reset","outline")+
      (isManager&&historicalBookingResult?btn("匯出完整搜尋結果 CSV","historical-export","secondary"):"")+
      '</div><p class="small">匯出檔案會依目前搜尋條件整理，單次最多匯出 20,000 筆；超過限制須分日期區間下載，絕不默默截斷。</p>'+historyBookingResultHtml())+numberSettingsPanel("booking",t,isManager);
 }else if(staffTab==="calendar"){
   html+=bookingCalendarPanel();
  }else if(staffTab==="queue"&&unitEnabled()){
   html+=unitStaffQueuePanel();
 }else if(staffTab==="queue"){
  
  const card=x=>'<article class="staff-record '+(x.deleted_at?'staff-deleted-record':'')+'"><div class="staff-record-head"><div><div class="staff-record-title">'+esc(x.number)+'　'+esc(x.name)+'</div>'+
   '<div class="small">'+esc(x.day)+' ・ '+esc(x.party||1)+' 人／組 ・ '+esc(x.source==="RESERVATION"?"預約報到":"現場取號")+
   (x.reservation_id?" ・ 已連動預約":"")+'</div>'+
   '<div class="small">取號時間：'+esc(formatTaipeiCreated(x.created_at))+' ・ '+esc(x.party||1)+' 人／組</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+(x.deleted_at?'<p class="staff-help">此號碼已從顧客端隱藏；取消勾選刪除即可恢復。</p>':staffStatusPicker("ticket",x,true))+
   (isManager&&!x.deleted_at&&x.status==="WAITING"?'<div class="staff-actionbar">'+btn("指定叫號","call-selected","secondary",'data-id="'+esc(x.id)+'"')+'</div>':"")+
   staffDeletePicker("ticket",x)+'</article>';
  html+='<div class="grid4" style="margin-bottom:16px">'+stat("正在叫號",active?.number||"—")+stat("候位中",waiting.length)+
   stat("已過號",passed.length)+stat("保留中",held.length)+stat("已結束",doneTickets.length)+'</div>'+
   box("叫號操作",'<p class="muted">仍在候位的跨日號碼會繼續排隊。號碼狀態可直接勾選與更正；已叫號後可分別標記「已到場」及「已進場」，不代表服務已完成。</p>'+
    '<div class="staff-actionbar">'+btn("叫下一位","call","primary",(!waiting.length||!!active||!t.modules.calling?"disabled":""))+
    btn("再叫一次","recall","outline",(!active||active.status!=="CALLED"?"disabled":"")+' data-id="'+esc(active?.id||"")+'"')+
    (lastStaffChange&&lastStaffChange.slug===slug?btn("還原上一步","undo-staff","secondary"):"")+
    '<a class="btn outline" href="./board.html?merchant='+encodeURIComponent(slug)+'" target="_blank" rel="noopener noreferrer">電視即時叫號看板</a>'+
    '<a class="btn outline" href="./poster.html?merchant='+encodeURIComponent(slug)+'&type=queue" target="_blank" rel="noopener noreferrer">製作現場取號 QR 立牌</a></div>'+
    '<p class="staff-help">叫號通知使用票券識別碼，避免跨天同號誤通知。已發出的 LINE 訊息無法撤回。</p>')+
   box("取號場次管理",
     '<p class="small">目前：<strong>'+esc(queueSessionName(staff.queue_session?.code||"MORNING"))+'</strong>。休場只暫停新的取號，先前的號碼仍可繼續叫號；切場不會重設流水號。</p>'+
     '<div class="staff-actionbar">'+
     [["MORNING","早場"],["AFTERNOON","午場"],["EVENING","晚場"],["REST","休場"]].map(([code,name])=>
       btn(name,(staff.queue_session?.code||"MORNING")===code?"noop-queue-session":"set-queue-session",
         (staff.queue_session?.code||"MORNING")===code?"primary":"outline",
         'data-session-code="'+code+'"')).join("")+'</div>')+
   box("未結案號碼牌（"+openTickets.length+" 筆）",openTickets.length?staffListPage(openTickets,"ticket-open",card):'<p class="muted">目前沒有未結案號碼牌。</p>')+
   box("已結束號碼牌（最近 "+staffHistoryDays+" 天，"+doneTickets.length+" 筆）",doneTickets.length?staffListPage(doneTickets,"ticket-done",card):'<p class="muted">沒有已結束的號碼牌。</p>')+
   box("已刪除號碼牌（最近 "+staffHistoryDays+" 天，"+deletedTickets.length+" 筆）",
    '<p class="staff-help">刪除不是取消：顧客端不再顯示，也不會發送 LINE 通知；取消勾選即可恢復。</p>'+
    (deletedTickets.length?staffListPage(deletedTickets,"ticket-deleted",card):'<p class="muted">目前沒有已刪除號碼牌。</p>'))+numberSettingsPanel("queue",t,isManager);
 }else if(staffTab==="menu"){
  const items=staff.menu_items||[],selected=items.find(x=>x.id===editingMenuItemId)||null;
  html+=box("預約／抽號選擇規則",
   '<p class="muted">預約與現場取號可分別設定；必填時顧客要先選好至少一項餐點或服務，才可以送出。</p>'+
   '<div class="grid"><div><label for="menu-book-mode">線上預約</label>'+menuModeSelect("menu-book-mode",t.menu_booking_mode||"DISABLED")+
   '</div><div><label for="menu-queue-mode">現場取號</label>'+menuModeSelect("menu-queue-mode",t.menu_queue_mode||"DISABLED")+'</div></div>'+
   (isManager?'<div class="staff-actionbar">'+btn("儲存選擇規則","save-menu-modes","primary")+'</div>':'<p class="small">僅管理員可修改設定。</p>'))+
   box("菜單／服務項目（"+items.length+" 項）",
    '<p class="muted">可設定餐點或服務、說明、價格、排序及是否上架。歷史預約會保留當時選擇的項目。</p>'+
    (items.length?'<div class="scroll"><table class="rows"><thead><tr><th>類型</th><th>名稱與說明</th><th>價格</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+
      items.map(item=>'<tr><td>'+esc(item.kind==="MENU"?"餐點":"服務")+'</td><td><strong>'+esc(item.name)+'</strong>'+
       (item.description?'<div class="small">'+esc(item.description)+'</div>':'')+'</td>'+
       '<td>'+esc(menuPrice(item)||"未設定")+'</td><td>'+esc(item.active?"上架中":"已停用")+'</td><td>'+
       (isManager?btn("編輯","menu-edit","outline",'data-id="'+esc(item.id)+'"')+' '+
        btn(item.active?"停用":"重新上架","menu-toggle","secondary",'data-id="'+esc(item.id)+'"'):'—')+
       '</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">尚未建立餐點或服務。</p>'))+
   (isManager?box(selected?"修改餐點／服務":"新增餐點／服務",
    '<div class="grid"><div><label for="menu-kind">類型</label><select class="field" id="menu-kind">'+
    [["MENU","餐點"],["SERVICE","服務"]].map(([v,label])=>'<option value="'+v+'" '+((selected?.kind||"MENU")===v?"selected":"")+'>'+label+'</option>').join("")+
    '</select>'+field("名稱","menu-name",selected?.name||"")+
    field("價格（NT$，可留空）","menu-price",selected?.price??"","number",'min="0" step="0.01"')+'</div>'+
    '<div>'+field("說明（選填）","menu-description",selected?.description||"")+
    field("排序（數字越小越前面）","menu-order",selected?.sort_order??0,"number",'min="-9999" max="9999"')+
    '<label class="checklist"><input type="checkbox" id="menu-active" '+(selected?.active===false?"":"checked")+'> 開放顧客選擇</label></div></div>'+
    '<div class="staff-actionbar">'+btn(selected?"儲存修改":"新增項目","menu-save","primary")+
     (selected?btn("取消編輯","menu-edit-clear","outline"):"")+'</div>'):"");
   const resources=staff.resourceContext?.resources||[],rules=staff.resourceContext?.service_rules||[];
  const services=items.filter(x=>x.kind==="SERVICE");
  const firstService=services[0],firstRule=rules.find(x=>x.item_id===firstService?.id);
  html+=(unitEnabled()?"":box("預約資源（員工／房間／設備）",
   '<p class="small">同一資源在服務時長＋緩衝時間內不可重複預約；停用資源不會改變既有預約。</p>'+
   (resources.length?'<div class="scroll"><table class="rows"><thead><tr><th>類型</th><th>名稱</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+
     resources.map(x=>'<tr><td>'+esc(({STAFF:"員工",ROOM:"房間",EQUIPMENT:"設備"})[x.kind]||x.kind)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.active?"啟用":"停用")+'</td><td>'+
        (isManager?btn(x.active?"停用":"啟用","resource-toggle","outline",'data-id="'+esc(x.id)+'"'):"—")+'</td></tr>').join("")+
     '</tbody></table></div>':'<p class="small">尚未建立資源；可以先建立服務項目，之後再指派員工或房間。</p>')+
   (isManager?'<div class="grid"><div>'+field("資源名稱","resource-name","")+'</div><div><label for="resource-kind">類型</label><select class="field" id="resource-kind">'+
      [["STAFF","員工"],["ROOM","房間"],["EQUIPMENT","設備"]].map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join("")+
      '</select></div></div>'+btn("新增資源","resource-save","primary"):"")))+
    box("服務時長與緩衝（預約資源排程）",
     '<p class="small">'+(unitEnabled()?'服務單位在「企業設定」統一管理。':'可指定每項服務的時間及一個員工／房間／設備。')+'服務時間與緩衝仍沿用既有預約資源排程。</p>'+
     (services.length?'<div class="scroll"><table class="rows"><thead><tr><th>服務</th><th>分鐘＋緩衝</th><th>指定資源</th></tr></thead><tbody>'+
       services.map(x=>{const rule=rules.find(z=>z.item_id===x.id);const res=resources.find(z=>z.id===rule?.resource_id);
         return '<tr><td>'+esc(x.name)+'</td><td>'+esc(rule?rule.duration_minutes+" + "+rule.buffer_minutes:"預設時段 "+t.slot_minutes+" + 0")+'</td><td>'+esc(res?.name||"未指派")+'</td></tr>'}).join("")+
       '</tbody></table></div>':'<p class="small">請先在上方新增「服務」項目，再設定專屬時長。</p>')+
     (isManager&&services.length?
       '<div class="grid"><div><label for="rule-service">選擇服務</label><select id="rule-service" class="field">'+
        services.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("")+'</select>'+
        field("服務時間（分鐘）","rule-duration",firstRule?.duration_minutes??t.slot_minutes,"number",'min="5" max="480"')+
        field("緩衝時間（分鐘）","rule-buffer",firstRule?.buffer_minutes??0,"number",'min="0" max="120"')+
        '</div><div><label for="rule-resource">指定服務資源</label><select id="rule-resource" class="field"><option value="">不指定</option>'+
        resources.filter(x=>x.active||x.id===firstRule?.resource_id).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===firstRule?.resource_id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+
        '</select><label class="checklist"><input type="checkbox" id="rule-show-duration" '+(firstRule?.show_duration_to_customer===false?"":"checked")+'>可向顧客顯示服務時長</label></div></div>'+
        '<div class="staff-actionbar">'+btn("儲存服務排程","service-rule-save","primary")+'</div>':""));
 }else if(staffTab==="members"){
  html+=box("已加入的員工",'<div class="scroll"><table class="rows"><tr><th>帳號</th><th>角色</th></tr>'+ (staff.members||[]).map(m=>'<tr><td>'+esc(m.email||('驗證員工（Auth ID '+String(m.user_id||'').slice(0,8)+'）'))+'</td><td>'+esc(m.role)+'</td></tr>').join("")+'</table></div>')+
  box("待接受邀請",(staff.invites||[]).map(i=>'<div class="listline"><span>'+esc(i.email)+'</span>'+tag(i.role)+'</div>').join("")||'<p class="muted">尚無邀請</p>')+
  (isManager?box("邀請企業員工",field("員工 Email","invite-email","","email")+'<label>角色</label><select id="invite-role" class="field"><option value="STAFF">員工</option><option value="MANAGER">管理者</option><option value="OWNER">負責人</option></select><div style="margin-top:15px">'+btn("送出邀請","invite-staff","primary")+'</div><p class="small">員工使用同一 Email 註冊、驗證後，登入即可接受邀請。</p>'):"");
 }else if(staffTab==="branches"){
   html+=box("多分店／總店管理",
     '<p class="small">同一位負責人可以把自己擁有的門市加入總店群組。各分店仍維持獨立預約、編號、員工權限與顧客資料。</p>'+
     (role==="OWNER"||role==="PLATFORM"?field("總店／品牌名稱","group-name","")+
       '<div style="margin-top:10px">'+btn("建立總店群組","create-business-group","primary")+'</div>':""));
   html+=businessGroups.length?businessGroups.map(g=>box(g.name,
     '<div class="grid4">'+stat("分店數",(g.branches||[]).length)+
     stat("今日預約",(g.branches||[]).reduce((n,b)=>n+Number(b.today_reservations||0),0))+
     stat("現場候位",(g.branches||[]).reduce((n,b)=>n+Number(b.waiting||0),0))+'</div>'+
     '<div class="scroll"><table class="rows"><thead><tr><th>門市</th><th>狀態</th><th>今日預約</th><th>候位</th><th>操作</th></tr></thead><tbody>'+
     (g.branches||[]).map(b=>'<tr><td><a href="'+esc(route("staff",b.slug))+'">'+esc(b.name)+'</a></td><td>'+tag(b.status)+'</td><td>'+esc(b.today_reservations)+'</td><td>'+esc(b.waiting)+'</td><td>'+btn("移出總店","detach-business-branch","outline",'data-group="'+esc(g.id)+'" data-slug="'+esc(b.slug)+'"')+'</td></tr>').join("")+
     '</tbody></table></div>'+
     '<div class="grid"><div>'+field("加入既有門市網址代碼","branch-slug-"+g.id,"")+'</div><div class="staff-actionbar">'+
     btn("加入門市","attach-business-branch","primary",'data-group="'+esc(g.id)+'"')+'</div></div>')).join("") :
     box("尚無總店群組",'<p class="muted">建立總店群組後，即可加入由你擔任 OWNER 的其他門市。</p>');
 }else if(staffTab==="units"){
  html+='<div class="universal-staff-head"><div><h2>服務單位與場次</h2><p>同一個店家網址，同時適用醫院、餐飲、美髮與各式櫃台。</p></div>'+
   '<a class="btn primary" href="./template.html" target="_blank" rel="noopener noreferrer">查看通用公版預覽 ↗</a></div>'+
   unitSettingsPanel(isManager);
 }else if(staffTab==="settings"){
  const policy=staff.bookingPolicy||{};
  const selectedFlag=staffCustomerBook.find(x=>x.id===customerFlagSelected)||staffCustomerBook[0]||null;
  if(selectedFlag)customerFlagSelected=selectedFlag.id;
  const weekdayChecks=[["0","週日"],["1","週一"],["2","週二"],["3","週三"],["4","週四"],["5","週五"],["6","週六"]]
      .map(([day,title])=>'<label class="checklist"><input type="checkbox" class="policy-closed-day" value="'+day+'" '+((policy.closed_weekdays||[]).includes(Number(day))?"checked":"")+'> '+title+'</label>').join("");
  const serviceModules=t.modules||{};
  html+=box("顧客服務開放設定",
    '<p class="muted">店家可自行決定提供線上預約、現場取號，或同時提供兩種服務。關閉後顧客不再能建立新預約／新號碼，原有紀錄與已發出的號碼仍保留。</p>'+
    (isManager?
      '<div class="grid"><label class="checklist"><input id="set-service-reservation" type="checkbox" '+(serviceModules.reservation?'checked':'')+'> 開放線上預約</label>'+
      '<label class="checklist"><input id="set-service-queue" type="checkbox" '+(serviceModules.queue?'checked':'')+'> 開放現場取號</label></div>'+
      '<p class="small">只勾預約＝僅預約；只勾取號＝僅取號；都勾＝兩種服務；都不勾＝暫停接收新顧客。</p>'+
      '<div class="staff-actionbar">'+btn("儲存服務開關","save-service-modes","primary")+'</div>':
      '<p class="small">目前：預約 '+(serviceModules.reservation?'已開放':'未開放')+'，現場取號 '+(serviceModules.queue?'已開放':'未開放')+'。只有店家管理者可以修改。</p>'))+
  box("企業基本設定",!isManager?'<p class="muted">只有管理者可以修改設定。</p>':
   merchantProfileFields("set",t)+
   '<div class="merchant-profile-actions">'+btn("儲存企業設定","update-settings","primary")+'</div>')+
  (isManager?box("候位保留規則",
     '<p class="small">保留期間不會叫號；到期後下一次叫號時自動恢復。可設定回原順位或隊尾，原票券號碼不變。</p>'+
     '<div class="grid3"><div>'+field("每次保留分鐘數","hold-minutes",staff.queue_hold_policy?.hold_minutes??20,"number",'min="1" max="120"')+
     '</div><div>'+field("最多保留次數","hold-limit",staff.queue_hold_policy?.max_holds??2,"number",'min="0" max="10"')+
     '</div><div><label for="hold-return-mode">恢復後順位</label><select id="hold-return-mode" class="field">'+
     [["END","返回隊尾"],["ORIGINAL","返回原順位"]].map(([v,name])=>'<option value="'+v+'" '+((staff.queue_hold_policy?.return_mode||"END")===v?"selected":"")+'>'+name+'</option>').join("")+
     '</select></div></div><div class="staff-actionbar">'+btn("儲存候位保留規則","save-hold-policy","primary")+'</div>'):"")+
   (isManager?box("預約營業日與休息設定",
      '<p class="small">選擇每週固定公休日；特殊日期用西元日期，例如 2026-11-15,2026-11-22。既有預約不會被自動取消。</p>'+
      '<label>每週固定公休日</label><div class="grid">'+weekdayChecks+'</div>'+
      field("特殊休假日期（逗號分隔）","policy-closed-dates",(policy.closed_dates||[]).join(","))+
      '<div class="grid"><div>'+field("每日休息開始（可留空）","policy-break-start",policy.break_start||"","time")+
      field("最晚提前預約分鐘數","policy-notice",policy.min_notice_minutes??0,"number",'min="0" max="10080"')+'</div>'+
      '<div>'+field("每日休息結束（可留空）","policy-break-end",policy.break_end||"","time")+'</div></div>'+
      '<div style="margin-top:14px">'+btn("儲存預約營業規則","save-booking-policy","primary")+'</div>'):"")+
  (isManager?box("預約送出前二次確認",
    '<p class="small">預設開啟。顧客會先看到預約內容，再決定是否真正送出。</p>'+
    '<label class="checklist"><input id="policy-confirm-required" type="checkbox" '+(policy.require_confirmation!==false?"checked":"")+'>送出前顯示確認卡</label>'+
    '<div style="margin-top:14px">'+btn("儲存二次確認設定","save-booking-confirmation","primary")+'</div>'):"")+
  (isManager?box("顧客簿、未到店紀錄與黑名單",
    '<p class="small">本店顧客紀錄獨立，未驗證的同名或電話不會自動合併。黑名單可只記錄警示，也可選擇禁止新的預約。</p>'+
    (staffCustomerBook.length?
      '<div class="scroll"><table class="rows"><tr><th>顧客</th><th>歷史預約</th><th>未到店</th><th>狀態</th></tr>'+
      staffCustomerBook.slice(0,40).map(x=>'<tr><td>'+esc(x.name||"LINE 顧客")+'</td><td><a class="customer-history-link" href="#customer-history" data-customer-history-id="'+esc(x.id)+'" aria-label="查看 '+esc(x.name||"LINE 顧客")+' 的所有歷史預約">'+esc(x.bookings)+' 筆</a></td><td>'+esc(x.no_shows)+'</td><td>'+esc(x.block_new_bookings?"禁止新預約":x.blacklisted?"觀察名單":"正常")+'</td></tr>').join("")+'</table></div>'+
      '<label for="customer-flag-picker">選擇顧客</label><select id="customer-flag-picker" class="field">'+
        staffCustomerBook.map(x=>'<option value="'+esc(x.id)+'" '+(selectedFlag?.id===x.id?"selected":"")+'>'+esc(x.name||"LINE 顧客")+' · '+esc(x.bookings)+' 筆預約'+(Number(x.no_shows)>0?" · 未到 "+esc(x.no_shows)+" 次":"")+'</option>').join("")+'</select>'+
      field("顧客標籤（逗號分隔，最多 10 個）","customer-flag-tags",(selectedFlag?.tags||[]).join("、"))+
      '<label for="customer-flag-notes">服務備註（僅店家可看）</label><textarea class="field" id="customer-flag-notes" rows="3" maxlength="2000">'+esc(selectedFlag?.notes||"")+'</textarea>'+
      '<label class="checklist"><input id="customer-flag-blacklisted" type="checkbox" '+(selectedFlag?.blacklisted?"checked":"")+'>標記黑名單／未到店警示</label>'+
      '<label class="checklist"><input id="customer-flag-block" type="checkbox" '+(selectedFlag?.block_new_bookings?"checked":"")+'>禁止此顧客建立新的預約</label>'+
      '<div class="staff-actionbar">'+btn("儲存顧客標籤與限制","save-customer-flags","primary")+'</div>':
      '<p class="muted">本店目前還沒有可建立顧客簿的預約資料。</p>')):"")+
  (isManager?box("門市公告與照片",
    '<p class="small">可以發布公告、價目表連結及最多 8 張可橫向滑動的照片。請使用可公開瀏覽的 HTTPS 圖片網址，勿貼個資或私密連結。</p>'+
    (staffAnnouncements.length?staffAnnouncements.map(a=>
      '<div class="listline"><span><strong>'+esc(a.title)+'</strong>　'+tag(a.active?"公開":"未公開")+'</span>'+
      '<span>'+btn("編輯","announcement-edit","outline",'data-id="'+esc(a.id)+'"')+
      btn(a.active?"暫停公開":"重新公開","announcement-toggle","outline",'data-id="'+esc(a.id)+'" data-active="'+esc(a.active)+'"')+'</span></div>').join(""):'<p class="muted">目前沒有公告。</p>')+
    '<div style="margin-top:12px">'+field("公告標題","announcement-title",(staffAnnouncements.find(a=>a.id===announcementEditId)?.title)||"")+
    '<label for="announcement-body">公告內容</label><textarea class="field" id="announcement-body" rows="4" maxlength="2000">'+esc(staffAnnouncements.find(a=>a.id===announcementEditId)?.body||"")+'</textarea>'+
    '<label for="announcement-images">照片網址（每行一張，最多 8 張）</label><textarea class="field" id="announcement-images" rows="4">'+esc((staffAnnouncements.find(a=>a.id===announcementEditId)?.images||[]).join("\n"))+'</textarea>'+
    '<label class="checklist"><input type="checkbox" id="announcement-active" '+(staffAnnouncements.find(a=>a.id===announcementEditId)?.active===false?"":"checked")+'>發布至顧客首頁</label>'+
    '<div class="staff-actionbar">'+btn(announcementEditId?"儲存修改":"發布公告","announcement-save","primary")+
       (announcementEditId?btn("取消編輯","announcement-edit-cancel","outline"):"")+'</div></div>'):"")+
  box("LINE 官方帳號串接",
    '<p>目前通知來源：<strong>'+(lineConfig?.merchantOaConnected?"商家自己的 LINE OA":"平台 LINE OA")+'</strong></p>'+
    '<p class="small">若要使用自己的 LINE 官方帳號，請確認登入服務與訊息通知使用同一組 LINE 管理者設定；沒有自有官方帳號也可使用平台提供的服務。</p>'+
    (lineConfig?.merchantOaConnected?
     '<p>已連接 LINE OA：<strong>'+esc(lineConfig.botBasicId||"")+'</strong></p>':"")+
    (isManager?
     '<div class="grid"><div>'+field("LINE 登入應用程式編號（LIFF ID）","own-oa-liff",lineConfig?.merchantOaConnected?lineConfig.liffId:"")+
      field("官方帳號存取憑證（Channel Access Token）","own-oa-token","","password",'autocomplete="new-password"')+
     '</div><div>'+field("官方帳號驗證金鑰（Channel Secret）","own-oa-secret","","password",'autocomplete="new-password"')+
     '<p class="small">Channel Secret 需為 32 位十六進位字元。憑證會由系統向 LINE 驗證，成功後將安全保存，後台不會再次顯示完整憑證。</p></div></div>'+
     '<div class="staff-actionbar">'+btn("驗證並連接自有 LINE OA","connect-own-oa","primary")+
       (lineConfig?.merchantOaConnected?btn("解除自有 OA 綁定","disconnect-own-oa","outline"):"")+'</div>'+
     '<p class="small">請在 LINE 官方帳號管理介面設定下列訊息回傳網址（Webhook URL）：</p>'+
     '<p class="small" style="overflow-wrap:anywhere">'+esc(LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(slug))+'</p>'+
     btn("複製訊息回傳網址","copy-own-oa-webhook","outline")
     :'<p class="small">僅企業管理者可設定自己的 LINE OA。</p>'))+
  (isManager?box("排隊怪獸店家搜尋",t.onboarding_complete===false?
 '<p>填寫店名、電話、地址與分類並儲存後，門市會自動公開在排隊怪獸的搜尋清單。</p>':
 '<p>你可以決定門市是否顯示在排隊怪獸的公開搜尋清單。</p>'+
    '<label class="checklist"><input id="directory-enabled" type="checkbox" '+(t.directory_enabled?'checked ':'')+'>允許在排隊怪獸平台公開搜尋我的門市</label>'+
    '<p class="small">新門市預設勾選公開；若取消勾選，仍可透過專屬預約網址使用服務。</p>'+
    '<p class="small">通知將依本店已連接的 LINE 官方帳號設定提供。</p>'+
    '<div style="margin-top:12px">'+btn("儲存公開設定","save-directory","primary")+'</div>'):"")+
  box("唯一顧客網址（同時支援電腦與手機）",'<div><a href="'+esc(customerUrl(slug)||route("customer",slug))+'" target="_blank" rel="noopener">'+esc(customerUrl(slug)||new URL(route("customer",slug),location.href).href)+'</a></div><p class="spacer"></p>'+btn("複製顧客連結","copy-customer","outline"));
 }
 return layout(t.onboarding_complete===false?"填寫店家資料":t.name,"企業員工營運後台",menu,html);
}

