const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const liffState=params.get("liff.state")||"";
const liffArgs=new URLSearchParams(liffState.includes("?")?liffState.slice(liffState.indexOf("?")+1):"");
// On the primary LIFF redirect, liff.state owns the requested merchant;
// after liff.init(), LINE appends restored parameters to the secondary URL.
// Do not normalize SDK query fields until initialization has completed.
function lastParam(query,key){const values=query.getAll(key);return values.length?values[values.length-1]:null}
function incomingParam(key){return lastParam(liffArgs,key)||lastParam(params,key)}
function isSafeMerchant(value){return typeof value==="string"&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(value)}
function refreshLiffRoute(){
 const live=new URLSearchParams(location.search);
 const rawState=live.get("liff.state")||"";
 const stateQuery=new URLSearchParams(rawState.includes("?")?rawState.slice(rawState.indexOf("?")+1):"");
 const nextMerchant=lastParam(stateQuery,"merchant")||lastParam(live,"merchant");
 if(isSafeMerchant(nextMerchant))slug=nextMerchant;
 const nextView=lastParam(stateQuery,"view")||lastParam(live,"view");
 if(["customer","staff","platform","home"].includes(nextView))view=nextView;
 const nextTab=lastParam(stateQuery,"tab")||lastParam(live,"tab");
 if(["home","reserve","queue","mine","progress"].includes(nextTab))customerTab=nextTab;
 const newTicket=lastParam(stateQuery,"ticket")||lastParam(live,"ticket");
 if(/^[0-9a-f-]{36}$/i.test(newTicket||"")){
   progressTicketId=newTicket;
   if(nextTab==="progress")customerTab="progress";
 }
 const newKind=lastParam(stateQuery,"manage")||lastParam(live,"manage");
 const newItem=lastParam(stateQuery,"item")||lastParam(live,"item");
 const newMode=lastParam(stateQuery,"mode")||lastParam(live,"mode");
 if(["reservation","ticket"].includes(newKind)&&/^[0-9a-f-]{36}$/i.test(newItem||"")){
   manageKind=newKind;manageItem=newItem;
   manageMode=["edit","cancel","view"].includes(newMode)?newMode:"view";
   customerTab="mine";
 }
 // Only normalize our own duplicate query keys after LIFF has initialized.
 // Keep all LINE SDK query keys (liff.*, access_token, etc.) untouched.
 const normalized=new URL(location.href);
 for(const key of ["view","merchant","tab"]){
   const values=normalized.searchParams.getAll(key);
   if(values.length>1){
     const value=key==="merchant"?slug:key==="view"?view:customerTab;
     normalized.searchParams.delete(key);
     normalized.searchParams.set(key,value);
   }
 }
 if(normalized.href!==location.href)history.replaceState(null,"",normalized.pathname+normalized.search+normalized.hash);
}
let view=incomingParam("view")||"customer",slug=(isSafeMerchant(incomingParam("merchant"))?incomingParam("merchant"):null)||"greenfield-salon";
let session=null,context=null,overview=[],customer=null,staff=null,busy=false,flash="",err="";
let staffHistoryDays=14,analyticsDays=30,staffAnalytics=null,businessGroups=[],staffNoticeHealth=null;
let staffBookingSearch="",staffBookingDateFilter="all",staffBookingStatusFilter="all";
let historicalBookingQuery="",historicalBookingStart="",historicalBookingEnd="";
let historicalBookingStatus="ALL",historicalBookingDeleted="active",historicalBookingPage=1;
let historicalBookingResult=null,historicalBookingLoading=false,historicalBookingError="";
let historicalBookingToken=0,historicalBookingTenant="";
let calendarMode="month",calendarAnchor=taipei(),calendarStatus="ALL";
let calendarPage=1,calendarResult=null,calendarLoading=false,calendarError="";
let calendarRequestToken=0,calendarTenant="",calendarDataKey="";
let editingMenuItemId="",bookingChosenItems=[],queueChosenItems=[],editChosenItems=[];
let serviceSlotPreview=null,serviceSlotRequest=0,serviceSlotError="";
let bookingConfirmationKey="";
let announcementEditId="",staffAnnouncements=[],customerAnnouncements=[],staffCustomerBook=[],customerFlagSelected="";
let customerHistoryUserId="",customerHistoryName="",customerHistoryPage=1,customerHistoryData=null;
let customerHistoryLoading=false,customerHistoryError="",customerHistorySeq=0;
let day=taipei(),bookingParty=1,queuePartySize=2,bookingContactName="",bookingContactPhone="",bookingContactDirty=false,customerTab=["home","reserve","queue","mine","progress"].includes(incomingParam("tab"))?incomingParam("tab"):"home",staffTab=(incomingParam("tab")==="settings"?"settings":"dashboard"),platformTab="dashboard",chosenSlot="",registration=false;
let manageKind=["reservation","ticket"].includes(incomingParam("manage"))?incomingParam("manage"):"";
let manageItem=/^[0-9a-f-]{36}$/i.test(incomingParam("item")||"")?incomingParam("item"):"";
let manageMode=["edit","cancel","view"].includes(incomingParam("mode"))?incomingParam("mode"):"view";
let editingBookingId="",editDate="",editTime="",editParty=1,editSlots=null,editLoading=false;
let progressTicketId=/^[0-9a-f-]{36}$/i.test(incomingParam("ticket")||"")?incomingParam("ticket"):"";
let queueLive=null,queueLiveShop="",queueLiveLoading=false,queueLiveError="";
// Ticket-scoped, verified LINE reminder preference; never localStorage or a mock.
const queueNearAlertSettings=Object.create(null);
let queueLastSuccessAt="",queueLastSuccessShop="";
let queueRealtimeChannel=null,queueRealtimeTenant="";
let customerActivity={tickets:[],reservations:[]},customerActivityError="";
let crossLastSuccessAt="",crossLastSuccessShop="";
let crossFilter="active",crossPageSize=12,crossCurrentStore=false,crossRealtimeChannel=null,crossRealtimeKey="",crossRefreshBusy=false;


/* Unified service units: industry-neutral opt-in over existing booking and queue modules. */
let unitConfig=null,unitRecords={reservations:[],tickets:[]};
let unitChoice="",unitSessionChoice="",unitCategory="",unitStaffSession="",unitAdminDate=taipei();
let unitEditingId="",unitEditingSession="",unitAdminUnit="",bookingUnitFilter="",unitConfirmKey="";
