import {authState} from "./state/authState.js";
import {bookingState} from "./state/bookingState.js";
import {calendarState} from "./state/calendarState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {customerState} from "./state/customerState.js";
import {feedbackState} from "./state/feedbackState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {serviceUnitsState} from "./state/serviceUnitsState.js";
import {staffHistoryState} from "./state/staffHistoryState.js";
import {staffState} from "./state/staffState.js";

import {taipei} from "./shared-ui.js";

export function lastParam(query,key){const values=query.getAll(key);return values.length?values[values.length-1]:null}

export function incomingParam(key){return lastParam(routeState.liffArgs,key)||lastParam(routeState.params,key)}

export function isSafeMerchant(value){return typeof value==="string"&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(value)}

export function refreshLiffRoute(){
 const live=new URLSearchParams(location.search);
 const rawState=live.get("liff.state")||"";
 const stateQuery=new URLSearchParams(rawState.includes("?")?rawState.slice(rawState.indexOf("?")+1):"");
 const nextMerchant=lastParam(stateQuery,"merchant")||lastParam(live,"merchant");
 if(isSafeMerchant(nextMerchant))routeState.slug=nextMerchant;
 const nextView=lastParam(stateQuery,"view")||lastParam(live,"view");
 if(["customer","staff","platform","home"].includes(nextView))routeState.view=nextView;
 const nextTab=lastParam(stateQuery,"tab")||lastParam(live,"tab");
 if(["home","reserve","queue","mine","progress"].includes(nextTab))routeState.customerTab=nextTab;
 const newTicket=lastParam(stateQuery,"ticket")||lastParam(live,"ticket");
 if(/^[0-9a-f-]{36}$/i.test(newTicket||"")){
   queueState.progressTicketId=newTicket;
   if(nextTab==="progress")routeState.customerTab="progress";
 }
 const newKind=lastParam(stateQuery,"manage")||lastParam(live,"manage");
 const newItem=lastParam(stateQuery,"item")||lastParam(live,"item");
 const newMode=lastParam(stateQuery,"mode")||lastParam(live,"mode");
 if(["reservation","ticket"].includes(newKind)&&/^[0-9a-f-]{36}$/i.test(newItem||"")){
   bookingState.manageKind=newKind;bookingState.manageItem=newItem;
   bookingState.manageMode=["edit","cancel","view"].includes(newMode)?newMode:"view";
   routeState.customerTab="mine";
 }
 // Only normalize our own duplicate query keys after LIFF has initialized.
 // Keep all LINE SDK query keys (liff.*, access_token, etc.) untouched.
 const normalized=new URL(location.href);
 for(const key of ["view","merchant","tab"]){
   const values=normalized.searchParams.getAll(key);
   if(values.length>1){
     const value=key==="merchant"?routeState.slug:key==="view"?routeState.view:routeState.customerTab;
     normalized.searchParams.delete(key);
     normalized.searchParams.set(key,value);
   }
 }
 if(normalized.href!==location.href)history.replaceState(null,"",normalized.pathname+normalized.search+normalized.hash);
}

