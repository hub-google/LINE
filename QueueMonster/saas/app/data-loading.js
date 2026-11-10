import {authState} from "./state/authState.js";
import {bookingState} from "./state/bookingState.js";
import {calendarState} from "./state/calendarState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {customerState} from "./state/customerState.js";
import {dataLoadingState} from "./state/dataLoadingState.js";
import {feedbackState} from "./state/feedbackState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";
import {sharedUiState} from "./state/sharedUiState.js";
import {staffHistoryState} from "./state/staffHistoryState.js";
import {staffState} from "./state/staffState.js";





import {authReady,platformReady,showActionFeedback,taipei,customerFacingError} from "./shared-ui.js";
import {bridgeConfig,connectLineSession,customerUrl,finishPublicHeaderLogin} from "./line-session.js";
import {availableForParty,currentBookingSlots,refreshServiceSlots} from "./customer-booking.js";
import {availableUnits,sessionsOf,unitList} from "./service-units.js";
import {render} from "./staff-layout.js";
import {searchHistoricalBookings} from "./staff-history.js";
import {loadBookingCalendar} from "./booking-calendar.js";
import {stopCrossQueueRealtime,syncCrossQueueRealtime} from "./cross-store.js";
import {refreshQueueProgress,stopQueueRealtime} from "./queue-progress.js";

export function customerBookingRequestId(details){
 const fingerprint=JSON.stringify(details);
 const now=Date.now();
 let previous=dataLoadingState.pendingCustomerBookingRequest;
 try{
  const saved=sessionStorage.getItem(dataLoadingState.CUSTOMER_BOOKING_REQUEST_KEY);
  if(saved)previous=JSON.parse(saved);
 }catch(_error){/* Private browsing may block sessionStorage. */}
 if(previous&&previous.fingerprint===fingerprint
    &&/^[0-9a-f-]{36}$/i.test(previous.id||"")
    &&now-previous.createdAt>=0&&now-previous.createdAt<24*60*60*1000){
   dataLoadingState.pendingCustomerBookingRequest=previous;
   return previous.id;
 }
 if(!globalThis.crypto?.randomUUID)throw Error("瀏覽器不支援安全預約識別，請更新瀏覽器");
 const next={id:crypto.randomUUID(),fingerprint,createdAt:now};
 dataLoadingState.pendingCustomerBookingRequest=next;
 try{sessionStorage.setItem(dataLoadingState.CUSTOMER_BOOKING_REQUEST_KEY,JSON.stringify(next));}catch(_error){}
 return next.id;
}

export function clearCustomerBookingRequest(id){
 if(dataLoadingState.pendingCustomerBookingRequest?.id===id)dataLoadingState.pendingCustomerBookingRequest=null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(dataLoadingState.CUSTOMER_BOOKING_REQUEST_KEY)||"null");
  if(saved?.id===id)sessionStorage.removeItem(dataLoadingState.CUSTOMER_BOOKING_REQUEST_KEY);
 }catch(_error){}
}

export async function rpc(name,arg={}){const r=await lineState.supa.rpc(name,arg);if(r.error)throw Error(customerFacingError(r.error));return r.data}

export async function loadContext(){if(authReady())authState.context=await rpc("so_my_context");else authState.context=null}

