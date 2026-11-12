import {routeState} from "../state/routeState.js";
import {sharedUiState} from "../state/sharedUiState.js";
import {staffHistoryState} from "../state/staffHistoryState.js";
import {staffState} from "../state/staffState.js";
import {serviceUnitsState} from "../state/serviceUnitsState.js";
import {box,btn,esc,formatTaipeiCreated,queueSessionName,selectedItemsHtml,staffDeletePicker,staffStatusPicker,stat,tag} from "../shared-ui.js";
import {numberSettingsPanel} from "../number-settings.js";
import {staffListPage} from "../staff-list.js";
import {unitNameForSession} from "../service-units.js";

// Single queue-management view for ordinary and session-based shops.
// The selected session changes only which open queue is operated; histories and status controls stay shared.
export function renderStaffQueue({isManager,t,html}){
 const unitMode=serviceUnitsState.unitEnabled();
 const sessions=unitMode?(serviceUnitsState.unitConfig?.sessions||[]).filter(s=>s.active):[];
 const selected=sessions.find(s=>s.id===serviceUnitsState.unitStaffSession)||sessions[0]||null;
 const allOpen=(staffState.staff?.active_tickets||[]).filter(x=>!x.deleted_at);
 const doneTickets=(staffState.staff?.processed_tickets||[]).filter(x=>!x.deleted_at);
  const completedTickets=doneTickets.filter(x=>x.status==="COMPLETED");
 const deletedTickets=staffState.staff?.deleted_tickets||[];
 const inQueue=x=>!unitMode||!!selected&&x.service_session_id===selected.id;
 const openTickets=allOpen.filter(inQueue);
 const otherOpen=unitMode?allOpen.filter(x=>!inQueue(x)):[];
 const active=openTickets.find(x=>x.status==="CALLED");
 const waiting=openTickets.filter(x=>x.status==="WAITING");
 const passed=openTickets.filter(x=>x.status==="PASSED");
 const held=openTickets.filter(x=>x.status==="HOLD");
 const card=x=>'<article class="staff-record '+(x.deleted_at?'staff-deleted-record':'')+'">'+
   '<div class="staff-record-head"><div><div class="staff-record-title">'+esc(x.number||"—")+'　'+esc(x.name||"顧客")+'</div>'+
   '<div class="small">'+esc(x.day||"")+
   (unitMode?' ・ '+esc(x.unit||"一般場次")+' ・ '+esc(x.session||""):"")+
   ' ・ '+esc(x.party||1)+' 人／組 ・ '+esc(x.source==="RESERVATION"?"預約報到":"現場取號")+
   (x.reservation_id?" ・ 已連動預約":"")+'</div>'+
   '<div class="small">取號時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
   (x.deleted_at?'<p class="staff-help">此號碼已從顧客端隱藏；取消勾選刪除即可恢復。</p>':staffStatusPicker("ticket",x,true))+
   (isManager&&!unitMode&&!x.deleted_at&&x.status==="WAITING"?
     '<div class="staff-actionbar">'+btn("指定叫號","call-selected","secondary",'data-id="'+esc(x.id)+'"')+'</div>':"")+
   staffDeletePicker("ticket",x)+'</article>';
 const listing=(records,key,empty)=>records.length?staffListPage(records,key,card):'<p class="muted">'+empty+'</p>';
 const board='./board.html?merchant='+encodeURIComponent(routeState.slug)+
   (unitMode&&selected?'&session='+encodeURIComponent(selected.id):"");
 const callExtra=unitMode?' data-session="'+esc(selected?.id||"")+'"':"";
 const recallExtra=callExtra+' data-id="'+esc(active?.id||"")+'"';
 const canCall=!!waiting.length&&(unitMode?!!selected:!!t.modules.calling);
 const canRecall=!!active&&active.status==="CALLED"&&(!unitMode||!!selected);
 if(unitMode){
   html+=box("按場次獨立叫號",
     '<p class="small">各場次獨立叫號，全部場次的完成、取消與刪除紀錄統一在下方查看。</p>'+
     '<div class="staff-actionbar"><a class="btn outline" href="'+esc(sharedUiState.route("staff",routeState.slug)+"&tab=settings&section=sessions")+'">前往設定場次</a></div>'+
     '<label for="staff-unit-session">操作隊列</label><select id="staff-unit-session" class="field">'+
     sessions.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?.id?'selected':'')+'>'+
       esc(unitNameForSession(s.id))+' · '+esc(s.name)+' '+esc(s.start)+'</option>').join("")+'</select>'+
     (!selected?'<p class="muted">目前沒有可操作的場次，請到設定新增場次；歷史顧客仍可在下方查閱。</p>':""));
 }
 html+='<div class="grid4" style="margin-bottom:16px">'+
   stat("正在叫號",active?.number||"—")+stat("候位中",waiting.length)+
   stat("已過號",passed.length)+stat("保留中",held.length)+stat("已完成",completedTickets.length)+'</div>'+
   box("叫號操作",
     '<p class="muted">'+(unitMode?"目前操作選取的場次；": "仍在候位的跨日號碼會繼續排隊。")+
     '號碼狀態可直接勾選與更正。叫下一位時，前一位若仍是「已叫號」，才會自動轉成「已過號」；已完成或其他狀態不會被自動更動。</p>'+
     '<div class="staff-actionbar">'+
     btn("叫下一位",unitMode?"unit-call":"call","primary",(canCall?"":"disabled")+callExtra)+
     btn("再叫一次",unitMode?"unit-recall":"recall","outline",(canRecall?"":"disabled")+recallExtra)+
     (sharedUiState.lastStaffChange&&sharedUiState.lastStaffChange.slug===routeState.slug?
       btn("還原上一步","undo-staff","secondary"):"")+
     '<a class="btn outline" href="'+esc(board)+'" target="_blank" rel="noopener noreferrer">'+
     (unitMode?"本隊列看板":"電視即時叫號看板")+'</a></div>'+
     '<p class="staff-help">叫號通知使用票券識別碼，避免跨天同號誤通知。已發出的 LINE 訊息無法撤回。</p>')+
   (!unitMode?box("取號場次管理",
     '<p class="small">此處是一般取號的手動早／午／晚場切換；自訂場次與每週排程則在「設定 → 營業與場次」管理。</p><p class="small">目前：<strong>'+esc(queueSessionName(staffState.staff.queue_session?.code||"MORNING"))+
     '</strong>。休場只暫停新的取號，先前號碼仍可繼續叫號；切場不會重設流水號。</p>'+
     '<div class="staff-actionbar">'+
     [["MORNING","早場"],["AFTERNOON","午場"],["EVENING","晚場"],["REST","休場"]].map(([code,name])=>
       btn(name,(staffState.staff.queue_session?.code||"MORNING")===code?"noop-queue-session":"set-queue-session",
         (staffState.staff.queue_session?.code||"MORNING")===code?"primary":"outline",
         'data-session-code="'+code+'"')).join("")+'</div>'):"")+
   box(unitMode?"本場次未結案號碼牌（"+openTickets.length+" 筆）":"未結案號碼牌（"+openTickets.length+" 筆）",
     listing(openTickets,unitMode?"unit-queue-open-"+(selected?.id||"none"):"ticket-open",
       "目前沒有未結案號碼牌。"))+
   (otherOpen.length?box("其他場次未結案（"+otherOpen.length+" 筆）",
     '<p class="staff-help">其他日期或已關閉的場次仍有未結案客戶，可在這裡修正狀態。</p>'+
     listing(otherOpen,"unit-queue-other-open","沒有其他未結案號碼牌。")):"")+
   box("已處理號碼牌（最近 "+staffHistoryState.staffHistoryDays+" 天，"+doneTickets.length+" 筆）",
     '<p class="staff-help">包含已完成、已取消的顧客，可直接修正狀態；顧客不會因結案而消失。</p>'+
     listing(doneTickets,unitMode?"unit-queue-processed":"ticket-done","這段期間沒有已處理號碼牌。"))+
   box("已刪除號碼牌（最近 "+staffHistoryState.staffHistoryDays+" 天，"+deletedTickets.length+" 筆）",
     '<p class="staff-help">刪除與完成不同：刪除會在顧客端隱藏且不發送 LINE 通知；取消勾選刪除即可恢復。</p>'+
     listing(deletedTickets,unitMode?"unit-queue-deleted":"ticket-deleted","目前沒有已刪除號碼牌。"))+
   (unitMode?"":numberSettingsPanel("queue",t,isManager));
 return html;
}