export function initializeRouteState(){
routeState.$=id=>document.getElementById(id);
routeState.params=new URLSearchParams(location.search);
routeState.liffState=routeState.params.get("liff.state")||"";
routeState.liffArgs=new URLSearchParams(routeState.liffState.includes("?")?routeState.liffState.slice(routeState.liffState.indexOf("?")+1):"");
routeState.view=incomingParam("view")||"customer";
routeState.slug=isSafeMerchant(incomingParam("merchant"))?incomingParam("merchant"):"";
authState.session=null;
authState.context=null;
routeState.overview=[];
customerState.customer=null;
staffState.staff=null;
feedbackState.busy=false;
feedbackState.flash="";
feedbackState.err="";
staffHistoryState.staffHistoryDays=14;
staffState.analyticsDays=30;
staffState.staffAnalytics=null;
staffState.businessGroups=[];
staffState.staffNoticeHealth=null;
staffHistoryState.staffBookingSearch="";
staffHistoryState.staffBookingDateFilter="all";
staffHistoryState.staffBookingStatusFilter="all";
staffHistoryState.historicalBookingQuery="";
staffHistoryState.historicalBookingStart="";
staffHistoryState.historicalBookingEnd="";
staffHistoryState.historicalBookingStatus="ALL";
staffHistoryState.historicalBookingDeleted="active";
staffHistoryState.historicalBookingPage=1;
staffHistoryState.historicalBookingResult=null;
staffHistoryState.historicalBookingLoading=false;
staffHistoryState.historicalBookingError="";
staffHistoryState.historicalBookingToken=0;
staffHistoryState.historicalBookingTenant="";
calendarState.calendarMode="month";
calendarState.calendarAnchor=taipei();
calendarState.calendarStatus="ALL";
calendarState.calendarPage=1;
calendarState.calendarResult=null;
calendarState.calendarLoading=false;
calendarState.calendarError="";
calendarState.calendarRequestToken=0;
calendarState.calendarTenant="";
calendarState.calendarDataKey="";
bookingState.editingMenuItemId="";
bookingState.bookingChosenItems=[];
queueState.queueChosenItems=[];
bookingState.editChosenItems=[];
bookingState.serviceSlotPreview=null;
bookingState.serviceSlotRequest=0;
bookingState.serviceSlotError="";
bookingState.bookingConfirmationKey="";
staffState.announcementEditId="";
staffState.staffAnnouncements=[];
routeState.customerAnnouncements=[];
staffState.staffCustomerBook=[];
staffState.customerFlagSelected="";
staffHistoryState.customerHistoryUserId="";
staffHistoryState.customerHistoryName="";
staffHistoryState.customerHistoryPage=1;
staffHistoryState.customerHistoryData=null;
staffHistoryState.customerHistoryLoading=false;
staffHistoryState.customerHistoryError="";
staffHistoryState.customerHistorySeq=0;
routeState.day=taipei();
bookingState.bookingParty=1;
queueState.queuePartySize=2;
bookingState.bookingContactName="";
bookingState.bookingContactPhone="";
bookingState.bookingContactDirty=false;
routeState.customerTab=["home","reserve","queue","mine","progress"].includes(incomingParam("tab"))?incomingParam("tab"):"home";
staffState.staffTab=incomingParam("tab")==="settings"?"settings":"dashboard";
routeState.platformTab="dashboard";
bookingState.chosenSlot="";
routeState.registration=false;
bookingState.manageKind=["reservation","ticket"].includes(incomingParam("manage"))?incomingParam("manage"):"";
bookingState.manageItem=/^[0-9a-f-]{36}$/i.test(incomingParam("item")||"")?incomingParam("item"):"";
bookingState.manageMode=["edit","cancel","view"].includes(incomingParam("mode"))?incomingParam("mode"):"view";
bookingState.editingBookingId="";
bookingState.editDate="";
bookingState.editTime="";
bookingState.editParty=1;
bookingState.editSlots=null;
bookingState.editLoading=false;
queueState.progressTicketId=/^[0-9a-f-]{36}$/i.test(incomingParam("ticket")||"")?incomingParam("ticket"):"";
queueState.queueLive=null;
queueState.queueLiveShop="";
queueState.queueLiveLoading=false;
queueState.queueLiveError="";
queueState.queueNearAlertSettings=Object.create(null);
queueState.queueLastSuccessAt="";
queueState.queueLastSuccessShop="";
queueState.queueRealtimeChannel=null;
queueState.queueRealtimeTenant="";
crossStoreState.customerActivity={tickets:[],reservations:[]};
crossStoreState.customerActivityError="";
crossStoreState.crossLastSuccessAt="";
crossStoreState.crossLastSuccessShop="";
crossStoreState.crossFilter="active";
crossStoreState.crossPageSize=12;
crossStoreState.crossCurrentStore=false;
crossStoreState.crossRealtimeChannel=null;
crossStoreState.crossRealtimeKey="";
crossStoreState.crossRefreshBusy=false;
serviceUnitsState.unitConfig=null;
serviceUnitsState.unitRecords={reservations:[],tickets:[]};
serviceUnitsState.unitChoice="";
serviceUnitsState.unitSessionChoice="";
serviceUnitsState.unitCategory="";
serviceUnitsState.unitStaffSession="";
serviceUnitsState.unitAdminDate=taipei();
serviceUnitsState.unitEditingId="";
serviceUnitsState.unitEditingSession="";
serviceUnitsState.unitAdminUnit="";
bookingState.bookingUnitFilter="";
serviceUnitsState.unitConfirmKey="";
}
