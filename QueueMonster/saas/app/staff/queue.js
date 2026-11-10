import {routeState} from "../state/routeState.js";

import {sharedUiState} from "../state/sharedUiState.js";
import {staffHistoryState} from "../state/staffHistoryState.js";
import {staffState} from "../state/staffState.js";

import {box,btn,esc,formatTaipeiCreated,queueSessionName,selectedItemsHtml,staffDeletePicker,staffStatusPicker,stat,tag} from "../shared-ui.js";

import {numberSettingsPanel} from "../number-settings.js";

import {staffListPage} from "../staff-list.js";
export function renderStaffQueue({isManager,active,waiting,passed,held,doneTickets,t,openTickets,deletedTickets,html}){

  const card=x=>'<article class="staff-record '+(x.deleted_at?'staff-deleted-record':'')+'"><div class="staff-record-head"><div><div class="staff-record-title">'+esc(x.number)+'　'+esc(x.name)+'</div>'+
   '<div class="small">'+esc(x.day)+' ・ '+esc(x.party||1)+' 人／組 ・ '+esc(x.source==="RESERVATION"?"預約報到":"現場取號")+
   (x.reservation_id?" ・ 已連動預約":"")+'</div>'+
   '<div class="small">取號時間：'+esc(formatTaipeiCreated(x.created_at))+' ・ '+esc(x.party||1)+' 人／組</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+(x.deleted_at?'<p class="staff-help">此號碼已從顧客端隱藏；取消勾選刪除即可恢復。</p>':staffStatusPicker("ticket",x,true))+
   (isManager&&!x.deleted_at&&x.status==="WAITING"?'<div class="staff-actionbar">'+btn("指定叫號","call-selected","secondary",'data-id="'+esc(x.id)+'"')+'</div>':"")+
   staffDeletePicker("ticket",x)+'</article>';
  html+='<div class="grid4" style="margin-bottom:16px">'+stat("正在叫號",active?.number||"—")+stat("候位中",waiting.length)+
   stat("已過號",passed.length)+stat("保留中",held.length)+stat("已結束",doneTickets.length)+'</div>'+
   box("叫號操作",'<p class="muted">仍在候位的跨日號碼會繼續排隊。號碼狀態可直接勾選與更正；已叫號後可分別標記「已到場」及「已進場」，不代表服務已完成。</p>'+
    '<div class="staff-actionbar">'+btn("叫下一位","call","primary",(!waiting.length||!!active||!t.modules.calling?"disabled":""))+
    btn("再叫一次","recall","outline",(!active||active.status!=="CALLED"?"disabled":"")+' data-id="'+esc(active?.id||"")+'"')+
    (sharedUiState.lastStaffChange&&sharedUiState.lastStaffChange.slug===routeState.slug?btn("還原上一步","undo-staff","secondary"):"")+
    '<a class="btn outline" href="./board.html?merchant='+encodeURIComponent(routeState.slug)+'" target="_blank" rel="noopener noreferrer">電視即時叫號看板</a>'+
    '</div>'+
    '<p class="staff-help">叫號通知使用票券識別碼，避免跨天同號誤通知。已發出的 LINE 訊息無法撤回。</p>')+
   box("取號場次管理",
     '<p class="small">目前：<strong>'+esc(queueSessionName(staffState.staff.queue_session?.code||"MORNING"))+'</strong>。休場只暫停新的取號，先前的號碼仍可繼續叫號；切場不會重設流水號。</p>'+
     '<div class="staff-actionbar">'+
     [["MORNING","早場"],["AFTERNOON","午場"],["EVENING","晚場"],["REST","休場"]].map(([code,name])=>
       btn(name,(staffState.staff.queue_session?.code||"MORNING")===code?"noop-queue-session":"set-queue-session",
         (staffState.staff.queue_session?.code||"MORNING")===code?"primary":"outline",
         'data-session-code="'+code+'"')).join("")+'</div>')+
   box("未結案號碼牌（"+openTickets.length+" 筆）",openTickets.length?staffListPage(openTickets,"ticket-open",card):'<p class="muted">目前沒有未結案號碼牌。</p>')+
   box("已結束號碼牌（最近 "+staffHistoryState.staffHistoryDays+" 天，"+doneTickets.length+" 筆）",doneTickets.length?staffListPage(doneTickets,"ticket-done",card):'<p class="muted">沒有已結束的號碼牌。</p>')+
   box("已刪除號碼牌（最近 "+staffHistoryState.staffHistoryDays+" 天，"+deletedTickets.length+" 筆）",
    '<p class="staff-help">刪除不是取消：顧客端不再顯示，也不會發送 LINE 通知；取消勾選即可恢復。</p>'+
    (deletedTickets.length?staffListPage(deletedTickets,"ticket-deleted",card):'<p class="muted">目前沒有已刪除號碼牌。</p>'))+numberSettingsPanel("queue",t,isManager);

return html;
}
