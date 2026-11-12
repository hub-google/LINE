import {load} from "./data-loading.js";
import {refreshQueueProgress} from "./queue-progress.js";
import {refreshCrossStoreOverview} from "./cross-store.js";
import {createStoreLiveSync} from "../store-live-sync.js";
import {routeState} from "./state/routeState.js";
import {lineState} from "./state/lineState.js";
import {staffState} from "./state/staffState.js";
import {feedbackState} from "./state/feedbackState.js";
import {queueState} from "./state/queueState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {bookingState} from "./state/bookingState.js";

const validMerchant=slug=>/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug||"");
function operationalPage(){
  // Marketing home, search/directory and HQ/platform are not live subscribers.
  if(!validMerchant(routeState.slug))return false;
  if(routeState.view==="customer")return lineState.lineLinkStatus==="linked";
  if(routeState.view==="staff")return !!staffState.staff;
  return false;
}
function canReloadBusinessData(){
  // A live booking update must never discard form input in progress.
  if(feedbackState.busy||document.documentElement.dataset.unsavedMerchantLogo==="true")return false;
  if(document.activeElement?.matches("input,select,textarea,[contenteditable='true']"))return false;
  if(routeState.view==="staff"&&!["dashboard","queue","bookings","calendar","orders"].includes(staffState.staffTab))return false;
  return true;
}
async function updateVisibleRecords(){
  if(routeState.view==="customer"&&routeState.customerTab==="progress"&&lineState.lineLinkStatus==="linked"){
    if(queueState.progressTicketId||crossStoreState.crossCurrentStore){
      await refreshQueueProgress();
    }else{
      await refreshCrossStoreOverview();
    }
  }else{
    // Reuse the existing merchant/customer loading and rendering workflow;
    // never introduce a second duplicate booking or queue data model.
    await load();
  }
}
export function initializeStartup(){
  // Restore the correct per-record screen when browser Back/Forward is pressed.
  window.addEventListener("popstate",()=>{
    if(routeState.view!=="customer")return;
    const params=new URLSearchParams(location.search);
    const tab=params.get("tab")||"home";
    routeState.customerTab=["home","reserve","queue","order","mine","progress","detail"].includes(tab)?tab:"home";
    routeState.detailKind=["reservation","order"].includes(params.get("kind"))?params.get("kind"):"";
    routeState.detailId=/^[0-9a-f-]{36}$/i.test(params.get("item")||"")?params.get("item"):"";
    if(routeState.customerTab==="detail"&&(!routeState.detailKind||!routeState.detailId))routeState.customerTab="mine";
    queueState.progressTicketId=/^[0-9a-f-]{36}$/i.test(params.get("ticket")||"")?params.get("ticket"):"";
    bookingState.manageKind="";bookingState.manageItem="";bookingState.manageMode="view";
    void load();
  });
  // No network timers for HQ, marketing home, directory or other static pages.
  void load().finally(()=>{
    if(!validMerchant(routeState.slug)||!["customer","staff"].includes(routeState.view))return;
    const merchant=routeState.slug;
    const sync=createStoreLiveSync({
      client:lineState.supa,
      slug:merchant,
      isActive:()=>routeState.slug===merchant&&operationalPage(),
      canRefresh:canReloadBusinessData,
      refresh:updateVisibleRecords,
      onModeChange:mode=>{
        document.documentElement.dataset.storeLiveMode=mode;
      }
    });
    sync.start();
  });
}
