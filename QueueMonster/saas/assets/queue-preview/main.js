import {renderStaffQueue} from "../../app/staff/queue.js";
import {queueProgressBoard} from "../../app/queue-progress.js";
import {stat,esc} from "../../app/shared-ui.js";
import {initializeStaffView} from "../../app/staff-list.js";
import {staffState} from "../../app/state/staffState.js";
import {staffHistoryState} from "../../app/state/staffHistoryState.js";
import {serviceUnitsState} from "../../app/state/serviceUnitsState.js";
import {routeState} from "../../app/state/routeState.js";
import {sharedUiState} from "../../app/state/sharedUiState.js";
import {queueState} from "../../app/state/queueState.js";
import {customerState} from "../../app/state/customerState.js";
import {lineState} from "../../app/state/lineState.js";
import {staffViewState} from "../../app/state/staffViewState.js";
const $=id=>document.getElementById(id);
const slug="local-preview-only",mineId="demo-17",tenant={name:"示範維修店",modules:{calling:true},queue_prefix:"A",queue_last_number:20};
let tickets=[],session="MORNING",history=[],alertSetting=0;
const board=$("board-preview"),feedback=$("preview-feedback");
routeState.slug=slug;serviceUnitsState.unitEnabled=()=>false;staffHistoryState.staffHistoryDays=7;
lineState.lineConfig={messagingReady:false};initializeStaffView();
document.documentElement.dataset.storeLiveMode="realtime";
const current=()=>tickets.find(t=>!t.deleted_at&&t.status==="CALLED");
const waiting=()=>tickets.filter(t=>!t.deleted_at&&t.status==="WAITING");
const find=id=>tickets.find(t=>t.id===id);
function save(){history.push({tickets:structuredClone(tickets),session,tenant:{...tenant}});if(history.length>50)history.shift()}
function reset(){tickets=Array.from({length:9},(_,i)=>({id:"demo-"+(i+12),number:"A"+String(i+12).padStart(3,"0"),status:i===0?"CALLED":"WAITING",name:"顧客 "+(i+12),day:new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Taipei"}),party:i%3+1,source:"WALK_IN",created_at:new Date().toISOString()}));session="MORNING";history=[];alertSetting=0;tenant.queue_prefix="A";tenant.queue_last_number=20;initializeStaffView();render("已重設示範資料。")}
function sendBoard(){board.contentWindow?.postMessage({type:"qm-queue-preview",current:current()?.number||"",upcoming:waiting().map(t=>t.number)},location.origin)}
function resize(){if(parent!==window)parent.postMessage({type:"qm-queue-preview-height",height:Math.ceil(document.body.scrollHeight)},location.origin)}
function render(message=""){
 const open=tickets.filter(t=>!t.deleted_at&&!["COMPLETED","CANCELLED"].includes(t.status));
 const done=tickets.filter(t=>!t.deleted_at&&["COMPLETED","CANCELLED"].includes(t.status));
 staffState.staff={active_tickets:open,processed_tickets:done,deleted_tickets:tickets.filter(t=>t.deleted_at),queue_session:{code:session}};
 sharedUiState.lastStaffChange=history.length?{slug}:null;
 const queue=waiting(),called=current(),passed=tickets.filter(t=>!t.deleted_at&&t.status==="PASSED").length;
 const detailOpen=$("staff-root").querySelector(".preview-advanced")?.open===true;
 const nextTwo=queue.slice(0,2).map(t=>'<strong class="preview-next-number">'+esc(t.number)+'</strong>').join("");
 $("staff-root").innerHTML='<div class="preview-workbench">'+
  '<div class="preview-workbench-top"><span class="preview-live-dot">即時叫號</span><span class="preview-session">目前場次 · '+(session==="MORNING"?"早場":session==="AFTERNOON"?"午場":session==="EVENING"?"晚場":"休場")+'</span></div>'+
  '<div class="preview-main-number"><span>現在叫到</span><strong>'+esc(called?.number||"尚未叫號")+'</strong></div>'+
  '<div class="preview-quick-stats"><div><span>等待中</span><strong>'+queue.length+'</strong><small>組</small></div><div><span>已過號</span><strong>'+passed+'</strong><small>組</small></div><div><span>已完成</span><strong>'+done.length+'</strong><small>組</small></div></div>'+
  '<div class="preview-next-row"><span>接下來</span><div class="preview-next-items">'+(nextTwo||'<span class="preview-empty">暫無候位</span>')+'</div></div>'+
  '<div class="preview-primary-actions"><button class="preview-call" type="button" data-act="call" '+(queue.length?"":"disabled")+'>'+ (queue.length?"叫下一位":"目前沒有候位")+'</button><button class="preview-recall" type="button" data-act="recall" '+(called?"":"disabled")+'>再叫一次</button></div>'+
  '<p class="preview-tip">操作後，電視看板與顧客手機將同步更新。</p></div>'+
  '<details class="preview-advanced" '+(detailOpen?"open":"")+'><summary>展開完整店家操作與號碼管理 <span aria-hidden="true">⌄</span></summary><div class="preview-advanced-content">'+renderStaffQueue({isManager:true,t:tenant,html:""})+'</div></details>';
 const boardLink=$("staff-root").querySelector('a[href*="board.html"]');
 if(boardLink){boardLink.href="#board-preview";boardLink.removeAttribute("target");boardLink.addEventListener("click",e=>{e.preventDefault();board.scrollIntoView({block:"center"});board.requestFullscreen?.().catch(()=>{})})}
 const own=find(mineId),idx=queue.findIndex(t=>t.id===mineId);
 const visible=own&&!own.deleted_at?{...own,ahead:idx<0?null:idx}:null;
 customerState.customer={my_tickets:visible?[visible]:[]};
 Object.assign(queueState,{queueLiveShop:slug,queueLive:{current:current()?.number||"",mine:visible},queueLastSuccessShop:slug,queueLastSuccessAt:new Date().toISOString(),progressTicketId:mineId,queueLiveError:"",queueNearAlertSettings:{[mineId]:alertSetting}});
 $("customer-root").innerHTML='<div class="grid3">'+stat("等候組數",queue.length)+'</div>'+queueProgressBoard();
 const back=$("customer-root").querySelector('[data-act="cross-back"]');
 if(back){back.disabled=true;back.title="此展示只包含叫號進度"}
 feedback.textContent=message;sendBoard();requestAnimationFrame(resize);
}
function call(ticket){if(!ticket||ticket.deleted_at||ticket.status!=="WAITING")return;save();const prior=current();if(prior)prior.status="PASSED";ticket.status="CALLED";render("已叫號 "+ticket.number+"，三端同步更新。")}
function changeStatus(ticket,status){if(!ticket||ticket.deleted_at||ticket.status===status)return;save();if(status==="CALLED"){const prior=current();if(prior&&prior!==ticket)prior.status="PASSED"}ticket.status=status;render("已更新 "+ticket.number+" 狀態。")}
document.addEventListener("click",event=>{
 const el=event.target.closest("[data-act]");if(!el||el.disabled)return;
 const action=el.dataset.act,ticket=find(el.dataset.id);
 if(action==="call")call(waiting()[0]);
 else if(action==="call-selected")call(ticket);
 else if(action==="recall")render("已重新叫號 "+(current()?.number||""));
 else if(action==="undo-staff"){const prev=history.pop();if(prev){tickets=prev.tickets;session=prev.session;Object.assign(tenant,prev.tenant);render("已還原上一步。")}}
 else if(action==="set-queue-session"){save();session=el.dataset.sessionCode;render("已切換取號場次。")}
 else if(action==="staff-show-more"){const key=el.dataset.listKey;staffViewState.staffVisibleLimits.set(key,(staffViewState.staffVisibleLimits.get(key)||12)+12);render()}
 else if(action==="hold-my-number")changeStatus(ticket,"HOLD");
 else if(action==="resume-my-number")changeStatus(ticket,"WAITING");
 else if(action==="cancel-my-number")changeStatus(ticket,"CANCELLED");
 else if(action==="queue-refresh")render("已同步最新展示進度。");
 else if(action==="save-queue-near-alert"){alertSetting=Number($("queue-near-alert-threshold")?.value||0);render("已儲存示範提醒設定，不會發送 LINE 通知。")}
 else if(action==="save-number-prefix"){save();tenant.queue_prefix=String($("prefix-queue")?.value||"").slice(0,3);render("已儲存示範編號前綴。")}
 else if(action==="reset-serial"){save();tenant.queue_last_number=0;render("已重置示範流水號，既有號碼不變。")}
});
document.addEventListener("change",event=>{const el=event.target,ticket=find(el.dataset.id);if(el.dataset.statusKind==="ticket")changeStatus(ticket,el.value);else if(el.dataset.deleteKind==="ticket"&&ticket){save();ticket.deleted_at=el.checked?new Date().toISOString():null;render("已更新號碼牌顯示狀態。")}});
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===board.contentWindow&&event.data?.type==="qm-board-ready")sendBoard()});
board.addEventListener("load",sendBoard);$("reset-preview").addEventListener("click",reset);
new ResizeObserver(resize).observe(document.body);
reset();
