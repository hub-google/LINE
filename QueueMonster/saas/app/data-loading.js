const CUSTOMER_BOOKING_REQUEST_KEY="line-saas-customer-booking-submission-v1";
let pendingCustomerBookingRequest=null;
// Preserve a request ID after a network timeout: retrying the identical booking
// calls the server with the SAME UUID and cannot create a second reservation.
function customerBookingRequestId(details){
 const fingerprint=JSON.stringify(details);
 const now=Date.now();
 let previous=pendingCustomerBookingRequest;
 try{
  const saved=sessionStorage.getItem(CUSTOMER_BOOKING_REQUEST_KEY);
  if(saved)previous=JSON.parse(saved);
 }catch(_error){/* Private browsing may block sessionStorage. */}
 if(previous&&previous.fingerprint===fingerprint
    &&/^[0-9a-f-]{36}$/i.test(previous.id||"")
    &&now-previous.createdAt>=0&&now-previous.createdAt<24*60*60*1000){
   pendingCustomerBookingRequest=previous;
   return previous.id;
 }
 if(!globalThis.crypto?.randomUUID)throw Error("瀏覽器不支援安全預約識別，請更新瀏覽器");
 const next={id:crypto.randomUUID(),fingerprint,createdAt:now};
 pendingCustomerBookingRequest=next;
 try{sessionStorage.setItem(CUSTOMER_BOOKING_REQUEST_KEY,JSON.stringify(next));}catch(_error){}
 return next.id;
}
function clearCustomerBookingRequest(id){
 if(pendingCustomerBookingRequest?.id===id)pendingCustomerBookingRequest=null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(CUSTOMER_BOOKING_REQUEST_KEY)||"null");
  if(saved?.id===id)sessionStorage.removeItem(CUSTOMER_BOOKING_REQUEST_KEY);
 }catch(_error){}
}
async function rpc(name,arg={}){const r=await supa.rpc(name,arg);if(r.error)throw Error(r.error.message);return r.data}
async function loadContext(){if(authReady())context=await rpc("so_my_context");else context=null}
async function load(){err="";try{

 const s=await supa.auth.getSession();if(s.error)throw s.error;session=s.data.session;
 if(view==="customer"&&!session){
   const x=await supa.auth.signInAnonymously();
   if(x.error)throw x.error;
   session=x.data.session;
 }
 if(view==="customer")await connectLineSession();
 if(view==="customer"&&lineLinkStatus==="linked"&&finishPublicHeaderLogin())return;
 if(view!=="customer"){
   await bridgeConfig();
   await loadContext();
   if(view==="staff" && session?.user && !session.user.is_anonymous &&
     !context?.platform_admin && context?.memberships?.length &&
     !context.memberships.some(m=>m.slug===slug)){
     const own=context.memberships.find(m=>m.role==="OWNER")||context.memberships[0];
     slug=own.slug;history.replaceState(null,"",route("staff",slug));
   }
 }
 if(view==="customer"){
   customer=lineLinkStatus==="linked"?await rpc("so_public_state",{p_slug:slug,p_date:day}):null;
   if(customer&&!bookingContactDirty&&!bookingContactName&&!bookingContactPhone){
     const last=(customer.my_reservations||[]).find(x=>x.phone&&/^09\d{8}$/.test(x.phone));
     if(last){bookingContactName=last.name||"";bookingContactPhone=last.phone||"";}
   }
   customerAnnouncements=[];
   if(customer){
     try{customerAnnouncements=await rpc("so_public_announcements",{p_slug:slug})||[];}
     catch(_e){customerAnnouncements=[];}
     try{const setting=await rpc("so_customer_booking_confirmation",{p_slug:slug});
       customer.booking_confirmation_required=setting?.require_confirmation!==false;
     }catch(_e){customer.booking_confirmation_required=true;}
   }
   if(customer&&chosenSlot&&!currentBookingSlots().some(x=>x.time===chosenSlot&&availableForParty(x)))chosenSlot="";
   if(lineLinkStatus==="linked"){
     try{
       customerActivity=await rpc("so_customer_cross_store_overview",{p_slug:slug});
       customerActivityError="";crossLastSuccessAt=new Date().toISOString();crossLastSuccessShop=slug;
     }catch(e){
       customerActivityError="跨店資料暫時無法同步，請重新整理。";
     }
   }
   if(customer&&customerTab==="reserve"&&!customer.tenant.modules?.reservation)customerTab="home";
   if(customer&&customerTab==="queue"&&!customer.tenant.modules?.queue)customerTab="home";
   if(customer&&manageKind==="reservation"&&manageMode==="edit"&&manageItem&&editingBookingId!==manageItem){
     const rec=(customer.my_reservations||[]).find(x=>x.id===manageItem&&x.status==="CONFIRMED");
     if(rec){
       editingBookingId=rec.id;editDate=String(rec.day);editTime=String(rec.time);editParty=Number(rec.party);
       editChosenItems=Array.isArray(rec.selected_items)?rec.selected_items.map(x=>x.id):[];
       const data=await rpc("so_public_state",{p_slug:slug,p_date:editDate});
       editSlots=data.slots||[];
     }
   }
 }
 if(view==="platform"&&platformReady()){
  const tenants=await rpc("so_platform_overview");
  // Legacy QA records remain untouched, but are not part of the production company list or totals.
  overview=(Array.isArray(tenants)?tenants:[]).filter(t=>!String(t.slug||"").startsWith("qa-")&&!["greenfield-salon","demo-clinic"].includes(t.slug));
 }
 if(view==="staff"&&authReady()&&(context?.platform_admin||context?.memberships?.some(m=>m.slug===slug))){
 const [meta,work,policy]=await Promise.all([
  rpc("so_staff_state",{p_slug:slug,p_date:taipei()}),
  rpc("so_staff_worklist",{p_slug:slug,p_history_days:staffHistoryDays}),
  rpc("so_get_booking_policy",{p_slug:slug})
 ]);
 staff={...meta,...work,bookingPolicy:policy,reservations:(work.pending_reservations||[]).concat(work.processed_reservations||[]),
   tickets:(work.active_tickets||[]).concat(work.processed_tickets||[])};
 if(staffTab==="menu")staff.resourceContext=await rpc("so_staff_resource_context",{p_slug:slug});
 if(staffTab==="analytics"&&["OWNER","MANAGER","PLATFORM"].includes(staff.role))
   staffAnalytics=await rpc("so_staff_analytics",{p_slug:slug,p_days:analyticsDays});
 if(staffTab==="dashboard"&&["OWNER","MANAGER","PLATFORM"].includes(staff.role)){
   try{staffNoticeHealth=await rpc("so_line_notice_health",{p_slug:slug})}
   catch(e){console.warn("LINE notification diagnostics unavailable")}
 }
 if(staffTab==="branches")businessGroups=await rpc("so_my_business_groups");
  if(staffTab==="settings"){
    try{staffAnnouncements=await rpc("so_staff_announcements",{p_slug:slug})||[];}
    catch(_e){staffAnnouncements=[];}
    try{staffCustomerBook=await rpc("so_staff_customer_book",{p_slug:slug})||[];}
    catch(_e){staffCustomerBook=[];}
  }
}
 else if(view==="staff")staff=null;
  if((view==="customer"&&customer)||(view==="staff"&&staff)){
    try{
      unitConfig=await rpc("so_unit_config",{p_slug:slug,p_date:view==="customer"?(customerTab==="queue"?taipei():day):unitAdminDate});
      unitRecords=await rpc("so_unit_records",{p_slug:slug});
      const active=view==="customer"&&["reserve","queue"].includes(customerTab)
        ?availableUnits(customerTab):unitList();
      if(!active.some(u=>u.id===unitChoice))unitChoice=active[0]?.id||"";
      const candidates=sessionsOf(unitChoice,view==="customer"?customerTab:"staff");
      if(!candidates.some(s=>s.id===unitSessionChoice))unitSessionChoice=candidates[0]?.id||"";
      if(!(unitConfig.sessions||[]).some(s=>s.id===unitStaffSession))unitStaffSession=(unitConfig.sessions||[])[0]?.id||"";
      const mapping=[...(unitRecords.reservations||[]),...(unitRecords.tickets||[])];
      if(view==="customer"){
        for(const [name,records] of [["my_reservations",unitRecords.reservations||[]],["my_tickets",unitRecords.tickets||[]]]){
          const map=new Map(records.map(item=>[item.id,item]));
          customer[name]=(customer[name]||[]).map(item=>({...item,...(map.get(item.id)||{})}));
        }
      }else{
        const mr=new Map((unitRecords.reservations||[]).map(item=>[item.id,item]));
        const mt=new Map((unitRecords.tickets||[]).map(item=>[item.id,item]));
        for(const key of ["pending_reservations","processed_reservations","deleted_reservations"]){
          staff[key]=(staff[key]||[]).map(item=>({...item,...(mr.get(item.id)||{})}));
        }
        for(const key of ["active_tickets","processed_tickets","deleted_tickets"]){
          staff[key]=(staff[key]||[]).map(item=>({...item,...(mt.get(item.id)||{})}));
        }
        staff.reservations=[...(staff.pending_reservations||[]),...(staff.processed_reservations||[])];
        staff.tickets=[...(staff.active_tickets||[]),...(staff.processed_tickets||[])];
      }
    }catch(unitError){unitConfig=null;unitRecords={reservations:[],tickets:[]};console.warn("Service-unit data unavailable",unitError);}
  }
 }catch(e){err=e.message||String(e)}render();
 if(view==="staff"&&staffTab==="bookings"&&historicalBookingResult&&historicalBookingTenant===slug)
   void searchHistoricalBookings(historicalBookingPage);
 if(view==="staff"&&staffTab==="calendar"&&staff)void loadBookingCalendar(calendarPage);
 if(view==="customer"&&customerTab==="reserve"&&lineLinkStatus==="linked"&&!unitEnabled()){
   void refreshServiceSlots();
 }
 if(view==="customer"&&customerTab==="progress"&&lineLinkStatus==="linked"&&(progressTicketId||crossCurrentStore)){
   stopCrossQueueRealtime();
   void refreshQueueProgress();
 }else{
   if(queueRealtimeChannel)stopQueueRealtime();
   syncCrossQueueRealtime();
 }
}
async function act(fn){if(busy)return;busy=true;err="";flash="";showActionFeedback("正在儲存，請勿重複點擊。","pending");
 document.querySelectorAll("button[data-act],input[data-status-kind],input[data-delete-kind]").forEach(x=>x.disabled=true);
 try{const m=await fn();await load();flash=m||"已成功儲存";
 const hasNoticeProblem=/提醒暫時無法送出|LINE 通知失敗|LINE 通知暫時|官方帳號查詢失敗/.test(flash);
 showActionFeedback(flash,hasNoticeProblem?"warning":"success")}
 catch(e){err=e.message||String(e);showActionFeedback(err,"error")}
 finally{busy=false;render()}
}
function checked(prefix){const m={};document.querySelectorAll("."+prefix).forEach(x=>{m[x.dataset.feature]=x.checked});return m}
function val(id){return ($(id)?.value||"").trim()}
async function urlFor(v,s){
 if(v==="customer"){
  await bridgeConfig();
  const u=customerUrl(s);
  if(!u)throw Error("LINE 顧客入口目前無法使用，請聯絡店家確認設定");
  return u;
 }
 return new URL(route(v,s),location.href).href;
}