export async function load(){feedbackState.err="";try{

 const s=await lineState.supa.auth.getSession();if(s.error)throw s.error;authState.session=s.data.session;
 if(routeState.view==="customer"&&!authState.session){
   const x=await lineState.supa.auth.signInAnonymously();
   if(x.error)throw x.error;
   authState.session=x.data.session;
 }
 if(routeState.view==="customer")await connectLineSession();
 if(routeState.view==="customer"&&lineState.lineLinkStatus==="linked"&&finishPublicHeaderLogin())return;
 // A platform-wide LINE login intentionally has no store until the customer chooses one.
 if(routeState.view==="customer"&&!routeState.slug){
   customerState.customer=null;
   render();
   return;
 }
 if(routeState.view!=="customer"){
   await bridgeConfig();
   await loadContext();
   if(routeState.view==="staff" && authState.session?.user && !authState.session.user.is_anonymous &&
     !authState.context?.platform_admin && authState.context?.memberships?.length &&
     !authState.context.memberships.some(m=>m.slug===routeState.slug)){
     const own=authState.context.memberships.find(m=>m.role==="OWNER")||authState.context.memberships[0];
     routeState.slug=own.slug;history.replaceState(null,"",sharedUiState.route("staff",routeState.slug));
   }
 }
 if(routeState.view==="customer"){
   customerState.customer=lineState.lineLinkStatus==="linked"?await rpc("so_public_state",{p_slug:routeState.slug,p_date:routeState.day}):null;
   if(customerState.customer){
     try{customerState.customer.homepage=await rpc("so_get_customer_homepage",{p_slug:routeState.slug});}
     catch(error){console.warn("顧客首頁顯示設定讀取失敗",error);customerState.customer.homepage=null;}
   }
   if(customerState.customer&&!bookingState.bookingContactDirty&&!bookingState.bookingContactName&&!bookingState.bookingContactPhone){
     const last=(customerState.customer.my_reservations||[]).find(x=>x.phone&&/^09\d{8}$/.test(x.phone));
     if(last){bookingState.bookingContactName=last.name||"";bookingState.bookingContactPhone=last.phone||"";}
   }
   routeState.customerAnnouncements=[];
   if(customerState.customer){
     try{routeState.customerAnnouncements=await rpc("so_public_announcements",{p_slug:routeState.slug})||[];}
     catch(_e){routeState.customerAnnouncements=[];}
     try{const setting=await rpc("so_customer_booking_confirmation",{p_slug:routeState.slug});
       customerState.customer.booking_confirmation_required=setting?.require_confirmation!==false;
     }catch(_e){customerState.customer.booking_confirmation_required=true;}
   }
   if(customerState.customer&&bookingState.chosenSlot&&!currentBookingSlots().some(x=>x.time===bookingState.chosenSlot&&availableForParty(x)))bookingState.chosenSlot="";
   if(lineState.lineLinkStatus==="linked"){
     try{
       crossStoreState.customerActivity=await rpc("so_customer_cross_store_overview",{p_slug:routeState.slug});
       crossStoreState.customerActivityError="";crossStoreState.crossLastSuccessAt=new Date().toISOString();crossStoreState.crossLastSuccessShop=routeState.slug;
     }catch(e){
       crossStoreState.customerActivityError="跨店資料暫時無法同步，請重新整理。";
     }
   }
   if(customerState.customer&&routeState.customerTab==="reserve"&&!customerState.customer.tenant.modules?.reservation)routeState.customerTab="home";
   if(customerState.customer&&routeState.customerTab==="queue"&&!customerState.customer.tenant.modules?.queue)routeState.customerTab="home";
   if(customerState.customer&&bookingState.manageKind==="reservation"&&bookingState.manageMode==="edit"&&bookingState.manageItem&&bookingState.editingBookingId!==bookingState.manageItem){
     const rec=(customerState.customer.my_reservations||[]).find(x=>x.id===bookingState.manageItem&&x.status==="CONFIRMED");
     if(rec){
       bookingState.editingBookingId=rec.id;bookingState.editDate=String(rec.day);bookingState.editTime=String(rec.time);bookingState.editParty=Number(rec.party);
       bookingState.editChosenItems=Array.isArray(rec.selected_items)?rec.selected_items.map(x=>x.id):[];
       const data=await rpc("so_public_state",{p_slug:routeState.slug,p_date:bookingState.editDate});
       bookingState.editSlots=data.slots||[];
     }
   }
 }
 if(routeState.view==="platform"&&platformReady()){
  const tenants=await rpc("so_platform_overview");
  routeState.overview=Array.isArray(tenants)?tenants:[];
 }
 if(routeState.view==="staff"&&authReady()&&(authState.context?.platform_admin||authState.context?.memberships?.some(m=>m.slug===routeState.slug))){
 const [meta,work,policy]=await Promise.all([
  rpc("so_staff_state",{p_slug:routeState.slug,p_date:taipei()}),
  rpc("so_staff_worklist",{p_slug:routeState.slug,p_history_days:staffHistoryState.staffHistoryDays}),
  rpc("so_get_booking_policy",{p_slug:routeState.slug})
 ]);
 staffState.staff={...meta,...work,bookingPolicy:policy,reservations:(work.pending_reservations||[]).concat(work.processed_reservations||[]),
   tickets:(work.active_tickets||[]).concat(work.processed_tickets||[])};
 if(staffState.staffTab==="menu")staffState.staff.resourceContext=await rpc("so_staff_resource_context",{p_slug:routeState.slug});
 if(staffState.staffTab==="analytics"&&["OWNER","MANAGER","PLATFORM"].includes(staffState.staff.role))
   staffState.staffAnalytics=await rpc("so_staff_analytics",{p_slug:routeState.slug,p_days:staffState.analyticsDays});
 if(staffState.staffTab==="dashboard"&&["OWNER","MANAGER","PLATFORM"].includes(staffState.staff.role)){
   try{staffState.staffNoticeHealth=await rpc("so_line_notice_health",{p_slug:routeState.slug})}
   catch(e){console.warn("LINE notification diagnostics unavailable")}
 }
 if(staffState.staffTab==="branches")staffState.businessGroups=await rpc("so_my_business_groups");
  if(staffState.staffTab==="settings"){
    try{staffState.customerHomepageCopy=await rpc("so_get_customer_homepage",{p_slug:routeState.slug});}
    catch(error){console.warn("顧客首頁顯示設定讀取失敗",error);staffState.customerHomepageCopy=null;}
    try{staffState.staffAnnouncements=await rpc("so_staff_announcements",{p_slug:routeState.slug})||[];}
    catch(_e){staffState.staffAnnouncements=[];}
    try{staffState.staffCustomerBook=await rpc("so_staff_customer_book",{p_slug:routeState.slug})||[];}
    catch(_e){staffState.staffCustomerBook=[];}
  }
}
 else if(routeState.view==="staff")staffState.staff=null;
  if((routeState.view==="customer"&&customerState.customer)||(routeState.view==="staff"&&staffState.staff)){
    try{
      serviceUnitsState.unitConfig=await rpc("so_unit_config",{p_slug:routeState.slug,p_date:routeState.view==="customer"?(routeState.customerTab==="queue"?taipei():routeState.day):serviceUnitsState.unitAdminDate});
      serviceUnitsState.unitRecords=await rpc("so_unit_records",{p_slug:routeState.slug});
      const active=routeState.view==="customer"&&["reserve","queue"].includes(routeState.customerTab)
        ?availableUnits(routeState.customerTab):unitList();
      if(!active.some(u=>u.id===serviceUnitsState.unitChoice))serviceUnitsState.unitChoice=active[0]?.id||"";
      const candidates=sessionsOf(serviceUnitsState.unitChoice,routeState.view==="customer"?routeState.customerTab:"staff");
      if(!candidates.some(s=>s.id===serviceUnitsState.unitSessionChoice))serviceUnitsState.unitSessionChoice=candidates[0]?.id||"";
      if(!(serviceUnitsState.unitConfig.sessions||[]).some(s=>s.id===serviceUnitsState.unitStaffSession))serviceUnitsState.unitStaffSession=(serviceUnitsState.unitConfig.sessions||[])[0]?.id||"";
      const mapping=[...(serviceUnitsState.unitRecords.reservations||[]),...(serviceUnitsState.unitRecords.tickets||[])];
      if(routeState.view==="customer"){
        for(const [name,records] of [["my_reservations",serviceUnitsState.unitRecords.reservations||[]],["my_tickets",serviceUnitsState.unitRecords.tickets||[]]]){
          const map=new Map(records.map(item=>[item.id,item]));
          customerState.customer[name]=(customerState.customer[name]||[]).map(item=>({...item,...(map.get(item.id)||{})}));
        }
      }else{
        const mr=new Map((serviceUnitsState.unitRecords.reservations||[]).map(item=>[item.id,item]));
        const mt=new Map((serviceUnitsState.unitRecords.tickets||[]).map(item=>[item.id,item]));
        for(const key of ["pending_reservations","processed_reservations","deleted_reservations"]){
          staffState.staff[key]=(staffState.staff[key]||[]).map(item=>({...item,...(mr.get(item.id)||{})}));
        }
        for(const key of ["active_tickets","processed_tickets","deleted_tickets"]){
          staffState.staff[key]=(staffState.staff[key]||[]).map(item=>({...item,...(mt.get(item.id)||{})}));
        }
        staffState.staff.reservations=[...(staffState.staff.pending_reservations||[]),...(staffState.staff.processed_reservations||[])];
        staffState.staff.tickets=[...(staffState.staff.active_tickets||[]),...(staffState.staff.processed_tickets||[])];
      }
    }catch(unitError){serviceUnitsState.unitConfig=null;serviceUnitsState.unitRecords={reservations:[],tickets:[]};console.warn("Service-unit data unavailable",unitError);}
  }
 }catch(e){feedbackState.err=customerFacingError(e)}render();
 if(routeState.view==="staff"&&staffState.staffTab==="bookings"&&staffHistoryState.historicalBookingResult&&staffHistoryState.historicalBookingTenant===routeState.slug)
   void searchHistoricalBookings(staffHistoryState.historicalBookingPage);
 if(routeState.view==="staff"&&staffState.staffTab==="calendar"&&staffState.staff)void loadBookingCalendar(calendarState.calendarPage);
 if(routeState.view==="customer"&&routeState.customerTab==="reserve"&&lineState.lineLinkStatus==="linked"&&!serviceUnitsState.unitEnabled()){
   void refreshServiceSlots();
 }
 if(routeState.view==="customer"&&routeState.customerTab==="progress"&&lineState.lineLinkStatus==="linked"&&(queueState.progressTicketId||crossStoreState.crossCurrentStore)){
   stopCrossQueueRealtime();
   void refreshQueueProgress();
 }else{
   if(queueState.queueRealtimeChannel)stopQueueRealtime();
   syncCrossQueueRealtime();
 }
}

