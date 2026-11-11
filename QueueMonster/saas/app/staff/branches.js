import {sharedUiState} from "../state/sharedUiState.js";

import {staffState} from "../state/staffState.js";

import {box,btn,esc,field,stat,tag} from "../shared-ui.js";

export function renderStaffBranches({role,html}){
   html+=box("多分店／總店管理",
     '<p class="small">同一位負責人可以把自己擁有的門市加入總店群組。各分店仍維持獨立預約、編號、員工權限與顧客資料。</p>'+
     (role==="OWNER"||role==="PLATFORM"?field("總店／品牌名稱","group-name","")+
       '<div style="margin-top:10px">'+btn("建立總店群組","create-business-group","primary")+'</div>':""));
   html+=staffState.businessGroups.length?staffState.businessGroups.map(g=>box(g.name,
     '<div class="grid4">'+stat("分店數",(g.branches||[]).length)+
     stat("今日預約",(g.branches||[]).reduce((n,b)=>n+Number(b.today_reservations||0),0))+
     stat("現場候位",(g.branches||[]).reduce((n,b)=>n+Number(b.waiting||0),0))+stat("今日有效訂單",(g.branches||[]).reduce((n,b)=>n+Number(b.today_orders||0),0))+
     stat("訂單金額","NT$ "+(g.branches||[]).reduce((n,b)=>n+Number(b.today_order_amount||0),0).toLocaleString("zh-TW"))+'</div>'+
     '<div class="scroll"><table class="rows"><thead><tr><th>門市</th><th>狀態</th><th>今日預約</th><th>候位</th><th>有效訂單</th><th>訂單金額</th><th>操作</th></tr></thead><tbody>'+
     (g.branches||[]).map(b=>'<tr><td><a href="'+esc(sharedUiState.route("staff",b.slug))+'">'+esc(b.name)+'</a></td><td>'+tag(b.status)+'</td><td>'+esc(b.today_reservations)+'</td><td>'+esc(b.waiting)+'</td><td>'+btn("移出總店","detach-business-branch","outline",'data-group="'+esc(g.id)+'" data-slug="'+esc(b.slug)+'"')+'</td></tr>').join("")+
     '</tbody></table></div>'+
     '<div class="grid"><div>'+field("加入既有門市網址代碼","branch-slug-"+g.id,"")+'</div><div class="staff-actionbar">'+
     btn("加入門市","attach-business-branch","primary",'data-group="'+esc(g.id)+'"')+'</div></div>')).join("") :
     box("尚無總店群組",'<p class="muted">建立總店群組後，即可加入由你擔任 OWNER 的其他門市。</p>');

return html;
}
