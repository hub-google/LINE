import {bookingCalendarPanel,calendarPeriod} from "../booking-calendar.js";
import {calendarState} from "../state/calendarState.js";
import {box,btn,esc,stat} from "../shared-ui.js";

export function renderStaffCalendar({html}){
 html+=bookingCalendarPanel();
 const {start,end}=calendarPeriod(calendarState.calendarMode,calendarState.calendarAnchor);
 const data=calendarState.pickupCalendarPeriod===start+"/"+end?calendarState.pickupCalendarResult:null;
 const orders=data?.orders||[];
 const total=Number(data?.total||0),amount=Number(data?.amount||0);
 const page=calendarState.pickupCalendarPage||1,last=Math.max(1,Math.ceil(total/100));
 const rows=orders.map(o=>
  '<tr><td>'+esc(o.pickup_at)+'</td><td>'+esc(o.number)+'</td><td>'+
  esc((o.items||[]).map(i=>i.name+" × "+i.qty).join("、"))+'</td><td>'+esc(o.status)+'</td><td>NT$ '+
  esc(Number(o.total||0).toLocaleString("zh-TW"))+'</td></tr>').join("");
 const error=calendarState.pickupCalendarError;
 html+=box("預約取餐時程",
  '<p class="small">依約定取餐時間查詢全部門市資料，不依賴近期工作台快取；與一般預約日曆分開統計，避免重複計入。</p>'+
  '<div class="grid3">'+stat("區間有效取餐訂單",total)+stat("有效訂單金額","NT$ "+amount.toLocaleString("zh-TW"))+'</div>'+
  (error?'<p role="alert" class="alert">'+esc(error)+'</p>':
   !data?'<p class="muted">正在讀取取餐日曆…</p>':
   orders.length?'<div class="scroll"><table class="rows"><thead><tr><th>取餐時間</th><th>訂單編號</th><th>餐點</th><th>狀態</th><th>金額</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
   '<p class="muted">此區間目前沒有有效的預約取餐訂單。</p>')+
  (total>100?'<div class="staff-actionbar">'+
    btn("上一頁","pickup-calendar-prev","outline",page<=1?"disabled":"")+
    '<span>第 '+page+'／'+last+' 頁，每頁 100 筆</span>'+
    btn("下一頁","pickup-calendar-next","outline",page>=last?"disabled":"")+
    '</div>':""));
 return html;
}