export async function act(fn){if(feedbackState.busy)return;feedbackState.busy=true;feedbackState.err="";feedbackState.flash="";showActionFeedback("正在儲存，請勿重複點擊。","pending");
 document.querySelectorAll("button[data-act],input[data-status-kind],input[data-delete-kind]").forEach(x=>x.disabled=true);
 try{const m=await fn();await load();feedbackState.flash=m||"已成功儲存";
 const hasNoticeProblem=/提醒暫時無法送出|LINE 通知失敗|LINE 通知暫時|官方帳號查詢失敗|邀請信未能寄出/.test(feedbackState.flash);
 showActionFeedback(feedbackState.flash,hasNoticeProblem?"warning":"success")}
 catch(e){feedbackState.err=customerFacingError(e);showActionFeedback(feedbackState.err,"error")}
 finally{feedbackState.busy=false;render()}
}

export function checked(prefix){const m={};document.querySelectorAll("."+prefix).forEach(x=>{m[x.dataset.feature]=x.checked});return m}

export function val(id){return (routeState.$(id)?.value||"").trim()}

export async function urlFor(v,s){
 if(v==="customer"){
  await bridgeConfig();
  const u=customerUrl(s);
  if(!u)throw Error("LINE 顧客入口目前無法使用，請聯絡店家確認設定");
  return u;
 }
 return new URL(sharedUiState.route(v,s),location.href).href;
}

export function initializeDataLoading(){
dataLoadingState.CUSTOMER_BOOKING_REQUEST_KEY="line-saas-customer-booking-submission-v1";
dataLoadingState.pendingCustomerBookingRequest=null;
}
