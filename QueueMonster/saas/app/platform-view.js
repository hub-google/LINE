import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";


import {authReady,box,btn,esc,featureChecks,field,layout,nav,platformReady,stat,tag} from "./shared-ui.js";
import {customerUrl} from "./line-session.js";
import {merchantProfileFields} from "./merchant-brand.js";

export function platformRender(){
 if(!authReady())return box("總部管理員登入",'<p>請從總部專用入口登入，完成授權後才能使用總部管理功能。</p><a class="btn primary" href="./platform-login.html">前往總部登入</a>');
 if(!platformReady())return box("沒有總部管理權限",'<p>目前帳號無法進入總部管理後台。請使用總部專用入口登入。</p><a class="btn primary" href="./platform-login.html">前往總部登入</a>');
 const menu=nav("平台營運總覽","dashboard",routeState.platformTab,"platform")+nav("企業列表","list",routeState.platformTab,"platform")+nav("開通新企業","create",routeState.platformTab,"platform")+nav("平台說明","about",routeState.platformTab,"platform");
 let html="";
 if(routeState.platformTab==="dashboard"){
   const active=routeState.overview.filter(t=>t.status==="ACTIVE").length;
   const bookings=routeState.overview.reduce((n,t)=>n+Number(t.today_reservations||0),0);
   const waiting=routeState.overview.reduce((n,t)=>n+Number(t.today_waiting||0),0);
   const completed=routeState.overview.reduce((n,t)=>n+Number(t.today_completed||0),0);
   const staffCount=routeState.overview.reduce((n,t)=>n+Number(t.staff||0),0);
    const orders=routeState.overview.reduce((n,t)=>n+Number(t.today_orders||0),0);
    const pendingOrders=routeState.overview.reduce((n,t)=>n+Number(t.today_pending_orders||0),0);
    const readyOrders=routeState.overview.reduce((n,t)=>n+Number(t.today_ready_orders||0),0);
    const orderAmount=routeState.overview.reduce((n,t)=>n+Number(t.today_order_amount||0),0);
   html='<div class="grid4" style="margin-bottom:16px">'+stat("企業總數",routeState.overview.length)+stat("營運中企業",active)+stat("今日預約",bookings)+stat("今日候位",waiting)+'</div>'+
     '<div class="grid4" style="margin-bottom:16px">'+stat("今日有效訂單",orders)+stat("待接單",pendingOrders)+stat("待取餐",readyOrders)+stat("有效訂單金額","NT$ "+orderAmount.toLocaleString("zh-TW"))+'</div>'+
    box("平台跨企業即時營運",'<p class="muted">以下顯示各門市最新營運資訊。員工總數 '+esc(staffCount)+' 人，今日已完成 '+esc(completed)+' 組，每 15 秒更新。</p><div class="scroll"><table class="rows"><thead><tr><th>企業</th><th>狀態</th><th>員工</th><th>今日預約</th><th>候位</th><th>今日有效訂單</th><th>待接單</th><th>待取餐</th><th>訂單金額</th><th>目前叫號</th><th>已完成</th><th>操作</th></tr></thead><tbody>'+
    routeState.overview.map(t=>'<tr><td><strong>'+esc(t.name)+'</strong></td><td>'+tag(t.status)+'</td><td>'+esc(t.staff)+'</td><td>'+esc(t.today_reservations||0)+'</td><td>'+esc(t.today_waiting||0)+'</td><td>'+esc(t.today_orders||0)+'</td><td>'+esc(t.today_pending_orders||0)+'</td><td>'+esc(t.today_ready_orders||0)+'</td><td>NT$ '+esc(Number(t.today_order_amount||0).toLocaleString("zh-TW"))+'</td><td>'+esc(t.current_number||"—")+'</td><td>'+esc(t.today_completed||0)+'</td><td><a href="'+esc(sharedUiState.route("staff",t.slug))+'">店員後台</a> ・ <a href="'+esc((customerUrl(t.slug)||(customerUrl(t.slug)||sharedUiState.route("customer",t.slug))))+'">顧客頁</a></td></tr>').join("")+'</tbody></table></div>');
  }else if(routeState.platformTab==="list"){
   html='<div class="toolbar"><h2>已開通企業（'+routeState.overview.length+'）</h2>'+btn("＋ 新增企業","new-tenant","primary")+'</div>'+
    '<div class="card scroll"><table class="rows"><thead><tr><th>企業</th><th>啟用功能</th><th>狀態</th><th>員工</th><th>操作</th></tr></thead><tbody>'+
    (routeState.overview.map(t=>'<tr><td><strong>'+esc(t.name)+'</strong><div class="small">'+esc(t.slug)+'</div></td><td>'+[...sharedUiState.features.filter(f=>t.modules?.[f[0]]).map(f=>esc(f[1])),...(t.pickup_enabled?["線上點餐"]:[])].join("、")+'</td><td>'+tag(t.status)+'</td><td>'+esc(t.staff)+'</td><td><div class="platform-row-actions" role="group" aria-label="'+esc(t.name)+' 操作">'+
      '<a class="btn outline" href="'+esc(sharedUiState.route("staff",t.slug)+"&tab=settings")+'">設定</a>'+
      '<a class="btn outline" href="'+esc(sharedUiState.route("customer",t.slug))+'" target="_blank" rel="noopener">顧客頁</a>'+
      btn(t.status==="ACTIVE"?"暫停":"恢復","toggle-company","outline",'data-slug="'+esc(t.slug)+'"')+
      '</div></td></tr>').join("")||'<tr><td colspan="5">尚無企業</td></tr>')+
    '</tbody></table></div>';

 }else if(routeState.platformTab==="create"){
  html=box("新增企業客戶",'<p class="muted">完成後將建立獨立的店家網站與資料空間，LOGO、品牌色及營業設定會同步套用。</p>'+
    '<div class="grid"><div>'+field("網址英文代碼","create-slug","","text",'pattern="[a-z0-9-]{3,40}" placeholder="例如：my-shop"')+
    '</div><div>'+field("第一位企業管理者 Email（選填）","create-owner","","email")+
    '<p class="small">若填寫，將建立管理者邀請，請對方以該信箱註冊後接受。</p></div></div>'+
    merchantProfileFields("create",{accent:"#523B70",open_time:"10:00",close_time:"20:00",slot_capacity:3,slot_minutes:30})+
    '<div class="merchant-profile-section"><h3>開通服務</h3>'+featureChecks({reservation:true,queue:true,calling:true},"create-feature")+
      '<label class="checklist"><input type="checkbox" id="create-pickup-enabled"> 同時啟用線上點餐（建立後可在店家設定調整取餐時段）</label>'+'</div>'+
    '<div class="merchant-profile-actions">'+btn("建立企業專屬網站","create-tenant","primary")+'</div>');
 }else html=box("平台運作方式",'<p>每家店家都擁有獨立的管理空間，可以自行設定營業資訊、預約與取號功能，並管理本店員工、訂餐、預約、取號及顧客紀錄。</p><p>不同身分的使用者依權限操作對應門市。顧客可使用 LINE 完成身分確認；訊息通知依店家的官方帳號設定與 LINE 服務規則提供。</p>');

 return layout("公司總後台","企業開通與模組管理",menu,html);
}
