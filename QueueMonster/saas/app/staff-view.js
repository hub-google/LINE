import {renderStaffDashboard} from "./staff/dashboard.js";
import {renderStaffAnalytics} from "./staff/analytics.js";
import {renderStaffBookings} from "./staff/bookings.js";
import {renderStaffCalendar} from "./staff/calendar.js";
import {renderStaffQueue} from "./staff/queue.js";
import {renderStaffMembers} from "./staff/members.js";
import {renderStaffSettings} from "./staff/settings.js";
import {renderStaffPickup} from "./pickup-mode.js";
import {authState} from "./state/authState.js";

import {sharedUiState} from "./state/sharedUiState.js";
import {staffHistoryState} from "./state/staffHistoryState.js";
import {staffState} from "./state/staffState.js";

import {authReady,box,btn,esc,layout,nav,requireAuth} from "./shared-ui.js";

export function staffRender(){
 if(!authReady())return requireAuth();
 const memberships=authState.context?.memberships||[];
 if(!staffState.staff){return box("企業員工後台",'<p class="muted">請先加入企業或由公司平台管理員核發邀請。'+(memberships.length?"請從下列企業進入：":"")+'</p>'+memberships.map(m=>'<p><a href="'+esc(sharedUiState.route("staff",m.slug))+'">'+esc(m.name)+'（'+esc(m.role)+'）→</a></p>').join("")+
    (authState.context?.invitations||[]).map(i=>'<div class="listline"><div>'+esc(i.tenant)+'－'+esc(i.role)+'</div>'+btn("接受邀請","accept-invite","primary",'data-id="'+esc(i.id)+'"')+'</div>').join("")); }
 if(["units","menu","branches"].includes(staffState.staffTab)){
   staffState.settingsSection=({units:"sessions",menu:"catalog",branches:"branches"})[staffState.staffTab];
   staffState.staffTab="settings";
 }
 if(staffState.staff.tenant?.onboarding_complete===false)staffState.staffTab="settings";
 const t=staffState.staff.tenant,openBookings=staffState.staff.pending_reservations||[],doneBookings=staffState.staff.processed_reservations||[],openTickets=staffState.staff.active_tickets||[],doneTickets=staffState.staff.processed_tickets||[],deletedBookings=staffState.staff.deleted_reservations||[],deletedTickets=staffState.staff.deleted_tickets||[];
 const r=openBookings.concat(doneBookings),q=openTickets.concat(doneTickets);
 const active=openTickets.find(x=>x.status==="CALLED"),waiting=openTickets.filter(x=>x.status==="WAITING"),passed=openTickets.filter(x=>x.status==="PASSED"),held=openTickets.filter(x=>x.status==="HOLD");
 const pendingBookings=openBookings.filter(x=>x.status==="CONFIRMED"), finishedBookings=doneBookings.filter(x=>x.status==="COMPLETED");
 const role=staffState.staff.role,isManager=["OWNER","MANAGER","PLATFORM"].includes(role);
 const menu=nav("設定","settings",staffState.staffTab,"staff")+'<div class="staff-side-label">日常作業</div>'+
 nav("工作台","dashboard",staffState.staffTab,"staff")+nav("預約管理","bookings",staffState.staffTab,"staff")+
 nav("叫號管理","queue",staffState.staffTab,"staff")+nav("取餐訂單","orders",staffState.staffTab,"staff")+nav("預約日曆","calendar",staffState.staffTab,"staff")+
 '<div class="staff-side-label">營運管理</div>'+
 nav("營運分析","analytics",staffState.staffTab,"staff")+
 nav("員工管理","members",staffState.staffTab,"staff")+ '<div class="staff-side-label">使用支援</div><a class="side-item guide-link" href="./merchant-center.html#guide">操作說明 ↗</a>';
 let html=(["bookings","queue"].includes(staffState.staffTab)?
  '<div class="staff-context-bar staff-context-compact"><div class="staff-history-controls">'+
  '<label for="staff-history-days">歷史紀錄</label><select class="field" id="staff-history-days" aria-label="已處理紀錄範圍">'+
  [7,14,30,90].map(n=>'<option value="'+n+'" '+(n===staffHistoryState.staffHistoryDays?"selected":"")+'>最近 '+n+' 天</option>').join("")+
  '</select></div></div>':"");

 if(staffState.staffTab==="dashboard"){
  html=renderStaffDashboard({isManager,pendingBookings,openBookings,waiting,active,openTickets,html});
 }
 else if(staffState.staffTab==="analytics"){
  html=renderStaffAnalytics({isManager,html});
 }
 else if(staffState.staffTab==="bookings"){
  html=renderStaffBookings({openBookings,doneBookings,deletedBookings,isManager,pendingBookings,t,html});
 }
 else if(staffState.staffTab==="calendar"){
  html=renderStaffCalendar({html});
 }
 else if(staffState.staffTab==="queue"){
  html=renderStaffQueue({isManager,t,html});
 }
 else if(staffState.staffTab==="orders"){
  html=renderStaffPickup();
 }
 else if(staffState.staffTab==="members"){
  html=renderStaffMembers({isManager,html});
 }
 else if(staffState.staffTab==="settings"){
  html=renderStaffSettings({t,isManager,html});
 }
 return layout(t.onboarding_complete===false?"填寫店家資料":t.name,"企業員工營運後台",menu,html);
}
