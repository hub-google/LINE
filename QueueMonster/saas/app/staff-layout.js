import {routeState} from "./state/routeState.js";
import {staffLayoutState} from "./state/staffLayoutState.js";
import {staffState} from "./state/staffState.js";


import {head,message,renderHome} from "./shared-ui.js";
import {platformRender} from "./platform-view.js";
import {staffRender} from "./staff-view.js";
import {customerRender} from "./customer-booking.js";
import {customerHistoryDialog} from "./staff-history.js";

export function enhanceStaffUI(){
 if(routeState.view!=="staff"||!staffState.staff)return;
 const root=document.querySelector("#root .content");
 if(!root)return;
 for(const card of root.querySelectorAll("section.card")){
  const heading=card.querySelector(":scope > h2");
  if(!heading)continue;
  const label=heading.textContent.trim();
  if(!(staffLayoutState.staffSecondaryByTab[staffState.staffTab]||[]).some(prefix=>label.startsWith(prefix)))continue;
  const key=staffState.staffTab+":panel:"+label.replace(/（.*$/,"");
  const detail=document.createElement("details");
  detail.className="staff-fold";detail.dataset.staffUiKey=key;
  detail.open=staffLayoutState.staffUiExpanded.get(key)===true;
  const summary=document.createElement("summary");summary.textContent=label;
  const body=document.createElement("div");body.className="staff-fold-body";
  for(const item of [...card.childNodes])if(item!==heading)body.appendChild(item);
  heading.remove();detail.append(summary,body);
  card.classList.add("staff-fold-card");card.appendChild(detail);
 }
 // Booking and queue items are operational worklists: show status, call and delete controls immediately.
 // Do not put their controls behind a second click on either desktop or mobile.
 if(["bookings","queue","orders"].includes(staffState.staffTab))return;
 for(const card of root.querySelectorAll(".staff-record")){
  const heading=card.querySelector(":scope > .staff-record-head");
  if(!heading)continue;
  const rest=[...card.children].filter(x=>x!==heading);
  if(!rest.length)continue;
  const id=card.querySelector("[data-id]")?.dataset.id||heading.textContent.slice(0,80);
  const key=staffState.staffTab+":record:"+id;
  const detail=document.createElement("details");detail.className="staff-record-fold";
  detail.dataset.staffUiKey=key;detail.open=staffLayoutState.staffUiExpanded.get(key)===true;
  const summary=document.createElement("summary");summary.textContent="查看詳細與處理";
  const body=document.createElement("div");body.className="staff-record-fold-body";
  for(const item of rest)body.appendChild(item);
  detail.append(summary,body);card.appendChild(detail);
 }
}

export function render(){document.body.dataset.portal=routeState.view;head();routeState.$("root").innerHTML=message()+(routeState.view==="platform"?platformRender():routeState.view==="staff"?staffRender():routeState.view==="customer"?customerRender():renderHome())+customerHistoryDialog()+'<footer>排隊怪獸服務 ・ <a href="privacy.html">隱私權說明</a> ・ <a href="terms.html">使用條款</a></footer>';enhanceStaffUI()}

export function initializeStaffLayout(){
staffLayoutState.staffUiExpanded=new Map();
staffLayoutState.staffSecondaryByTab={
 dashboard:["已處理預約"],
 analytics:["每日預約與取號量"],
 bookings:["預約編號設定","搜尋與篩選預約","預約管理方式","已處理預約","已刪除預約","完整預約歷史"],
 calendar:[],
 queue:["叫號編號設定","取號場次管理","已結束號碼牌","已刪除號碼牌"],
 menu:["預約資源","服務時長與緩衝"],
 members:["待接受邀請","邀請企業員工"],
 branches:[],
 settings:[]
};
document.addEventListener("toggle",event=>{
 const target=event.target;
 if(target instanceof HTMLDetailsElement&&target.dataset.staffUiKey){
  staffLayoutState.staffUiExpanded.set(target.dataset.staffUiKey,target.open);
 }
},true);
}
