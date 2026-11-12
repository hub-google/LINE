import {bookingState} from "./state/bookingState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {customerState} from "./state/customerState.js";
import {feedbackState} from "./state/feedbackState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";
import {staffHistoryState} from "./state/staffHistoryState.js";
import {staffState} from "./state/staffState.js";
import {staffViewState} from "./state/staffViewState.js";
import {isStaffListKey} from "./staff-list.js";
import {handleAccountPlatform} from "./actions/account-platform.js";
import {handleMerchantSettings} from "./actions/merchant-settings.js";
import {handleStaffCalendar} from "./actions/staff-calendar.js";
import {handleQueueSettings} from "./actions/queue-settings.js";
import {handleServiceUnitActions} from "./actions/service-unit-actions.js";
import {handleMerchantAdmin} from "./actions/merchant-admin.js";
import {handleBookingSubmit} from "./actions/booking-submit.js";
import {handleBookingRecordActions} from "./actions/booking-record-actions.js";
import {handleCrossStoreActions} from "./actions/cross-store-actions.js";
import {handleQueueLineActions} from "./actions/queue-line-actions.js";
import {handleStaffQueueActions} from "./actions/staff-queue-actions.js";
import {handlePickupAction} from "./pickup-mode.js";



import {loadCustomerHistory,searchHistoricalBookings} from "./staff-history.js";
import {merchantClearLogo,merchantSetAccent} from "./merchant-brand.js";
import {dismissActionFeedback,showActionFeedback,taipei} from "./shared-ui.js";
import {render} from "./staff-layout.js";
import {availableUnits} from "./service-units.js";
import {load} from "./data-loading.js";
import {stopQueueRealtime} from "./queue-progress.js";
import {returnToCustomerHistory} from "./customer-detail.js";
import {refreshCrossStoreOverview,stopCrossQueueRealtime} from "./cross-store.js";
import {availableForParty,currentBookingSlots,refreshServiceSlots} from "./customer-booking.js";
import {loadBookingCalendar} from "./booking-calendar.js";

