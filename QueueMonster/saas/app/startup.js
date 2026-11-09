import {crossStoreState} from "./state/crossStoreState.js";
import {feedbackState} from "./state/feedbackState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";

import {load} from "./data-loading.js";
import {refreshQueueProgress} from "./queue-progress.js";
import {refreshCrossStoreOverview} from "./cross-store.js";



export function initializeStartup(){
window.addEventListener("focus",()=>{if(!feedbackState.busy&&["customer","staff","platform"].includes(routeState.view))load()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&routeState.view==="customer"&&routeState.customerTab==="progress"){if(queueState.progressTicketId||crossStoreState.crossCurrentStore)void refreshQueueProgress();else void refreshCrossStoreOverview();}});
setInterval(()=>{if(!document.hidden&&!feedbackState.busy&&routeState.view==="customer"&&routeState.customerTab==="progress"&&(queueState.progressTicketId||crossStoreState.crossCurrentStore))void refreshQueueProgress();},6000);
setInterval(()=>{if(!document.hidden&&!feedbackState.busy&&!document.activeElement?.matches("input,select,textarea")&&(["customer","staff","platform"].includes(routeState.view)))load()},15000);
load();
}
