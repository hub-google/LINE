document.addEventListener("click",async ev=>{
 const historyLink=ev.target.closest("a[data-customer-history-id]");
 if(historyLink){
   ev.preventDefault();
   if(view!=="staff"||staffTab!=="settings"||busy)return;
   const userId=historyLink.dataset.customerHistoryId||"";
   const match=staffCustomerBook.find(x=>x.id===userId);
   if(!match)return;
   customerHistoryUserId=userId;customerHistoryName=match.name||"LINE 顧客";
   customerHistoryPage=1;customerHistoryData=null;customerHistoryError="";
   void loadCustomerHistory(1);return;
 }
 const b=ev.target.closest("button");if(!b||busy)return;
 if(b.dataset.colorPreset&&b.dataset.colorFor){merchantSetAccent(b.dataset.colorFor,b.dataset.colorPreset);return;}
 if(b.dataset.logoClear){merchantClearLogo(b.dataset.logoClear);return;}
 if(b.dataset.act==="dismiss-feedback"){dismissActionFeedback();flash="";err="";render();return;}
 if(b.dataset.act==="staff-show-more"){
  const key=b.dataset.listKey||"";
  if(!/^(booking|ticket)-(open|done|deleted)$/.test(key))return;
  staffVisibleLimits.set(key,Math.min(500,(staffVisibleLimits.get(key)||12)+12));
  render();return;
 }
 if(b.dataset.act==="open-bookings"||b.dataset.act==="open-queue"){
 staffTab=b.dataset.act==="open-bookings"?"bookings":"queue";err="";render();
 if(staffTab==="bookings")void searchHistoricalBookings(1);
 return;
}
 if(b.dataset.act==="unit-category-pill"){
   unitCategory=b.dataset.category||"";unitChoice=availableUnits(customerTab)[0]?.id||"";unitSessionChoice="";render();return;
 }
 if(b.dataset.act==="unit-choose"){
   unitChoice=b.dataset.id;unitSessionChoice="";unitConfirmKey="";render();return;
 }
 if(b.dataset.act==="unit-home-select"){
   unitChoice=b.dataset.id;unitSessionChoice="";unitConfirmKey="";customerTab=customer?.tenant?.modules?.reservation?"reserve":"queue";
   void load();return;
 }
 if(b.dataset.nav){const v=b.dataset.nav;const tab=b.dataset.tab;if(v==="customer"){
  customerTab=tab;progressTicketId="";crossCurrentStore=false;
  if(["reserve","queue"].includes(tab)&&!customer?.tenant.modules[tab==="reserve"?"reservation":"queue"])customerTab="home";
  stopQueueRealtime();
  if(unitEnabled()&&["queue","reserve"].includes(customerTab)){
    if(customerTab==="queue")day=taipei();
    void load();return;
  }
  if(customerTab==="progress"){queueLive=null;queueLiveShop="";void refreshCrossStoreOverview();}
  if(customerTab==="reserve"&&!unitEnabled())void refreshServiceSlots();
  else stopCrossQueueRealtime();
  /* Customer subviews change in-place on the same page. */
 }
 if(v==="staff"){
   staffTab=tab;
   if(["analytics","branches","menu","settings","units"].includes(tab)){void load();return;}
    if(tab==="bookings"){err="";flash="";render();void searchHistoricalBookings(1);return;}
    if(tab==="calendar"){err="";flash="";render();void loadBookingCalendar(1);return;}
 }
 if(v==="platform")platformTab=tab;err="";flash="";render();return}
 if(b.dataset.slot){
  const option=currentBookingSlots().find(x=>x.time===b.dataset.slot);
  if(!availableForParty(option)){
    showActionFeedback("此時段剩餘名額不足，請更換時間或人數。","warning");return;
  }
  chosenSlot=b.dataset.slot;render();return;
 }
 const a=b.dataset.act,id=b.dataset.id;
 if(!a)return;
 if(a==="customer-history-close"){
   customerHistorySeq++;customerHistoryUserId="";customerHistoryData=null;customerHistoryError="";
   render();return;
 }
 if(a==="customer-history-prev"||a==="customer-history-next"){
   if(customerHistoryLoading||!customerHistoryData)return;
   const next=customerHistoryPage+(a==="customer-history-next"?1:-1);
   const last=Math.max(1,Math.ceil(Number(customerHistoryData.total||0)/25));
   if(next<1||next>last)return;
   void loadCustomerHistory(next);return;
 }


  if(a==="login"||a==="signup"){const email=val("auth-email"),password=val("auth-pass");if(!email||password.length<8){err="請輸入 Email 與至少 8 字元的密碼";render();return}
 await act(async()=>{if(session?.user?.is_anonymous){await supa.auth.signOut();session=null}
 const r=a==="login"?await supa.auth.signInWithPassword({email,password}):await supa.auth.signUp({email,password});
 if(r.error)throw Error(r.error.message);session=r.data.session;return a==="signup"?"帳號已送出註冊；如需確認信，請先驗證後登入。":"登入成功";});return}


  if(a==="logout"){await act(async()=>{const r=await supa.auth.signOut();if(r.error)throw Error(r.error.message);session=null;context=null;staff=null;return "已登出";});return}
 if(a==="accept-invite"){await act(async()=>{await rpc("so_accept_invite",{p_invite_id:id});return "已接受企業邀請";});return}
 if(a==="claim-admin"){await act(async()=>{await rpc("so_claim_platform_admin",{p_token:val("bootstrap-token")});return "已取得平台管理員權限";});return}
 if(a==="new-tenant"){platformTab="create";render();return}
 if(a==="create-tenant"){await act(async()=>{
  const patch=merchantProfilePatch("create");
  const code=val("create-slug");
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(code))throw Error("網址英文代碼需為 3～40 個小寫字母、數字或連字號");
  const email=val("create-owner");
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("企業管理者 Email 格式不正確");
  patch.logo_url=await merchantUploadLogo("create",patch.logo_url);
  const result=await rpc("so_create_tenant",{p_name:patch.name,
   p_slug:code,
   p_modules:checked("create-feature"),p_owner_email:email||null});
  try{await rpc("so_update_tenant",{p_slug:result.slug,p_patch:patch});}
  catch(error){platformTab="list";throw Error("企業已建立，但部分設定未儲存（"+result.slug+"）："+error.message);}
  platformTab="list";
  return "企業已建立，LOGO 與品牌設定已儲存";
 });return}
 if(a==="toggle-company"){await act(async()=>{const target=b.dataset.slug;const t=overview.find(x=>x.slug===target);if(!t)throw Error("找不到企業，請重新整理清單");await rpc("so_update_tenant",{p_slug:target,p_patch:{status:t.status==="ACTIVE"?"SUSPENDED":"ACTIVE"}});return "已更新企業啟用狀態";});return}
 if(a==="copy-customer"||a==="copy-staff"){await act(async()=>{
  const s=slug,v=a==="copy-customer"?"customer":"staff";
  const u=await urlFor(v,s);
  try{await navigator.clipboard.writeText(u);return "已複製網址："+u;}
  catch(e){window.prompt("複製網址",u);return "請複製顯示的網址";}
 });return;}
 if(a==="create-business-group"){
   await act(async()=>{
     await rpc("so_create_business_group",{p_name:val("group-name")});
     return "已建立總店群組";
   });return;
 }
 if(a==="attach-business-branch"){
   const group=b.dataset.group;
   await act(async()=>{
     await rpc("so_attach_business_branch",{p_group_id:group,p_slug:val("branch-slug-"+group)});
     return "分店已加入總店";
   });return;
 }
 if(a==="detach-business-branch"){
   if(!confirm("確定把分店移出總店嗎？不會刪除門市、預約或叫號資料。"))return;
   await act(async()=>{
     await rpc("so_detach_business_branch",{p_group_id:b.dataset.group,p_slug:b.dataset.slug});
     return "分店已移出總店";
   });return;
 }
 if(a==="copy-own-oa-webhook"){
  const webhook=LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(slug);
  try{await navigator.clipboard.writeText(webhook);showActionFeedback("已複製 Webhook URL","success");}
  catch(e){window.prompt("複製 Webhook URL",webhook);}
  return;
 }
 if(a==="connect-own-oa"||a==="disconnect-own-oa"){
  if(a==="disconnect-own-oa"&&!confirm("確定改回平台 LINE OA？商家自己的 LIFF 與通知將停止；原預約和取號不會刪除。"))return;
  await act(async()=>{
   const payload=a==="connect-own-oa"
    ?{action:"connect-merchant-oa",slug,liffId:val("own-oa-liff"),botToken:val("own-oa-token"),channelSecret:val("own-oa-secret")}
    :{action:"disconnect-merchant-oa",slug};
   if(!session?.access_token)throw Error("請先登入企業管理者帳號");
   const res=await fetch(LINE_BRIDGE_URL,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},
    body:JSON.stringify(payload)
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok||!data.ok)throw Error(data.error||"LINE OA 串接失敗");
   lineConfig=null;lineConfigSlug="";
   return a==="connect-own-oa"?"LINE OA 已驗證並連接，請設定上方 Webhook URL，並確認 Login 與 Messaging API 同屬 Provider":"已解除自有 LINE OA，恢復平台服務";
  });return;
 }
 if(a==="save-directory"){await act(async()=>{const enabled=!!$("directory-enabled")?.checked;await rpc("so_set_directory_listing",{p_slug:slug,p_enabled:enabled,p_oa_mode:"PLATFORM"});return enabled?"門市已開放在排隊怪獸平台搜尋":"門市已取消公開搜尋（原有專屬連結仍可使用）";});return;}
 if(a==="menu-edit"){editingMenuItemId=id;render();return;}
 if(a==="menu-edit-clear"){editingMenuItemId="";render();return;}
 if(a==="refresh-service-slots"){void refreshServiceSlots();return;}
 if(a==="menu-save"){
   await act(async()=>{
     const priceText=val("menu-price"),price=priceText===""?null:Number(priceText);
     if(price!==null&&(!Number.isFinite(price)||price<0))throw Error("請輸入有效的價格");
     const result=await rpc("so_menu_save",{
       p_slug:slug,p_kind:val("menu-kind"),p_name:val("menu-name"),
       p_description:val("menu-description"),p_price:price,
       p_sort_order:Number(val("menu-order")||0),
       p_active:!!$("menu-active")?.checked,
       p_item_id:editingMenuItemId||null
     });
     editingMenuItemId="";
     return "「"+result.name+"」已儲存";
   });return;
 }
 if(a==="menu-toggle"){
   const item=(staff?.menu_items||[]).find(x=>x.id===id);
   if(!item){showActionFeedback("找不到這個項目","error");return;}
   await act(async()=>{
     await rpc("so_menu_save",{p_slug:slug,p_kind:item.kind,p_name:item.name,
       p_description:item.description||"",p_price:item.price,
       p_sort_order:item.sort_order,p_active:!item.active,p_item_id:item.id});
     return "「"+item.name+"」已"+(item.active?"停用":"上架");
   });return;
 }
 if(a==="save-number-prefix"){
   const kind=b.dataset.kind;
   if(!["booking","queue"].includes(kind))return;
   const prefix=document.getElementById("prefix-"+kind)?.value??"";
   const visibleLength=typeof Intl.Segmenter==="function"
     ?Array.from(new Intl.Segmenter("zh-Hant",{granularity:"grapheme"}).segment(prefix)).length
     :Array.from(prefix).length;
   if(visibleLength>3||/[\u0000-\u001f\u007f]/.test(prefix)){showActionFeedback("前綴最多 3 個可見字元，不能包含控制字元","error");return;}
   await act(async()=>{
     const result=await rpc(kind==="booking"?"so_set_booking_prefix":"so_set_queue_prefix",{p_slug:slug,p_prefix:prefix});
     return (kind==="booking"?"預約":"叫號")+"前綴已設為："+(result.prefix||"（無前綴）")+"，不影響既有編號";
   });return;
  }
  if(a==="reset-serial"){
   const kind=b.dataset.kind;
   if(!["booking","queue"].includes(kind))return;
   const label=kind==="booking"?"預約":"叫號";
   if(busy||b.disabled)return;
   // Prevent rapid double-taps while waiting for the server-side preview.
   b.disabled=true;
   let preview;
   try{
     preview=await rpc("so_number_reset_preview",{p_slug:slug,p_kind:kind});
   }catch(error){
     showActionFeedback("無法確認未結案筆數，為避免錯誤重置，請稍後重試："+(error?.message||"未知錯誤"),"error");
     return;
   }finally{
     if(b.isConnected)b.disabled=false;
   }
   const count=Number(preview?.still_open);
   if(!Number.isSafeInteger(count)||count<0){
     showActionFeedback("無法取得可信的未結案筆數，已取消重置。","error");return;
   }
   const warning=count>0
     ?"目前還有 "+count+" 筆未結案"+label+"。重置後新舊批次可能出現相同顯示號碼，請以批次及紀錄識別，避免錯誤操作。"
     :"目前沒有未結案"+label+"。";
   if(!confirm("確定重置「"+label+"」編號嗎？\n\n"+warning+"\n\n下一筆新"+(kind==="booking"?"預約":"取號")+"會從 1 開始；歷史資料與原編號都會保留。"))return;
   await act(async()=>{
     const result=await rpc(kind==="booking"?"so_reset_booking_number":"so_reset_queue_number",{p_slug:slug});
     const currentOpen=Number(result.still_open);
     const changedCount=Number.isSafeInteger(currentOpen)&&currentOpen!==count
       ?"（重置時尚有 "+currentOpen+" 筆未結案；資料可能在確認期間變動）":"";
     return label+"編號已重置，新資料將從 "+(result.prefix||"")+"1 開始；既有資料未更動。"+changedCount;
   });return;
  }
  if(a==="resource-save"){
   await act(async()=>{
     const name=val("resource-name"),kind=val("resource-kind");
     if(!name||!["STAFF","ROOM","EQUIPMENT"].includes(kind))throw Error("請輸入員工／房間／設備名稱與類型");
     await rpc("so_resource_upsert",{p_slug:slug,p_name:name,p_kind:kind,p_active:true,p_resource_id:null});
     return "已新增本店資源："+name;
   });return;
 }
 if(a==="resource-toggle"){
   const item=(staff?.resourceContext?.resources||[]).find(x=>x.id===id);
   if(!item){showActionFeedback("找不到本店資源","error");return;}
   await act(async()=>{
     await rpc("so_resource_upsert",{p_slug:slug,p_name:item.name,p_kind:item.kind,p_active:!item.active,p_resource_id:item.id});
     return "資源「"+item.name+"」已"+(item.active?"停用":"重新啟用");
   });return;
 }
 if(a==="service-rule-save"){
   await act(async()=>{
     const item=val("rule-service"),duration=Number(val("rule-duration")),buffer=Number(val("rule-buffer")),resource=val("rule-resource");
     if(!item||!Number.isInteger(duration)||duration<5||duration>480||!Number.isInteger(buffer)||buffer<0||buffer>120)
       throw Error("服務時間應為 5～480 分鐘，緩衝 0～120 分鐘");
     await rpc("so_service_rule_save",{p_slug:slug,p_item_id:item,p_duration:duration,p_buffer:buffer,
       p_resource_id:resource||null,p_show_duration:!!$("rule-show-duration")?.checked});
     return "服務時長、緩衝與指定資源已儲存；既有預約保留原本的時間快照";
   });return;
 }
 if(a==="save-menu-modes"){
   await act(async()=>{
     const value=await rpc("so_menu_set_modes",{p_slug:slug,
       p_booking_mode:val("menu-book-mode"),p_queue_mode:val("menu-queue-mode")});
     return "菜單及服務規則已儲存：預約「"+menuModeLabel(value.booking)+"」，現場取號「"+menuModeLabel(value.queue)+"」";
   });return;
 }
 if(a==="calendar-mode"){
   const mode=b.dataset.mode;
   if(!["day","week","month"].includes(mode))return;
   calendarMode=mode;calendarPage=1;void loadBookingCalendar(1);return;
  }
  if(a==="calendar-prev"||a==="calendar-next"){
   calendarAnchor=calendarShiftAnchor(calendarMode,calendarAnchor,a==="calendar-prev"?-1:1);
   calendarPage=1;void loadBookingCalendar(1);return;
  }
  if(a==="calendar-today"){
   calendarAnchor=taipei();calendarPage=1;void loadBookingCalendar(1);return;
  }
  if(a==="calendar-day"){
   const date=b.dataset.date;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return;
   calendarAnchor=date;calendarMode="day";calendarPage=1;void loadBookingCalendar(1);return;
  }
  if(a==="calendar-jump"){
   const date=val("calendar-jump-date");
   try{calendarPeriod(calendarMode,date);}catch(e){showActionFeedback("請選擇正確日期。","error");return;}
   calendarAnchor=date;calendarPage=1;void loadBookingCalendar(1);return;
  }
  if(a==="calendar-refresh"){void loadBookingCalendar(calendarPage);return;}
  if(a==="calendar-page-prev"||a==="calendar-page-next"){
   if(!calendarResult||calendarLoading)return;
   const target=calendarPage+(a==="calendar-page-prev"?-1:1);
   const last=Math.max(1,Math.ceil(Number(calendarResult.total||0)/100));
   if(target<1||target>last)return;
   void loadBookingCalendar(target);return;
  }
  if(a==="historical-search"){
    const search=val("historical-booking-search").trim();
    const from=val("historical-booking-from"),to=val("historical-booking-to");
    if(search.length>100){showActionFeedback("搜尋最多 100 字","error");return;}
    if(from&&to&&from>to){showActionFeedback("結束日期不能早於開始日期","error");return;}
    historicalBookingQuery=search;historicalBookingStart=from;historicalBookingEnd=to;
    historicalBookingStatus=val("historical-booking-status");
    historicalBookingDeleted=val("historical-booking-deleted");
    historicalBookingPage=1;void searchHistoricalBookings(1);return;
  }
  if(a==="historical-export"){void exportHistoricalBookings();return;}
  if(a==="historical-reset"){
    historicalBookingQuery="";historicalBookingStart="";historicalBookingEnd="";
    historicalBookingStatus="ALL";historicalBookingDeleted="active";historicalBookingPage=1;
    void searchHistoricalBookings(1);return;
  }
  if(a==="historical-prev"||a==="historical-next"){
    if(historicalBookingLoading||!historicalBookingResult)return;
    const candidate=historicalBookingPage+(a==="historical-prev"?-1:1);
    const max=Math.max(1,Math.ceil(Number(historicalBookingResult.total||0)/25));
    if(candidate<1||candidate>max)return;
    void searchHistoricalBookings(candidate);return;
  }
  if(a==="apply-booking-filter"){
   staffBookingSearch=val("staff-booking-search").trim().slice(0,100);
   staffBookingDateFilter=["all","today","tomorrow","next7"].includes(val("staff-booking-date"))?val("staff-booking-date"):"all";
   staffBookingStatusFilter=["all","CONFIRMED","CHECKED_IN","COMPLETED","NO_SHOW","CANCELLED"].includes(val("staff-booking-status"))?val("staff-booking-status"):"all";
   render();return;
 }
 if(a==="clear-booking-filter"){
   staffBookingSearch="";staffBookingDateFilter="all";staffBookingStatusFilter="all";
   render();return;
 }
 if(a==="export-bookings"){
   if(view!=="staff"||staffTab!=="bookings"||!["OWNER","MANAGER","PLATFORM"].includes(staff?.role)){
     showActionFeedback("僅企業管理者可匯出預約資料。","error");return;
   }
   const records=(staff?.pending_reservations||[]).concat(staff?.processed_reservations||[],staff?.deleted_reservations||[])
     .filter(x=>staffBookingMatches(x));
   // Leading formula characters must never be interpreted as spreadsheet formulas.
   const csvCell=value=>{
     let v=String(value??"").replace(/\r?\n/g," ");
     if(/^[\s]*[=+@-]/.test(v))v="'"+v;
     return '"'+v.replace(/"/g,'""')+'"';
   };
   const columns=["預約日期","時間","預約編號","預約姓名","聯絡手機","人數","目前狀態","送出預約時間","顧客端已隱藏"];
   const rows=records.map(x=>[x.day,x.time,x.number,x.name,x.phone||"",x.party,jsStatus(x.status),
     formatTaipeiCreated(x.created_at),x.deleted_at?"是":"否"]);
   const csv="\uFEFF"+[columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;
   link.download="LINE_booking_"+slug+"_"+taipei()+".csv";
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   showActionFeedback("已匯出目前篩選中的 "+records.length+" 筆預約資料，請妥善保護顧客資訊。","success");
   return;
 }
 if(a==="export-analytics"){
   const a=staffAnalytics;
   if(!a||!Array.isArray(a.daily)){showActionFeedback("統計資料尚未載入","error");return;}
   const csv="\uFEFF日期,預約筆數,取號筆數\r\n"+a.daily.map(d=>[String(d.date).slice(0,10),Number(d.reservations||0),Number(d.tickets||0)].join(",")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;link.download="LINE_"+slug+"_"+analyticsDays+"days.csv";
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   return;
 }
 if(a==="noop-queue-session"){return;}
 if(a==="set-queue-session"){
   const session=b.dataset.sessionCode;
   if(!["MORNING","AFTERNOON","EVENING","REST"].includes(session))return;
   if(!confirm("切換至「"+queueSessionName(session)+"」？只影響新取號，不會重設既有號碼。"))return;
   await act(async()=>{
     await rpc("so_set_queue_session",{p_slug:slug,p_session:session});
     return "已切換為「"+queueSessionName(session)+"」，現有號碼及順序不變";
   });return;
 }
 if(a==="save-hold-policy"){
   await act(async()=>{
     const minutes=Number(val("hold-minutes")),max=Number(val("hold-limit")),mode=val("hold-return-mode");
     if(!Number.isInteger(minutes)||minutes<1||minutes>120||!Number.isInteger(max)||max<0||max>10||!["END","ORIGINAL"].includes(mode))throw Error("請設定有效的保留時間、次數與恢復順位");
     await rpc("so_set_queue_hold_policy",{p_slug:slug,p_hold_minutes:minutes,p_max_holds:max,p_return_mode:mode});
     return "候位保留規則已儲存";
   });return;
  }
  if(a==="save-customer-flags"){
   await act(async()=>{
     if(!customerFlagSelected)throw Error("請先選擇本店顧客");
     const tags=val("customer-flag-tags").split(/[,，、;；\n]+/).map(x=>x.trim()).filter(Boolean);
     if(tags.length>10)throw Error("最多十個顧客標籤");
     await rpc("so_staff_set_customer_flag",{
       p_slug:slug,p_user_id:customerFlagSelected,p_notes:val("customer-flag-notes"),p_tags:tags,
       p_blacklisted:!!$("customer-flag-blacklisted")?.checked,
       p_block_new_bookings:!!$("customer-flag-block")?.checked
     });
     return "顧客標籤及預約限制已保存";
   });return;
  }
  if(a==="announcement-edit"){announcementEditId=id;render();return;}
  if(a==="announcement-edit-cancel"){announcementEditId="";render();return;}
  if(a==="announcement-save"){
    await act(async()=>{
      const title=val("announcement-title"),body=val("announcement-body");
      const images=val("announcement-images").split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean);
      if(!title||title.length>80||images.length>8)throw Error("請輸入公告標題；照片最多八張");
      await rpc("so_save_announcement",{p_slug:slug,p_id:announcementEditId||null,
        p_title:title,p_body:body,p_images:images,p_active:!!$("announcement-active")?.checked});
      announcementEditId="";
      return "公告已成功儲存";
    });return;
  }
  if(a==="announcement-toggle"){
    if(!confirm("確定變更這篇公告的公開狀態？"))return;
    await act(async()=>{
      await rpc("so_set_announcement_active",{p_slug:slug,p_id:id,p_active:b.dataset.active!=="true"});
      return "公告公開狀態已更新";
    });return;
  }
  if(a==="save-booking-confirmation"){
   await act(async()=>{
     await rpc("so_set_booking_confirmation",{p_slug:slug,p_required:!!$("policy-confirm-required")?.checked});
     return "二次確認設定已儲存";
   });return;
  }
  if(a==="save-booking-policy"){
   await act(async()=>{
     const dates=val("policy-closed-dates").split(/[,，;；\s]+/).filter(Boolean);
     if(dates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)))throw Error("請使用 YYYY-MM-DD 格式填寫特殊休假日期");
     const days=Array.from(document.querySelectorAll(".policy-closed-day:checked"),x=>Number(x.value));
     await rpc("so_set_booking_policy",{
       p_slug:slug,p_closed_weekdays:days,p_closed_dates:dates,
       p_break_start:val("policy-break-start"),p_break_end:val("policy-break-end"),
       p_min_notice_minutes:Number(val("policy-notice")||0)
     });
     return "預約營業規則已更新";
   });return;
 }
 if(a==="save-unit-mode"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:slug,p_action:"settings",p_data:{
     multi:!!$("enable-units")?.checked,grouped:!!$("group-units")?.checked,linked:!!$("link-units")?.checked
    }});
    return "服務單位顯示與連動設定已儲存";
   });return;
 }
 if(a==="unit-edit"){unitEditingId=id;render();return;}
 if(a==="unit-new"){unitEditingId="";render();return;}
 if(a==="unit-save"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:slug,p_action:"unit",p_data:{
     id:unitEditingId||null,name:val("unit-name"),group:val("unit-group"),
     sort_order:Number(val("unit-order")||0),active:!!$("unit-active")?.checked
    }});
    unitEditingId="";return "服務單位已儲存";
   });return;
 }
 if(a==="unit-session-edit"){unitEditingSession=id;const s=(unitConfig?.sessions||[]).find(x=>x.id===id);unitAdminUnit=s?.unit_id||"";render();return;}
 if(a==="unit-session-new"){unitEditingSession="";render();return;}
 if(a==="unit-session-save"){
   await act(async()=>{
    await rpc("so_unit_manage",{p_slug:slug,p_action:"session",p_data:{
      id:unitEditingSession||null,unit_id:val("unit-admin-unit"),date:unitAdminDate,
      name:val("unit-session-name"),start:val("unit-session-start"),
      end:val("unit-session-end"),capacity:Number(val("unit-session-capacity")),
      active:!!$("unit-session-active")?.checked
    }});
    unitEditingSession="";return "場次設定已儲存";
   });return;
 }
 if(a==="unit-call"||a==="unit-recall"){
   await act(async()=>{
    const res=await rpc("so_unit_call",{p_slug:slug,p_session_id:b.dataset.session,
      p_action:a==="unit-call"?"call":"recall",p_ticket_id:a==="unit-recall"?id:null});
    const notice=await notifyLineCalled(res.number,res.ticket_id,res.line_call_event_id);
    return "已叫號 "+res.number+"；"+notice;
   });return;
 }
 if(a==="unit-book-review"){
    const s=selectedUnitSession("reserve");
    if(!s||!unitSessionAvailable(s,"reserve")||!validBookingContact())return;
    unitConfirmKey=unitBookingFingerprint(s,Number(bookingParty));render();return;
 }
 if(a==="unit-book-back"){unitConfirmKey="";render();return;}
 if(a==="unit-book-final"){
   if(customer?.booking_confirmation_required!==false&&unitConfirmKey!==unitBookingFingerprint(selectedUnitSession(),Number(bookingParty))){
      showActionFeedback("預約資料已變動，請重新確認。","warning");unitConfirmKey="";render();return;
   }
   await act(async()=>{
    if(lineLinkStatus!=="linked")throw Error("請先完成 LINE 身分驗證");
    const s=selectedUnitSession();
    if(!s||!unitSessionAvailable(s,"reserve"))throw Error("此場次已無法預約，請重新選擇");
    if(!validBookingContact())throw Error("請填寫姓名及有效手機號碼");
    const party=Number(val("customer-party")),items=bookingChosenItems.slice();
    if(!Number.isInteger(party)||party<1||party>20)throw Error("請填寫正確人數");
    const requestId=customerBookingRequestId({merchant:slug,date:day,time:s.id,party,
      name:bookingContactName.trim(),phone:normalizeBookingPhone(bookingContactPhone),items});
    const result=await rpc("so_unit_book_once",{p_slug:slug,p_session_id:s.id,
      p_name:bookingContactName.trim(),p_phone:normalizeBookingPhone(bookingContactPhone),
      p_party:party,p_items:items,p_request_id:requestId});
    clearCustomerBookingRequest(requestId);
    customerTab="mine";unitSessionChoice="";bookingChosenItems=[];unitConfirmKey="";
    const notice=result.replayed?"":await sendLineNotice("notify-reservation",{reservationId:result.id});
    return (result.replayed?"已找到先前的預約":"預約已成立")+"；"+unitNameForSession(s.id)+" "+s.name+
      (notice?customerNoticeSuffix(notice):"");
   });return;
 }
 if(a==="unit-take"){
   await act(async()=>{
    if(lineLinkStatus!=="linked")throw Error("請先完成 LINE 身分驗證");
    const s=selectedUnitSession();
    if(!s||!unitSessionAvailable(s,"queue"))throw Error("目前沒有開放取號的場次，請重新選擇");
    const result=await rpc("so_unit_take_number",{p_slug:slug,p_session_id:s.id,
      p_party:Number(val("customer-queue-party")),p_items:queueChosenItems.slice()});
    progressTicketId=result.id;customerTab="progress";queueChosenItems=[];
    const notice=await sendLineNotice("notify-ticket",{ticketId:result.id});
    return "已取得號碼 "+result.number+customerNoticeSuffix(notice);
   });return;
 }
 if(a==="save-service-modes"){await act(async()=>{
  const reservation=document.getElementById("set-service-reservation")?.checked;
  const queue=document.getElementById("set-service-queue")?.checked;
  if(typeof reservation!=="boolean"||typeof queue!=="boolean")throw Error("請在企業設定中調整服務開關");
  await rpc("so_set_merchant_services",{p_slug:slug,p_reservation:reservation,p_queue:queue});
  return reservation&&queue?"已開放預約與取號":reservation?"已切換為僅提供線上預約":queue?"已切換為僅提供現場取號":"已暫停接受新預約及新取號";
 });return}
 if(a==="update-settings"){await act(async()=>{
 const initial=staff?.tenant?.onboarding_complete===false;
 // Keep an incomplete merchant unlisted until all settings are successfully saved.
 const t=staff?.tenant||{};
 const patch=merchantProfilePatch("set",t);
 patch.logo_url=await merchantUploadLogo("set",patch.logo_url);
 await rpc("so_update_tenant",{p_slug:slug,p_patch:patch});
 if(initial){
   await rpc("so_complete_merchant_onboarding",{p_slug:slug,p_name:patch.name,
     p_phone:patch.phone,p_address:patch.address,p_category:patch.directory_category});
 }
 return initial?"店家資料已建立並公開搜尋":"企業設定與品牌 LOGO 已儲存";
 });return}
 if(a==="invite-staff"){await act(async()=>{await rpc("so_invite_staff",{p_slug:slug,p_email:val("invite-email"),p_role:val("invite-role")});return "員工邀請已儲存，請通知對方登入接受";});return}
 if(a==="book-back"){bookingConfirmationKey="";render();return;}
 if(a==="book"&&customer?.booking_confirmation_required!==false){
  const party=Number(val("customer-party"));
  const slot=currentBookingSlots().find(x=>x.time===chosenSlot);
  if(!Number.isInteger(party)||party<1||party>20||!chosenSlot||!availableForParty(slot,party)||
     !validBookingContact()||!menuChoiceReady(customer?.tenant?.menu_booking_mode||"DISABLED",bookingChosenItems,customer?.menu_items||[])){
    showActionFeedback("請先選擇有效人數、時段與服務項目。","warning");return;
  }
  bookingParty=party;bookingConfirmationKey=bookingConfirmationFingerprint();render();return;
 }
 if(a==="book-final"&&(customer?.booking_confirmation_required===false||
    bookingConfirmationKey!==bookingConfirmationFingerprint())){
    bookingConfirmationKey="";showActionFeedback("預約內容已變更，請重新確認。","warning");render();return;
 }
 if(a==="book"||a==="book-final"){await act(async()=>{
  if(lineLinkStatus!=="linked")throw Error("請先完成 LINE 授權");
  if(!chosenSlot)throw Error("請先選擇時段");
  const party=bookingParty,time=chosenSlot;
  if(!Number.isInteger(party)||party<1||party>20)throw Error("請輸入 1～20 位的有效預約人數。");
  if(!validBookingContact())throw Error("請填寫預約姓名及有效的台灣手機號碼。");
  const selected=currentBookingSlots().find(x=>x.time===time);
  if(!availableForParty(selected,party))throw Error("此時段已沒有足夠名額，請重新選擇時間。");
  const items=bookingChosenItems.slice();
  const requestId=customerBookingRequestId({merchant:slug,date:day,time,party,name:bookingContactName.trim(),phone:normalizeBookingPhone(bookingContactPhone),items});
  const result=await rpc("so_book_with_contact_once",{p_slug:slug,p_date:day,p_time:time,p_name:bookingContactName.trim(),p_phone:normalizeBookingPhone(bookingContactPhone),p_party:party,p_items:items,p_request_id:requestId});
  // Clear only AFTER the database has acknowledged this ID. A lost response
  // leaves the same ID ready for a safe retry.
  clearCustomerBookingRequest(requestId);
  chosenSlot="";bookingChosenItems=[];bookingConfirmationKey="";customerTab="mine";
  if(result.status!=="CONFIRMED")return "先前送出的預約已找到，最新狀態："+jsStatus(result.status)+"。請到我的預約確認。";
  if(result.replayed)return "已查到先前成立的預約："+day+" "+time+"，"+party+" 位；系統沒有重複建立第二筆。";
  const notice=await sendLineNotice("notify-reservation",{reservationId:result.id});
  return "預約已成立："+day+" "+time+"，"+party+" 位"+customerNoticeSuffix(notice);
 });return}

 if(a==="edit-book-contact"){
   const b=(customer?.my_reservations||[]).find(x=>x.id===id);
   if(!b||b.status!=="CONFIRMED")return;
   document.getElementById("booking-contact-overlay")?.remove();
   document.body.insertAdjacentHTML("beforeend",'<div id="booking-contact-overlay" class="receipt-backdrop" role="dialog" aria-modal="true" aria-label="修改預約聯絡資料"><article class="receipt-card"><h2>修改預約聯絡資料</h2><p>預約 '+esc(b.number||"")+'</p>'+
     field("預約姓名","contact-edit-name",b.name||"","text",'maxlength="80" required')+
     field("聯絡手機","contact-edit-phone",b.phone||"","tel",'inputmode="tel" required')+
     '<p class="small">修改後會更新店家後台，並向您發送新的 LINE 預約通知。</p><div class="receipt-actions">'+
     btn("儲存修改","save-book-contact","primary",'data-id="'+esc(b.id)+'"')+
     btn("取消","close-book-contact","outline")+'</div></article></div>');
   $("contact-edit-name")?.focus();return;
 }
 if(a==="close-book-contact"){document.getElementById("booking-contact-overlay")?.remove();return;}
 if(a==="save-book-contact"){
   const name=val("contact-edit-name"),phone=normalizeBookingPhone(val("contact-edit-phone"));
   if(!name||name.length>80||/[\r\n\u0000-\u001f]/.test(name)||!/^09\d{8}$/.test(phone)){
     showActionFeedback("請填寫有效的預約姓名與台灣手機號碼","error");return;
   }
   await act(async()=>{
     const result=await rpc("so_update_booking_contact",{p_slug:slug,p_booking_id:id,p_name:name,p_phone:phone});
     document.getElementById("booking-contact-overlay")?.remove();
     bookingContactName=name;bookingContactPhone=phone;bookingContactDirty=false;
     if(!result.changed)return "預約聯絡資料沒有變更";
     const notice=await sendLineNotice("notify-reservation-updated",{reservationId:id});
     return "預約姓名和電話已更新；"+notice;
   });return;
 }
 if(a==="booking-ics"){downloadReservationIcs(id);return;}
 if(a==="booking-receipt"){openBookingReceipt(id);return;}
 if(a==="receipt-close"){document.getElementById("booking-receipt-overlay")?.remove();return;}
 if(a==="receipt-print"){window.print();return;}
 if(a==="edit-book"){await beginBookingEdit(id);return;}
 if(a==="close-book-edit"){editingBookingId="";finishManageLink();render();return;}
 if(a==="save-book-edit"){
  const bookingId=editingBookingId, targetDate=val("edit-book-date");
  const targetTime=val("edit-book-time"), party=Number(val("edit-book-party"));
  if(!bookingId||!targetDate||!targetTime||!Number.isInteger(party)||party<1||party>20){
    showActionFeedback("請確認預約日期、時間及人數","error");return;
  }
  await act(async()=>{
    const result=await rpc("so_customer_edit_booking_with_items",{p_slug:slug,p_booking_id:bookingId,p_date:targetDate,p_time:targetTime,p_party:party,p_items:editChosenItems.slice()});
    editingBookingId="";editSlots=null;editChosenItems=[];finishManageLink();
    if(!result.changed)return "預約資料沒有變更";
    const notice=await sendLineNotice("notify-reservation-updated",{reservationId:bookingId});
    return "預約已更新："+targetDate+" "+targetTime+"，"+party+" 位"+customerNoticeSuffix(notice);
  });return;
 }
 if(a==="cancel-my-book"){
  if(!confirm("確定取消這筆預約嗎？取消後將無法直接復原。"))return;
  await act(async()=>{
    await rpc("so_cancel_booking",{p_id:id});
    if(editingBookingId===id)editingBookingId="";
    finishManageLink();
    const notice=await sendLineNotice("notify-reservation-cancel",{reservationId:id});
    return "預約已取消"+customerNoticeSuffix(notice);
  });return;
}
 if(a==="take"){await act(async()=>{
  if(customer?.queue_session?.code==="REST")throw Error("門市目前休場，暫停新取號");
  if(lineLinkStatus!=="linked")throw Error("請先完成 LINE 授權");
  const party=Number(val("customer-queue-party"));
  if(!Number.isInteger(party)||party<1||party>20)throw Error("請輸入 1～20 人的有效候位人數。");
  queuePartySize=party;
  const result=await rpc("so_take_number_with_party",{p_slug:slug,p_name:lineDisplayName,p_items:queueChosenItems.slice(),p_party_size:party});
  queueChosenItems=[];
  progressTicketId=result.id;crossCurrentStore=false;customerTab="progress";queueLive=null;queueLiveShop="";
  const notice=await sendLineNotice("notify-ticket",{ticketId:result.id});
  return "取號成功！您的號碼是 "+result.number+"（"+party+" 人／組）"+customerNoticeSuffix(notice);
 });return}
 if(a==="cross-filter"){
   crossFilter=b.dataset.filter||"active";crossPageSize=12;render();return;
 }
 if(a==="cross-more"){crossPageSize+=12;render();return;}
 if(a==="cross-refresh"){void refreshCrossStoreOverview();return;}
 if(a==="cross-current-store"){
   crossCurrentStore=true;queueLive=null;queueLiveShop="";
   stopCrossQueueRealtime();render();void refreshQueueProgress();return;
 }
 if(a==="cross-back"){
   progressTicketId="";crossCurrentStore=false;queueLive=null;queueLiveShop="";stopQueueRealtime();
   const u=new URL(location.href);u.searchParams.delete("ticket");
   history.replaceState(null,"",u.pathname+u.search+u.hash);
   render();syncCrossQueueRealtime();return;
 }
 if(a==="open-cross-ticket"){
   const merchant=b.dataset.merchant,ticket=b.dataset.ticket;
   if(!isSafeMerchant(merchant)||!/^[0-9a-f-]{36}$/i.test(ticket||"")){
     showActionFeedback("號碼資料不正確，請重新整理","error");return;
   }
   if(merchant===slug){
     progressTicketId=ticket;crossCurrentStore=false;customerTab="progress";stopCrossQueueRealtime();
     const u=new URL(location.href);u.searchParams.set("merchant",slug);
     u.searchParams.set("tab","progress");u.searchParams.set("ticket",ticket);
     history.replaceState(null,"",u.pathname+u.search+u.hash);
     queueLive=null;queueLiveShop="";render();void refreshQueueProgress();
   }else{
     location.assign(route("customer",merchant,"progress")+"&ticket="+encodeURIComponent(ticket));
   }
   return;
 }
 if(a==="open-cross-booking"){
   const merchant=b.dataset.merchant,booking=b.dataset.id;
   if(!isSafeMerchant(merchant)||!/^[0-9a-f-]{36}$/i.test(booking||"")){
     showActionFeedback("預約資料不正確，請重新整理","error");return;
   }
   location.assign(route("customer",merchant,"mine")+"&manage=reservation&item="+encodeURIComponent(booking)+"&mode=view");
   return;
 }
 if(a==="save-queue-near-alert"){
  if(!id||!Object.prototype.hasOwnProperty.call(queueNearAlertSettings,id))return;
  const threshold=Number(val("queue-near-alert-threshold"));
  if(![0,3,5].includes(threshold)){
    showActionFeedback("提醒設定只能選擇關閉、前方 3 組或前方 5 組。","error");return;
  }
  await act(async()=>{
    const result=await rpc("so_customer_set_queue_near_alert",{p_ticket_id:id,p_threshold:threshold});
    queueNearAlertSettings[id]=result.threshold;
    return threshold===0?"已關閉這張號碼的接近到號 LINE 提醒。":
      "已設定前方剩 "+threshold+" 組時提醒；每張票最多提醒一次。";
  });
  void refreshQueueProgress();return;
 }
 if(a==="queue-refresh"){void refreshQueueProgress();return;}
 if(a==="queue-records"){customerTab="mine";stopQueueRealtime();render();return;}
 if(a==="line-check-friendship"){await act(async()=>{
  await connectLineSession(true);
  if(lineLinkStatus!=="linked")throw Error("LINE 身分連結失敗："+(lineConnectError||"請重新授權"));
  return lineOaRecipient==="REACHABLE"?
    "已確認：平台官方帳號可以辨識這位 LINE 使用者（不代表已收到 PUSH）":
    lineOaRecipient==="NOT_REACHABLE"?
    "LINE 官方帳號無法辨識此顧客，請先加入畫面上的官方帳號，再重新檢查":
    "LINE 官方帳號查詢失敗，請確認 LINE 官方帳號與 Login 頻道設定";
 });return;}
 if(a==="line-connect"||a==="line-reauth"){
   await act(async()=>{
     const cfg=await bridgeConfig();
     if(!cfg.liffId)throw Error("LINE LIFF 尚未配置");
     // A failed OAuth callback must not be processed twice.
     recoverLineLogin(true);
     return "正在開啟 LINE 登入…";
   });return;
  }
 if(a==="hold-my-number"||a==="resume-my-number"){
   const resume=a==="resume-my-number";
   if(!id||!confirm(resume?"確定恢復候位？順位會依門市設定重新計算。":"確定保留候位？保留期間不會被叫號，且恢復可能返回隊尾。"))return;
   await act(async()=>{
     await rpc("so_customer_hold_ticket",{p_ticket_id:id,p_resume:resume});
     return resume?"已恢復候位；最新前方組數請以即時進度為準。":"號碼已保留，請在期限內恢復候位。";
   });
   queueLive=null;queueLiveShop="";void refreshQueueProgress();return;
  }
  if(a==="cancel-my-number"){
  if(!confirm("確定取消排隊號碼嗎？"))return;
  await act(async()=>{
    const ticket=(customer?.my_tickets||[]).find(x=>x.id===id);
    await rpc("so_cancel_number",{p_id:id});
    finishManageLink();
    const notice=await sendLineNotice("notify-ticket-cancel",{ticketId:id});
    return "已取消排隊"+(ticket?.number?"："+ticket.number:"")+customerNoticeSuffix(notice);
  });return;
}
 if(a==="undo-staff"){
  const previous=lastStaffChange;
  if(!previous||previous.slug!==slug){err="沒有可還原的操作";showActionFeedback(err,"error");render();return;}
  await act(async()=>{
    const proc=previous.kind==="reservation"?"so_staff_set_reservation_status":"so_staff_set_ticket_status";
    const args=previous.kind==="reservation"?
      {p_slug:slug,p_reservation_id:previous.id,p_status:previous.before,p_expected_status:previous.after}:
      {p_slug:slug,p_ticket_id:previous.id,p_status:previous.before,p_expected_status:previous.after};
    const result=await rpc(proc,args);
    if(result.changed)lastStaffChange=null;
    if(result.changed&&previous.kind==="reservation"&&previous.after==="CANCELLED"&&previous.before==="CONFIRMED"){
      const notice=await sendLineNotice("notify-reservation-restored",{reservationId:previous.id});
      return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；"+notice;
    }
    if(result.changed&&previous.kind==="ticket"&&previous.after==="CANCELLED"&&["WAITING","HOLD"].includes(previous.before)){
      const notice=await sendLineNotice("notify-ticket-restored",{ticketId:previous.id,eventId:result.line_restore_event_id});
      return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；"+notice;
    }
    return "已還原 "+previous.label+" 為「"+jsStatus(previous.before)+"」；不會重新發送 LINE 通知";
  });return;
 }

 if(a==="call-selected"){
  if(!id||!staff||!["OWNER","MANAGER","PLATFORM"].includes(staff.role))return;
  const reason=window.prompt("指定叫號原因（必填，2～200 字，將保留操作紀錄）：","");
  if(reason===null)return;
  const why=reason.trim();
  if(why.length<2||why.length>200||/[\u0000-\u001f\u007f]/.test(why)){
    showActionFeedback("請輸入 2～200 字的指定叫號原因，不可包含控制字元。","error");return;
  }
  await act(async()=>{
    const result=await rpc("so_staff_call_selected",{p_slug:slug,p_ticket_id:id,p_reason:why});
    if(result.ticket_id&&result.number)lastStaffChange={kind:"ticket",id:result.ticket_id,label:result.number,before:"WAITING",after:"CALLED",slug,day};
    const notice=await notifyLineCalled(result.number,result.ticket_id,result.line_call_event_id);
    return "已指定叫號 "+result.number+"；"+notice;
  });return;
 }
 if(["call","recall","start","complete","pass","return","cancel","checkin","no-show","cancel-book-staff"].includes(a)){
 if(["cancel","no-show","cancel-book-staff"].includes(a)&&!confirm("確定執行此操作？"))return;
 const x=a==="no-show"?"no_show":a==="cancel-book-staff"?"cancel_booking":a;
 await act(async()=>{
  const nextBefore=x==="call"?(staff?.tickets||[]).find(k=>k.status==="WAITING"):null;
  const result=await rpc("so_staff_action",{p_slug:slug,p_action:x,p_ticket_id:["call","checkin","no_show","cancel_booking"].includes(x)?null:id,p_reservation_id:["checkin","no_show","cancel_booking"].includes(x)?id:null});
  if(x==="call"&&result.number&&nextBefore)lastStaffChange={kind:"ticket",id:nextBefore.id,label:result.number,before:"WAITING",after:"CALLED",slug,day};
  if((x==="call"||x==="recall")&&result.number){
    const notice=await notifyLineCalled(result.number,result.ticket_id,result.line_call_event_id);
    return (x==="call"?"已叫號 ":"已重新呼叫 ")+result.number+"；"+notice;
  }
  let notice="";
  if(x==="cancel"&&result.ticket_id)notice=await sendLineNotice("notify-ticket-cancel",{ticketId:result.ticket_id});
  if(x==="cancel_booking"&&id)notice=await sendLineNotice("notify-reservation-cancel",{reservationId:id});
  return "已完成「"+({checkin:"到店報到",start:"開始服務",complete:"完成服務",pass:"標記過號",return:"回到候位",cancel:"取消號碼",no_show:"預約未到",cancel_booking:"取消預約"}[x]||jsStatus(x))+"」"+(result.number?"："+result.number:"")+customerNoticeSuffix(notice);
 });return;
 }
});
