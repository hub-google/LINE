import {bookingState} from "../state/bookingState.js";

import {serviceUnitsState} from "../state/serviceUnitsState.js";

import {staffState} from "../state/staffState.js";

import {box,btn,esc,field,menuModeSelect,menuPrice} from "../shared-ui.js";

export function renderStaffMenu({t,isManager,html}){
  const items=staffState.staff.menu_items||[],selected=items.find(x=>x.id===bookingState.editingMenuItemId)||null;
  const kind=selected?.kind||"MENU",isCustomKind=!["MENU","SERVICE"].includes(kind);
  html+=box("預約／抽號選擇規則",
   '<p class="muted">預約與現場取號可分別設定；必填時顧客要先選好至少一項餐點或服務，才可以送出。</p>'+
   '<div class="grid"><div><label for="menu-book-mode">線上預約</label>'+menuModeSelect("menu-book-mode",t.menu_booking_mode||"DISABLED")+
   '</div><div><label for="menu-queue-mode">現場取號</label>'+menuModeSelect("menu-queue-mode",t.menu_queue_mode||"DISABLED")+'</div></div>'+
   (isManager?'<div class="staff-actionbar">'+btn("儲存選擇規則","save-menu-modes","primary")+'</div>':'<p class="small">僅管理員可修改設定。</p>'))+
   box("菜單／服務項目（"+items.length+" 項）",
    '<p class="muted">可設定共用餐點／服務、價格與排序；線上點餐可獨立設定開放或暫時售完，不影響預約／取號選擇規則，舊訂單保留當時價格。</p>'+
    (items.length?'<div class="scroll"><table class="rows"><thead><tr><th>類型</th><th>名稱與說明</th><th>價格</th><th>上架狀態</th><th>線上點餐</th><th>操作</th></tr></thead><tbody>'+
      items.map(item=>'<tr><td>'+esc(item.kind==="MENU"?"餐點":item.kind==="SERVICE"?"服務":item.kind)+'</td><td><strong>'+esc(item.name)+'</strong>'+
       (item.description?'<div class="small">'+esc(item.description)+'</div>':'')+'</td>'+
       '<td>'+esc(menuPrice(item)||"未設定")+'</td><td>'+esc(item.active?"上架中":"已停用")+'</td><td>'+
  (item.kind==="SERVICE"?"非餐點":!item.pickup_enabled?"未開放訂餐":item.pickup_sold_out?"暫時售完":"可訂餐")+'</td><td>'+
       (isManager?btn("編輯","menu-edit","outline",'data-id="'+esc(item.id)+'"')+' '+
        btn(item.active?"停用":"重新上架","menu-toggle","secondary",'data-id="'+esc(item.id)+'"')+
 (item.kind!=="SERVICE"?'<div class="staff-actionbar">'+
 btn(item.pickup_enabled?"關閉訂餐":"開放訂餐","pickup-menu-enabled","outline",'data-id="'+esc(item.id)+'"')+
 btn(item.pickup_sold_out?"恢復供應":"暫時售完","pickup-menu-sold-out","outline",'data-id="'+esc(item.id)+'"')+'</div>':""):'—')+
       '</td></tr>').join("")+'</tbody></table></div>':'<p class="muted">尚未建立餐點或服務。</p>'))+
   (isManager?box(selected?"修改餐點／服務":"新增餐點／服務",
    '<div class="grid"><div><label for="menu-kind">類型</label><select class="field" id="menu-kind">'+
    [["MENU","餐點"],["SERVICE","服務"],["__CUSTOM__","自行輸入"]].map(([v,label])=>'<option value="'+v+'" '+((isCustomKind?"__CUSTOM__":kind)===v?"selected":"")+'>'+label+'</option>').join("")+
    '</select><div id="menu-custom-kind-wrap" '+(isCustomKind?'':'hidden')+'>'+field("自行輸入類型","menu-custom-kind",isCustomKind?kind:"","text",'maxlength="30" placeholder="例如：課程、活動、商品"'+(isCustomKind?'':' disabled'))+'</div>'+field("名稱","menu-name",selected?.name||"")+
    field("價格（NT$，可留空）","menu-price",selected?.price??"","number",'min="0" step="0.01"')+'</div>'+
    '<div>'+field("說明（選填）","menu-description",selected?.description||"")+
    field("排序（數字越小越前面）","menu-order",selected?.sort_order??0,"number",'min="-9999" max="9999"')+
    '<label class="checklist"><input type="checkbox" id="menu-active" '+(selected?.active===false?"":"checked")+'> 開放顧客選擇</label></div></div>'+
    '<div class="staff-actionbar">'+btn(selected?"儲存修改":"新增項目","menu-save","primary")+
     (selected?btn("取消編輯","menu-edit-clear","outline"):"")+'</div>'):"");
   const defaultUnitIds=new Set((serviceUnitsState.unitConfig?.units||[]).filter(u=>u.is_default).map(u=>u.id));
   const resources=(staffState.staff.resourceContext?.resources||[]).filter(u=>!defaultUnitIds.has(u.id)),rules=staffState.staff.resourceContext?.service_rules||[];
  const services=items.filter(x=>x.kind!=="MENU");
  const firstService=services[0],firstRule=rules.find(x=>x.item_id===firstService?.id);
  html+=(serviceUnitsState.unitEnabled()?"":box("預約資源（員工／房間／設備）",
   '<p class="small">同一資源在服務時長＋緩衝時間內不可重複預約；停用資源不會改變既有預約。</p>'+
   (resources.length?'<div class="scroll"><table class="rows"><thead><tr><th>類型</th><th>名稱</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+
     resources.map(x=>'<tr><td>'+esc(({STAFF:"員工",ROOM:"房間",EQUIPMENT:"設備"})[x.kind]||x.kind)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.active?"啟用":"停用")+'</td><td>'+
        (isManager?btn(x.active?"停用":"啟用","resource-toggle","outline",'data-id="'+esc(x.id)+'"'):"—")+'</td></tr>').join("")+
     '</tbody></table></div>':'<p class="small">尚未建立資源；可以先建立服務項目，之後再指派員工或房間。</p>')+
   (isManager?'<div class="grid"><div>'+field("資源名稱","resource-name","")+'</div><div><label for="resource-kind">類型</label><select class="field" id="resource-kind">'+
      [["STAFF","員工"],["ROOM","房間"],["EQUIPMENT","設備"]].map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join("")+
      '</select></div></div>'+btn("新增資源","resource-save","primary"):"")))+
    (services.length?box("服務時長與緩衝（預約資源排程）",
     '<p class="small">'+(serviceUnitsState.unitEnabled()?'服務窗口與場次請到「設定 → 營業排程」管理。':'可指定每項服務的時間及一個員工／房間／設備。')+'服務時間與緩衝仍沿用既有預約資源排程。</p>'+
     (services.length?'<div class="scroll"><table class="rows"><thead><tr><th>服務</th><th>分鐘＋緩衝</th><th>指定資源</th></tr></thead><tbody>'+
       services.map(x=>{const rule=rules.find(z=>z.item_id===x.id);const res=resources.find(z=>z.id===rule?.resource_id);
         return '<tr><td>'+esc(x.name)+'</td><td>'+esc(rule?rule.duration_minutes+" + "+rule.buffer_minutes:"預設時段 "+t.slot_minutes+" + 0")+'</td><td>'+esc(res?.name||"未指派")+'</td></tr>'}).join("")+
       '</tbody></table></div>':'<p class="small">請先在上方新增「服務」項目，再設定專屬時長。</p>')+
     (isManager&&services.length?
       '<div class="grid"><div><label for="rule-service">選擇服務</label><select id="rule-service" class="field">'+
        services.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("")+'</select>'+
        field("服務時間（分鐘）","rule-duration",firstRule?.duration_minutes??t.slot_minutes,"number",'min="5" max="480"')+
        field("緩衝時間（分鐘）","rule-buffer",firstRule?.buffer_minutes??0,"number",'min="0" max="120"')+
        '</div><div><label for="rule-resource">指定服務資源</label><select id="rule-resource" class="field"><option value="">不指定</option>'+
        resources.filter(x=>x.active||x.id===firstRule?.resource_id).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===firstRule?.resource_id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+
        '</select><label class="checklist"><input type="checkbox" id="rule-show-duration" '+(firstRule?.show_duration_to_customer===false?"":"checked")+'>可向顧客顯示服務時長</label></div></div>'+
        '<div class="staff-actionbar">'+btn("儲存服務排程","service-rule-save","primary")+'</div>':"")):"");

return html;
}
