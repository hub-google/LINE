import {staffState} from "../state/staffState.js";
import {box,btn,esc,stat} from "../shared-ui.js";

export function renderStaffAnalytics({isManager,html}){
  if(!isManager)return html+box("營運分析",'<p class="muted">僅企業管理者可查看跨日營運報表。</p>');
  const a=staffState.staffAnalytics||{},r=a.reservations||{},q=a.queue||{},o=a.orders||{},days=a.daily||[];
  const ratio=(n,t)=>Number(t)?(Number(n||0)/Number(t)*100).toFixed(1)+"%":"—";
  const money=n=>"NT$ "+Number(n||0).toLocaleString("zh-TW",{maximumFractionDigits:2});
  html+=box("營運統計區間",'<div class="flex"><label for="analytics-days">最近天數</label><select id="analytics-days" class="field">'+
    [7,30,90].map(x=>'<option value="'+x+'" '+(x===staffState.analyticsDays?"selected":"")+'>'+x+' 天</option>').join("")+
    '</select>'+btn("下載 Excel 相容 CSV","export-analytics","outline")+'</div>')+
    box("預約分析",'<div class="grid4">'+stat("預約筆數",r.total||0)+stat("預約取消率",ratio(r.cancelled,r.total))+stat("預約未到率",ratio(r.no_show,r.total))+'</div>')+
    box("取號分析",'<div class="grid4">'+stat("取號筆數",q.total||0)+stat("取號完成率",ratio(q.completed,q.total))+stat("平均取號等待",q.avg_wait_minutes==null?"尚無資料":q.avg_wait_minutes+" 分鐘")+'</div>')+
    box("訂餐分析",'<div class="grid4">'+stat("有效訂單",o.valid||0)+stat("有效訂單金額",money(o.amount))+stat("平均客單價",money(o.valid?Number(o.amount||0)/Number(o.valid):0))+
    stat("拒單率",ratio(o.rejected,o.total))+stat("待接單",o.pending||0)+stat("製作中",Number(o.accepted||0)+Number(o.preparing||0))+
    stat("待取餐",o.ready||0)+stat("已取餐",o.picked_up||0)+'</div>'+
    '<p class="small">有效訂單金額不等於實際收款營收；取消及拒單不計入有效訂單。</p>')+
    box("每日預約、取號與訂餐量",'<p class="small">依營業日期或約定取餐日期統計。</p>'+
    '<div class="scroll"><table class="rows"><thead><tr><th>日期</th><th>預約筆數</th><th>取號筆數</th><th>有效訂單</th><th>有效訂單金額</th></tr></thead><tbody>'+
    days.slice().reverse().map(x=>'<tr><td>'+esc(x.date).slice(0,10)+'</td><td>'+esc(x.reservations)+'</td><td>'+esc(x.tickets)+'</td><td>'+esc(x.orders||0)+'</td><td>'+esc(money(x.order_amount))+'</td></tr>').join("")+
    '</tbody></table></div>');
  return html;
}
