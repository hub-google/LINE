window.addEventListener("focus",()=>{if(!busy&&["customer","staff","platform"].includes(view))load()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&view==="customer"&&customerTab==="progress"){if(progressTicketId||crossCurrentStore)void refreshQueueProgress();else void refreshCrossStoreOverview();}});
setInterval(()=>{if(!document.hidden&&!busy&&view==="customer"&&customerTab==="progress"&&(progressTicketId||crossCurrentStore))void refreshQueueProgress();},6000);
setInterval(()=>{if(!document.hidden&&!busy&&!document.activeElement?.matches("input,select,textarea")&&(["customer","staff","platform"].includes(view)))load()},15000);
load();
