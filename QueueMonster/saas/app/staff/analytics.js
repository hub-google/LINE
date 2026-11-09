import {staffState} from "../state/staffState.js";

import {box,btn,esc,stat} from "../shared-ui.js";

export function renderStaffAnalytics({isManager,html}){
  if(!isManager)html+=box("營運分析",'<p class="muted">僅企業管理者可查看跨日營運報表。</p>');
  else {
   const a=staffState.staffAnalytics||{},r=a.reservations||{},q=a.queue||{},days=a.daily||[];
   const ratio=(num,total)=>total?((Number(num||0)/Number(total))*100).toFixed(1)+"%":"—";
   html+=box("營運統計區間",
     '<div class="flex"><label for="analytics-days">最近天數</label><select id="analytics-days" class="field">'+
     [7,30,90].map(x=>'<option value="'+x+'" '+(x===staffState.analyticsDays?"selected":"")+'>'+x+' 天</option>').join("")+
     '</select>'+btn("下載 Excel 相容 CSV","export-analytics","outline")+'</div>')+
     '<div class="grid4">'+stat("預約筆數",r.total||0)+stat("預約取消率",ratio(r.cancelled,r.total))+
      stat("預約未到率",ratio(r.no_show,r.total))+stat("取號筆數",q.total||0)+
      stat("取號完成率",ratio(q.completed,q.total))+stat("平均取號等待",q.avg_wait_minutes==null?"尚無資料":q.avg_wait_minutes+" 分鐘")+'</div>'+
     box("每日預約與取號量",'<p class="small">依門市營業日期統計。取消率、未到率按目前狀態計算；平均等待只計已實際叫號的紀錄。</p>'+
       '<div class="scroll"><table class="rows"><thead><tr><th>日期</th><th>預約筆數</th><th>取號筆數</th></tr></thead><tbody>'+
       days.slice().reverse().map(x=>'<tr><td>'+esc(x.date).slice(0,10)+'</td><td>'+esc(x.reservations)+'</td><td>'+esc(x.tickets)+'</td></tr>').join("")+
       '</tbody></table></div>');
  }

return html;
}
