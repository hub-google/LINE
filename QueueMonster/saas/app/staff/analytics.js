import {staffState} from "../state/staffState.js";
import {box,btn,esc,stat} from "../shared-ui.js";

export function renderStaffAnalytics({isManager,html}){
  if(!isManager)return html+box("營運分析",'<p class="muted">僅企業管理者可查看跨日營運報表。</p>');
  const a=staffState.staffAnalytics||{},r=a.reservations||{},q=a.queue||{},o=a.orders||{},days=a.daily||[],detail=a.pickupDetail||{};
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
    box("熱門餐點排行",'<p class="small">依訂餐的餐點總份數排序，保留當時下單的名稱與金額。</p>'+
      ((detail.popular_items||[]).length?
       '<div class="scroll"><table class="rows"><thead><tr><th>餐點</th><th>份數</th><th>有效訂單金額</th></tr></thead><tbody>'+
       detail.popular_items.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.quantity)+'</td><td>'+esc(money(x.amount))+'</td></tr>').join("")+'</tbody></table></div>':
       '<p class="muted">本區間尚無餐點銷售紀錄。</p>'))+
    box("取餐尖峰時段",'<p class="small">依約定取餐時間統計，不代表店家實際收款或店員工時。</p>'+
      ((detail.pickup_hours||[]).length?'<div class="scroll"><table class="rows"><thead><tr><th>時段</th><th>訂單筆數</th><th>金額</th></tr></thead><tbody>'+
       detail.pickup_hours.map(x=>'<tr><td>'+esc(x.hour)+':00～'+esc(x.hour)+':59</td><td>'+esc(x.orders)+'</td><td>'+esc(money(x.amount))+'</td></tr>').join("")+'</tbody></table></div>':
       '<p class="muted">本區間尚無可分析的取餐時段。</p>')+
      '<p class="small">有可查核「待取」時間戳的訂單：'+esc(detail.ready_recorded||0)+' 筆。準時待取率：'+
      (Number(detail.ready_recorded||0)?ratio(detail.on_time,detail.ready_recorded):'尚無資料')+
      '；未記錄到待取時間的訂單不納入準時率分母。</p>')+
    box("每日預約、取號與訂餐量",'<p class="small">依營業日期或約定取餐日期統計。</p>'+
    '<div class="scroll"><table class="rows"><thead><tr><th>日期</th><th>預約筆數</th><th>取號筆數</th><th>有效訂單</th><th>有效訂單金額</th></tr></thead><tbody>'+
    days.slice().reverse().map(x=>'<tr><td>'+esc(x.date).slice(0,10)+'</td><td>'+esc(x.reservations)+'</td><td>'+esc(x.tickets)+'</td><td>'+esc(x.orders||0)+'</td><td>'+esc(money(x.order_amount))+'</td></tr>').join("")+
    '</tbody></table></div>');
  return html;
}
