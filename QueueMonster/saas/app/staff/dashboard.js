import {staffState} from "../state/staffState.js";
import {pickupState,pickupStatusLabel} from "../pickup-mode.js";
import {box,btn,esc,stat,tag} from "../shared-ui.js";

export function renderStaffDashboard({isManager,pendingBookings,openBookings,waiting,active,openTickets,html}){
  if(isManager&&staffState.staffNoticeHealth&&(Number(staffState.staffNoticeHealth.failed||0)>0||Number(staffState.staffNoticeHealth.retry||0)>0))
    html+=box("LINE 通知異常｜需管理者處理",
      '<div class="alert">最近 7 天有 '+esc(staffState.staffNoticeHealth.retry||0)+' 筆等待重試、'+esc(staffState.staffNoticeHealth.failed||0)+
      ' 筆已達重試上限。請檢查通知資格與額度。</div>');
  const orders=pickupState.staff?.orders||[];
  const pendingOrders=orders.filter(x=>x.status==="NEW");
  const makingOrders=orders.filter(x=>["ACCEPTED","PREPARING"].includes(x.status));
  const readyOrders=orders.filter(x=>x.status==="READY");
  html+='<div class="staff-stats grid4">'+
    stat("待報到",pendingBookings.length)+stat("已報到",openBookings.filter(x=>x.status==="CHECKED_IN").length)+
    stat("候位中",waiting.length)+stat("目前叫號",active?.number||"—")+'</div>'+
    '<div class="staff-stats grid4">'+stat("待接單",pendingOrders.length)+stat("製作中",makingOrders.length)+
    stat("待取餐",readyOrders.length)+stat("取餐待處理",pendingOrders.length+makingOrders.length+readyOrders.length)+'</div>'+
    '<div class="staff-dashboard-quick">'+
    btn("查看預約（"+openBookings.length+"）","open-bookings","primary")+
    btn("進入叫號（"+openTickets.length+"）","open-queue","outline")+
    '<button type="button" class="btn outline" data-nav="staff" data-tab="orders">取餐訂單（'+(pendingOrders.length+makingOrders.length+readyOrders.length)+'）</button></div>'+
    '<div class="staff-dashboard-grid">'+
    box("近期待處理預約",openBookings.length?openBookings.slice(0,5).map(x=>
      '<div class="staff-dash-row"><div><strong>'+esc(x.day)+'　'+esc(x.time)+'</strong><span>'+esc(x.name)+' · '+esc(x.party||1)+' 人</span></div>'+tag(x.status)+'</div>'
    ).join(""):'<p class="muted">目前沒有待處理預約。</p>')+
    box("候位清單",waiting.length?waiting.slice(0,5).map(x=>
      '<div class="staff-dash-row"><div><strong>'+esc(x.number)+'</strong><span>'+esc(x.name)+' · '+esc(x.party||1)+' 人</span></div>'+tag(x.status)+'</div>'
    ).join(""):'<p class="muted">目前沒有候位號碼。</p>')+
    box("近期取餐訂單",orders.filter(o=>!["PICKED_UP","REJECTED","CANCELLED"].includes(o.status)).slice(0,5).map(o=>
      '<div class="staff-dash-row"><div><strong>'+esc(o.number)+' ・ '+esc(o.pickup_at)+'</strong><span>'+esc((o.items||[]).map(i=>i.name+"×"+i.qty).join("、"))+'</span></div><span>'+esc(pickupStatusLabel(o.status))+'</span></div>'
    ).join("")||'<p class="muted">目前沒有待處理訂單。</p>')+'</div>';
  return html;
}
