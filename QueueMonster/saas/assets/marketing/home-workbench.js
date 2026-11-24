/* Small usable product preview on the merchant homepage. Client-only simulated data. */
(()=>{
 "use strict";
 const root=document.querySelector(".qm-live-workbench");
 if(!root)return;
 const tabs=[...root.querySelectorAll("[data-live-tab]")];
 const screen=root.querySelector("#qm-live-screen");
 const feedback=root.querySelector(".qm-live-feedback");
 let tab="queue",queueNumber=12,waiting=8,bookingChecked=false,orderAccepted=false;
 const number=()=>String(queueNumber).padStart(3,"0");
 const button=(action,text,disabled=false)=>'<button class="qm-live-action" type="button" data-live-action="'+action+'"'+(disabled?' disabled':'')+'>'+text+'</button>';
 const views={
  queue:()=>
   '<div class="qm-live-queue"><div class="qm-live-primary-panel"><span class="qm-live-caption">目前叫號</span>'+
   '<strong class="qm-live-number" data-live-current>A'+number()+'</strong><small>還有 <b data-live-waiting>'+waiting+'</b> 組候位</small>'+
   button("next",waiting?'叫下一位 <span aria-hidden="true">→</span>':'今日叫號完成',!waiting)+
   '</div><div class="qm-live-mirrors">'+
   '<div class="qm-live-board-panel"><span class="qm-live-board-head">店內全螢幕看板</span><strong data-live-board>A'+number()+'</strong>'+
   '<button type="button" class="qm-live-board-open" data-live-action="board" aria-label="放大顯示叫號看板示範">全螢幕看板 ↗</button></div>'+
   '<div class="qm-live-customer-panel"><span class="qm-live-phone-head">顧客手機</span><div class="qm-live-phone-screen">'+
   '<span>目前叫號</span><strong data-live-mobile>A'+number()+'</strong></div></div></div></div>',
  booking:()=>'<div class="qm-live-screen-title"><span>今天的預約</span></div>'+
   '<div class="qm-live-booking-panel"><div class="qm-live-statline"><span>待報到</span><strong>'+(bookingChecked?'1':'2')+' 筆</strong></div>'+
   '<div class="qm-live-list-row"><span class="qm-live-time">10:30</span><div><strong>剪髮服務</strong><small>線上預約・1 位</small></div><span class="qm-live-state'+(bookingChecked?' done':'')+'">'+(bookingChecked?'已報到':'待報到')+'</span></div>'+
   '<div class="qm-live-list-row"><span class="qm-live-time">11:00</span><div><strong>染髮服務</strong><small>線上預約・1 位</small></div><span class="qm-live-state">待報到</span></div>'+
   button("checkin",bookingChecked?'已完成報到 ✓':'確認 10:30 報到',bookingChecked)+
   '</div><div class="qm-live-synced"><span aria-hidden="true">✓</span> 免人工重複登記，預約清楚列出</div>',
  order:()=>'<div class="qm-live-screen-title"><span>取餐訂單</span></div>'+
   '<div class="qm-live-booking-panel"><div class="qm-live-statline"><span>待接單</span><strong>'+(orderAccepted?'0':'1')+' 筆</strong></div>'+
   '<div class="qm-live-list-row"><span class="qm-live-time">B014</span><div><strong>原味蛋餅 × 2</strong><small>冰紅茶 × 1 ・ 08:45 取餐</small></div><span class="qm-live-state'+(orderAccepted?' done':'')+'">'+(orderAccepted?'製作中':'待接單')+'</span></div>'+
   
   button("accept",orderAccepted?'已接單 ✓':'確認接單',orderAccepted)+
   '</div><div class="qm-live-synced"><span aria-hidden="true">✓</span> 接單狀態集中更新，不用口頭記單</div>'
 };
 const tips={
  queue:"按「叫下一位」，看板和顧客手機會同步顯示新號碼。",
  booking:"試按「確認報到」，預約狀態會立即更新。",
  order:"試按「確認接單」，訂單就會變成製作中。"
 };
 function setMessage(message){feedback.textContent=message}
 function render(){
  tabs.forEach(x=>{
   const on=x.dataset.liveTab===tab;
   x.setAttribute("aria-selected",String(on));
   x.tabIndex=on?0:-1;
  });
  screen.setAttribute("aria-labelledby","qm-live-tab-"+tab);
  screen.innerHTML=views[tab]();
 }
 function setTab(next,focus){
  if(!Object.hasOwn(views,next))return;
  tab=next;render();setMessage("");
  if(focus)tabs.find(x=>x.dataset.liveTab===tab)?.focus();
 }
 root.addEventListener("click",e=>{
  const t=e.target.closest("[data-live-tab]");
  if(t&&root.contains(t)){setTab(t.dataset.liveTab,false);return}
  const a=e.target.closest("[data-live-action]");
  if(!a||!root.contains(a)||a.disabled)return;
  if(a.dataset.liveAction==="board"){
   const panel=root.querySelector(".qm-live-board-panel");
   if(!panel)return;
   if(document.fullscreenElement===panel){void document.exitFullscreen?.();return}
   if(panel.classList.contains("qm-live-board-expanded")){panel.classList.remove("qm-live-board-expanded");return}
   if(typeof panel.requestFullscreen==="function"){
    void panel.requestFullscreen().catch(()=>panel.classList.add("qm-live-board-expanded"));
   }else panel.classList.add("qm-live-board-expanded");
   return;
  }
  if(a.dataset.liveAction==="next"&&waiting>0){
   queueNumber++;waiting--;
   setMessage("已叫 A"+number()+"，店內全螢幕看板與顧客手機已同步。");
  }else if(a.dataset.liveAction==="checkin"){
   bookingChecked=true;setMessage("10:30 的預約已報到，後台狀態更新。");
  }else if(a.dataset.liveAction==="accept"){
   orderAccepted=true;setMessage("訂單 B014 已接單，顯示為製作中。");
  }else return;
  render();
  window.qmMarketingTrack?.("demo_complete",{source:"home",role:"staff"});
 });
 document.addEventListener("fullscreenchange",()=>{
  const panel=root.querySelector(".qm-live-board-panel");
  const button=panel?.querySelector(".qm-live-board-open");
  if(button)button.textContent=document.fullscreenElement===panel?"離開全螢幕":"全螢幕看板 ↗";
 });
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape")root.querySelector(".qm-live-board-expanded")?.classList.remove("qm-live-board-expanded");
 });
 root.addEventListener("keydown",e=>{
  const t=e.target.closest("[data-live-tab]");
  if(!t||!["ArrowRight","ArrowLeft","Home","End"].includes(e.key))return;
  e.preventDefault();
  const i=tabs.indexOf(t),next=e.key==="Home"?0:e.key==="End"?tabs.length-1:
   (i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
  setTab(tabs[next].dataset.liveTab,true);
 });
 render();
})();