export function registerClickActions(){
document.addEventListener("click",async ev=>{
 const historyLink=ev.target.closest("a[data-customer-history-id]");
 if(historyLink){
   ev.preventDefault();
   if(routeState.view!=="staff"||!["settings","customers"].includes(staffState.staffTab)||feedbackState.busy)return;
   const userId=historyLink.dataset.customerHistoryId||"";
   const match=staffState.staffCustomerBook.find(x=>x.id===userId);
   if(!match)return;
   staffHistoryState.customerHistoryUserId=userId;staffHistoryState.customerHistoryName=match.name||"LINE 顧客";
   staffHistoryState.customerHistoryPage=1;staffHistoryState.customerHistoryData=null;staffHistoryState.customerHistoryError="";
   void loadCustomerHistory(1);return;
 }
 const b=ev.target.closest("button");if(!b||feedbackState.busy)return;
 if(b.dataset.colorPreset&&b.dataset.colorFor){merchantSetAccent(b.dataset.colorFor,b.dataset.colorPreset);return;}
 if(b.dataset.logoClear){merchantClearLogo(b.dataset.logoClear);return;}
 if(b.dataset.act==="dismiss-feedback"){dismissActionFeedback();feedbackState.flash="";feedbackState.err="";render();return;}
 if(b.dataset.act==="staff-show-more"){
  const key=b.dataset.listKey||"";
  if(!isStaffListKey(key))return;
  staffViewState.staffVisibleLimits.set(key,Math.min(500,(staffViewState.staffVisibleLimits.get(key)||12)+12));
  render();return;
 }
 if(b.dataset.act==="settings-section"){
   const section=b.dataset.section;
   if(!["profile","operations","catalog","public"].includes(section))return;
   staffState.settingsSection=section;
   if(routeState.view==="staff")staffState.staffTab="settings";
   void load();return;
 }
 if(b.dataset.act==="open-bookings"||b.dataset.act==="open-queue"){
 staffState.staffTab=b.dataset.act==="open-bookings"?"bookings":"queue";feedbackState.err="";render();
 if(staffState.staffTab==="bookings")void searchHistoricalBookings(1);
 return;
}
 if(b.dataset.act==="unit-category-pill"){
   serviceUnitsState.unitCategory=b.dataset.category||"";serviceUnitsState.unitChoice=availableUnits(routeState.customerTab)[0]?.id||"";serviceUnitsState.unitSessionChoice="";render();return;
 }
 if(b.dataset.act==="unit-choose"){
   serviceUnitsState.unitChoice=b.dataset.id;serviceUnitsState.unitSessionChoice="";serviceUnitsState.unitConfirmKey="";render();return;
 }
 if(b.dataset.act==="unit-home-select"){
   serviceUnitsState.unitChoice=b.dataset.id;serviceUnitsState.unitSessionChoice="";serviceUnitsState.unitConfirmKey="";routeState.customerTab=customerState.customer?.tenant?.modules?.reservation?"reserve":"queue";
   void load();return;
 }
 if(b.dataset.nav){const v=b.dataset.nav;const tab=b.dataset.tab;if(v==="customer"){
  const wasRecordScreen=["detail","progress"].includes(routeState.customerTab);
  routeState.customerTab=tab;queueState.progressTicketId="";crossStoreState.crossCurrentStore=false;
  if(wasRecordScreen){
   routeState.detailKind="";routeState.detailId="";
   const u=new URL(location.href);u.searchParams.set("tab",tab);
   for(const key of ["kind","item","ticket","mode","manage"])u.searchParams.delete(key);
   history.pushState(null,"",u.pathname+u.search+u.hash);
  }
  if(tab==="order"){void load();return;}
  if(["reserve","queue"].includes(tab)&&!customerState.customer?.tenant.modules[tab==="reserve"?"reservation":"queue"])routeState.customerTab="home";
  stopQueueRealtime();
  if(serviceUnitsState.unitEnabled()&&["queue","reserve"].includes(routeState.customerTab)){
    if(routeState.customerTab==="queue")routeState.day=taipei();
    void load();return;
  }
  if(routeState.customerTab==="progress"){queueState.queueLive=null;queueState.queueLiveShop="";void refreshCrossStoreOverview();}
  if(routeState.customerTab==="reserve"&&!serviceUnitsState.unitEnabled())void refreshServiceSlots();
  else stopCrossQueueRealtime();
  /* Customer subviews change in-place on the same page. */
 }
 if(v==="staff"){
   staffState.staffTab=tab;
   if(tab==="orders"){void load();return;}
   if(["analytics","branches","menu","settings","units","customers"].includes(tab)){if(tab==="settings")staffState.settingsSection="profile";void load();return;}
    if(tab==="bookings"){feedbackState.err="";feedbackState.flash="";render();void searchHistoricalBookings(1);return;}
    if(tab==="calendar"){feedbackState.err="";feedbackState.flash="";render();void loadBookingCalendar(1);return;}
 }
 if(v==="platform")routeState.platformTab=tab;feedbackState.err="";feedbackState.flash="";render();return}
 if(b.dataset.slot){
  const option=currentBookingSlots().find(x=>x.time===b.dataset.slot);
  if(!availableForParty(option)){
    showActionFeedback("此時段剩餘名額不足，請更換時間或人數。","warning");return;
  }
  bookingState.chosenSlot=b.dataset.slot;render();return;
 }
 const a=b.dataset.act,id=b.dataset.id;
 if(!a)return;
 if(a==="detail-history"){
   returnToCustomerHistory();stopQueueRealtime();render();void refreshCrossStoreOverview();return;
 }
 if(a==="detail-refresh"){void load();return;}
 if(a==="open-linked-ticket"){
   const ticket=b.dataset.ticket||"";
   if(!/^[0-9a-f-]{36}$/i.test(ticket))return;
   queueState.progressTicketId=ticket;
   queueState.queueLive=null;queueState.queueLiveShop="";
   crossStoreState.crossCurrentStore=false;routeState.customerTab="progress";
   const u=new URL(location.href);u.searchParams.set("tab","progress");u.searchParams.set("ticket",ticket);
   for(const key of ["kind","item","mode","manage"])u.searchParams.delete(key);
   history.pushState(null,"",u.pathname+u.search+u.hash);
   render();void refreshQueueProgress();return;
 }

 for(const handler of [handlePickupAction,handleAccountPlatform,handleMerchantSettings,handleStaffCalendar,handleQueueSettings,handleServiceUnitActions,handleMerchantAdmin,handleBookingSubmit,handleBookingRecordActions,handleCrossStoreActions,handleQueueLineActions,handleStaffQueueActions]){if(await handler(ev,b,a,id))return;}
});
}

export function initializeClickActions(){
registerClickActions();
}
