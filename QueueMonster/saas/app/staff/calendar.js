import {bookingCalendarPanel,calendarPeriod} from "../booking-calendar.js";
import {calendarState} from "../state/calendarState.js";
import {pickupState} from "../pickup-mode.js";
import {box,esc,stat} from "../shared-ui.js";

export function renderStaffCalendar({html}){
  html+=bookingCalendarPanel();
  const {start,end}=calendarPeriod(calendarState.calendarMode,calendarState.calendarAnchor);
  const orders=(pickupState.staff?.orders||[]).filter(o=>
    o.scheduled && o.pickup_at?.slice(0,10)>=start && o.pickup_at?.slice(0,10)<=end &&
    !["REJECTED","CANCELLED"].includes(o.status)
  ).sort((a,b)=>String(a.pickup_at).localeCompare(String(b.pickup_at)));
  const total=orders.reduce((sum,o)=>sum+Number(o.total||0),0);
  const lines=orders.slice(0,70).map(o=>
    '<tr><td>'+esc(o.pickup_at)+'</td><td>'+esc(o.number)+'</td><td>'+
    esc((o.items||[]).map(i=>i.name+" × "+i.qty).join("、"))+'</td><td>'+esc(o.status)+'</td><td>NT$ '+
    esc(Number(o.total||0).toLocaleString("zh-TW"))+'</td></tr>').join("");
  html+=box("預約取餐時程",
    '<p class="small">獨立於一般預約日曆，依約定取餐時間排列。店員仍從「取餐訂單」修改狀態；此區僅顯示近期已載入的有效預約取餐訂單，沒有在線上收款。</p>'+
    '<div class="grid3">'+stat("此區間取餐訂單",orders.length)+stat("有效訂單金額","NT$ "+total.toLocaleString("zh-TW"))+'</div>'+
    (orders.length?'<div class="scroll"><table class="rows"><thead><tr><th>取餐時間</th><th>訂單號碼</th><th>餐點</th><th>狀態</th><th>金額</th></tr></thead><tbody>'+
      lines+'</tbody></table></div>'+
      (orders.length>70?'<p class="small">僅顯示前 70 筆，完整訂單請到「取餐訂單」管理。</p>':"")
      :'<p class="muted">目前選定區間沒有已載入的預約取餐訂單。</p>'));
  return html;
}
