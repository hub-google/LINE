const unitEnabled=()=>unitConfig?.multi===true;
function unitList(){
 let data=(unitConfig?.units||[]).filter(x=>x.active);
 if(unitCategory&&unitConfig?.grouped)data=data.filter(x=>(x.group||"其他")===unitCategory);
 return data;
}
// Keep customer options consistent with the server's actual availability rules.
// Queue tickets open three hours before a session starts and close at its end.
// Reservations must be made before the session begins and need enough seats.
function unitSessionAvailable(s,mode=customerTab){
 if(!s?.active||!(unitConfig?.units||[]).some(u=>u.id===s.unit_id&&u.active))return false;
 if(mode!=="queue"&&mode!=="reserve")return true;
 const starts=Date.parse(s.date+"T"+s.start+":00+08:00");
 const ends=Date.parse(s.date+"T"+s.end+":00+08:00");
 const now=Date.now();
 if(!Number.isFinite(starts)||!Number.isFinite(ends))return false;
 if(mode==="queue")return s.date===taipei()&&now>=starts-3*60*60*1000&&now<=ends;
 return starts>now&&s.date>=taipei()&&
   Number(s.capacity)-Number(s.booked||0)>=Math.max(1,Number(bookingParty)||1);
}
function sessionsOf(unitId=unitChoice,mode=customerTab){
 return (unitConfig?.sessions||[]).filter(s=>s.unit_id===unitId&&unitSessionAvailable(s,mode));
}
function availableUnits(mode=customerTab){
 return unitList().filter(u=>sessionsOf(u.id,mode).length>0);
}
function selectedUnitSession(mode=customerTab){
 const units=availableUnits(mode),actual=units.find(u=>u.id===unitChoice)||units[0];
 const ss=sessionsOf(actual?.id,mode);
 return ss.find(s=>s.id===unitSessionChoice)||ss[0]||null;
}
function unitBookingFingerprint(s,party){
 return JSON.stringify({shop:slug,day,session:s?.id||"",party,
  name:bookingContactName.trim(),phone:normalizeBookingPhone(bookingContactPhone),
  items:[...bookingChosenItems].sort()});
}
function unitNameForSession(sid){
 const s=(unitConfig?.sessions||[]).find(x=>x.id===sid),u=(unitConfig?.units||[]).find(x=>x.id===s?.unit_id);
 return u?.name||"服務單位";
}
function unitChooseHtml(mode=customerTab){
 const units=availableUnits(mode);
 const groups=[...new Set((unitConfig?.units||[]).filter(u=>u.active&&sessionsOf(u.id,mode).length).map(u=>u.group||"其他"))];
 const actual=units.find(x=>x.id===unitChoice)||units[0];
 const sessions=sessionsOf(actual?.id,mode),selected=selectedUnitSession(mode);
 return '<div class="unit-form-header"><h3>選擇服務單位</h3><span>'+units.length+' 個選項</span></div>'+
   (unitConfig?.grouped&&groups.length?'<div class="unit-category-chips">'+["全部",...groups].map(g=>
       btn(g,"unit-category-pill",unitCategory===(g==="全部"?"":g)?"primary":"outline",
        'data-category="'+esc(g==='全部'?'':g)+'"')).join("")+'</div>':'')+
   (units.length?'<div class="unit-card-grid">'+units.map(u=>{
     const soon=sessionsOf(u.id,mode)[0];
     return '<button type="button" class="unit-option '+(u.id===actual?.id?'selected':'')+
       '" data-act="unit-choose" data-id="'+esc(u.id)+'" aria-pressed="'+String(u.id===actual?.id)+'">'+
       '<span class="unit-option-copy"><span class="unit-option-group">'+esc(u.group||"服務")+'</span>'+
       '<strong>'+esc(u.name)+'</strong><small>'+esc(soon.name+" "+soon.start+"–"+soon.end)+'</small></span>'+
       '<span class="unit-option-trailing">'+(u.id===actual?.id?'✓':'›')+'</span></button>';
   }).join("")+'</div>'+
   '<label for="unit-session">開放場次</label><select class="field" id="unit-session">'+
    sessions.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?.id?'selected':'')+'>'+
       esc(s.name)+' '+esc(s.start)+'–'+esc(s.end)+
       (mode==="reserve"?' · 剩 '+esc(Math.max(0,s.capacity-Number(s.booked||0)))+' 位':"")+
       '</option>').join("")+'</select>':
   '<p class="notice">'+(mode==="queue"?"目前沒有開放取號的場次，請稍後再查看。":"目前沒有可預約的場次或名額，請選擇其他日期。")+'</p>');
}
function unitBookingPanel(){
 const s=selectedUnitSession();
 const available=s&&Number(s.booked||0)+Number(bookingParty)<=s.capacity;
 const confirming=customer?.booking_confirmation_required!==false&&unitConfirmKey===unitBookingFingerprint(s,Number(bookingParty));
 return box("選擇服務單位與預約場次",
   '<p class="small">所有服務單位共用這個網站，僅顯示目前有開放的場次。</p>'+
   field("預約日期","customer-day",day,"date",'min="'+taipei()+'" max="'+dateInThirtyDays()+'"')+
   unitChooseHtml("reserve")+
   '<div class="grid"><div>'+field("本次人數","customer-party",bookingParty||1,"number",'min="1" max="20"')+'</div></div>'+
   menuSelectSection(customer?.tenant?.menu_booking_mode||"DISABLED",customer?.menu_items||[],bookingChosenItems,"booking")+
   '<div class="grid"><div>'+field("預約姓名","customer-book-name",bookingContactName,"text",'maxlength="60" required autocomplete="name"')+'</div>'+
   '<div>'+field("聯絡手機","customer-book-phone",bookingContactPhone,"tel",'required inputmode="tel" autocomplete="tel"')+'</div></div>'+
   '<p class="small">預約場次代表可報到的時段，實際開始服務時間依現場叫號與人員安排。</p>'+
   (confirming?'<div class="notice"><strong>確認預約資訊</strong><p>'+esc(unitNameForSession(s?.id))+' · '+esc(s?.name||"")+
    '</p><p>日期：'+esc(day)+' '+esc(s?.start||"")+'–'+esc(s?.end||"")+'</p>'+
    '<p>姓名：'+esc(bookingContactName.trim())+'，'+esc(bookingParty)+' 位</p></div>':'')+
   '<div class="staff-actionbar">'+btn(confirming?"確認送出預約":"下一步：確認預約",
    confirming?"unit-book-final":customer?.booking_confirmation_required===false?"unit-book-final":"unit-book-review",
    "primary full",(!available||!validBookingContact()||
    !menuChoiceReady(customer?.tenant?.menu_booking_mode||"DISABLED",bookingChosenItems,customer?.menu_items||[])?'disabled':''))+
    (confirming?btn("返回修改","unit-book-back","outline"):"")+'</div>')+
   box("我的近期預約",renderBookings(customer?.my_reservations||[],true));
}
function unitQueuePanel(){
 const s=selectedUnitSession();
 return box("選擇服務單位與取號場次",
   '<p class="small">每個場次獨立叫號，取號後可從「我的取號」查看實際順序。</p>'+
   unitChooseHtml("queue")+
   field("本次候位人數","customer-queue-party",queuePartySize||1,"number",'min="1" max="20"')+
   menuSelectSection(customer?.tenant?.menu_queue_mode||"DISABLED",customer?.menu_items||[],queueChosenItems,"queue")+
   '<div class="staff-actionbar">'+btn("立即取號","unit-take","primary full",
      (!s||!queuePartySize||!unitSessionAvailable(s,"queue")||!menuChoiceReady(customer?.tenant?.menu_queue_mode||"DISABLED",queueChosenItems,customer?.menu_items||[])?'disabled':''))+'</div>');
}
function unitSettingsPanel(isManager){
 const units=unitConfig?.units||[],chosen=units.find(x=>x.id===unitEditingId);
 const sessions=(unitConfig?.sessions||[]),editing=sessions.find(x=>x.id===unitEditingSession);
 const options=units.filter(x=>x.active).map(u=>'<option value="'+esc(u.id)+'" '+((unitAdminUnit||editing?.unit_id)===u.id?'selected':'')+'>'+esc(u.name)+'</option>').join("");
 return box("服務單位設定",
   '<p class="small">不需要建立新店家。勾選多服務單位後，顧客可以先選分類與服務單位；沒有勾選就維持原本單一入口。</p>'+
   '<label class="checklist"><input type="checkbox" id="enable-units" '+(unitConfig?.multi?'checked':'')+(isManager?'':' disabled')+'> 啟用多服務單位</label>'+
   '<label class="checklist"><input type="checkbox" id="group-units" '+(unitConfig?.grouped?'checked':'')+(isManager?'':' disabled')+'> 顯示服務分類</label>'+
   '<label class="checklist"><input type="checkbox" id="link-units" '+(unitConfig?.linked?'checked':'')+(isManager?'':' disabled')+'> 預約報到後加入該場次叫號</label>'+
   (isManager?'<div class="staff-actionbar">'+btn("儲存服務模式","save-unit-mode","primary")+'</div>':'')+
   '<h3 style="margin-top:22px">服務單位</h3>'+
   '<div class="staff-actionbar">'+units.map(u=>btn((u.active?'':'〔停用〕')+u.name,
     "unit-edit","outline",'data-id="'+esc(u.id)+'"')).join("")+'</div>'+
   (isManager?'<div class="grid"><div>'+field("服務單位名稱","unit-name",chosen?.name||"")+
     field("分類名稱（可留空）","unit-group",chosen?.group||"")+'</div>'+
     '<div>'+field("排序","unit-order",chosen?.sort_order||0,"number")+'</div></div>'+
     '<label class="checklist"><input id="unit-active" type="checkbox" '+(chosen?.active!==false?'checked':'')+'> 啟用此單位</label>'+
     '<div class="staff-actionbar">'+btn(chosen?"儲存服務單位":"新增服務單位","unit-save","primary")+
     (chosen?btn("取消編輯","unit-new","outline"):"")+'</div>':'')+
   '<h3 style="margin-top:22px">開放場次</h3>'+
   field("場次日期","unit-admin-date",unitAdminDate,"date")+
   '<div class="staff-actionbar">'+sessions.map(s=>btn(unitNameForSession(s.id)+' '+s.name+' '+s.start,
     "unit-session-edit","outline",'data-id="'+esc(s.id)+'"')).join("")+'</div>'+
   (isManager?'<label for="unit-admin-unit">服務單位</label><select class="field" id="unit-admin-unit">'+options+'</select>'+
     '<div class="grid"><div>'+field("場次名稱","unit-session-name",editing?.name||"上午場")+
     field("開始時間","unit-session-start",editing?.start||"09:00","time",editing?'disabled':'')+
     '</div><div>'+field("開放名額","unit-session-capacity",editing?.capacity||10,"number",'min="1" max="300"')+
     field("結束時間","unit-session-end",editing?.end||"12:00","time",editing?'disabled':'')+'</div></div>'+
     '<label class="checklist"><input id="unit-session-active" type="checkbox" '+(editing?.active!==false?'checked':'')+'> 開放此場次</label>'+
     '<div class="staff-actionbar">'+btn(editing?"儲存場次":"新增場次","unit-session-save","primary")+
       (editing?btn("新增另一場","unit-session-new","outline"):"")+'</div>':''));
}
function unitStaffQueuePanel(){
 const ss=(unitConfig?.sessions||[]).filter(s=>s.active);
 const selected=ss.find(x=>x.id===unitStaffSession)||ss[0];
 const tickets=(staff?.tickets||[]).filter(k=>k.service_session_id===selected?.id&&!k.deleted_at);
 const open=tickets.filter(k=>['WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED'].includes(k.status));
 const waiting=open.filter(k=>k.status==='WAITING');
 const current=open.find(k=>['CALLED','ARRIVED','ADMITTED','SERVING'].includes(k.status));
 return box("按服務單位獨立叫號",
   '<p class="small">每個單位與場次獨立服務；不同單位可以同時叫號。現有編號及通知機制繼續沿用。</p>'+
   '<label for="staff-unit-session">操作隊列</label><select id="staff-unit-session" class="field">'+
   ss.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?.id?'selected':'')+'>'+esc(unitNameForSession(s.id))+' · '+esc(s.name)+' '+esc(s.start)+'</option>').join("")+'</select>'+
   (selected?'<div class="grid3" style="margin:12px 0">'+stat("目前叫號",current?.number||"—")+
     stat("候位中",waiting.length)+stat("已過號",open.filter(k=>k.status==="PASSED").length)+'</div>'+
     '<div class="staff-actionbar">'+btn("叫下一位","unit-call","primary",(!waiting.length||current?'disabled':'')+' data-session="'+esc(selected.id)+'"')+
     btn("再叫一次","unit-recall","outline",(!current||current.status!=="CALLED"?'disabled':'')+
       ' data-session="'+esc(selected.id)+'" data-id="'+esc(current?.id||'')+'"')+
     '<a class="btn outline" href="./board.html?merchant='+encodeURIComponent(slug)+'&session='+encodeURIComponent(selected.id)+'" target="_blank" rel="noopener noreferrer">本隊列看板</a></div>'+
     '<div style="margin-top:14px">'+open.map(k=>'<article class="staff-record">'+
       '<div class="staff-record-title">'+esc(k.number)+'　'+esc(k.name)+'</div>'+
       '<div class="small">'+esc(k.unit||"")+' · '+esc(k.session||"")+'</div>'+
       staffStatusPicker("ticket",k,true)+'</article>').join("")+'</div>':
     '<p class="muted">尚未設定今日場次，請先至企業設定建立服務單位與場次。</p>'));
}

