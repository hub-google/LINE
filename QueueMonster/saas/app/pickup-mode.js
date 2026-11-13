
import {routeState} from "./state/routeState.js";
import {customerState} from "./state/customerState.js";
import {staffState} from "./state/staffState.js";
import {lineState} from "./state/lineState.js";
import {box,btn,esc,field,taipei} from "./shared-ui.js";
import {rpc,act,load} from "./data-loading.js";
import {render} from "./staff-layout.js";
import {selectCustomerDetail} from "./customer-detail.js";
import {customerNoticeSuffix,sendOrderReply,lineReplyHandoff} from "./line-session.js";
import {normalizeTaiwanPhone,isValidTaiwanPhone,TW_LANDLINE_AREAS,getTaiwanLandlineHint,isValidTaiwanPhoneParts} from "./tw-phone.js";

// The existing store, LINE identity and so_menu_items catalogue remain the source of truth.
// This module owns only pickup-specific presentation and form state.
export const pickupState={
  customer:null,staff:null,customerSlug:"",staffSlug:"",
  day:"",slot:"",method:"scheduled",cart:{},note:"",requestId:"",history:null,historyPage:1,historyFilter:"all",customerHistory:null,customerHistoryPage:1,phoneType:"mobile",phone:"",phoneArea:"02",phoneLocal:"",confirming:false
};
const statusText={NEW:"待店家接單",ACCEPTED:"已接單・待製作",PREPARING:"製作中",
  READY:"已完成待取",PICKED_UP:"已取餐",REJECTED:"店家已取消訂單",CANCELLED:"已取消"};
export const pickupStatusLabel=status=>statusText[status]||status;
const pickupContactPhone=()=>pickupState.phoneType==="landline"?pickupState.phoneArea+pickupState.phoneLocal:pickupState.phone;
const validPickupContactPhone=()=>isValidTaiwanPhoneParts(pickupState.phoneType,pickupState.phone,pickupState.phoneArea,pickupState.phoneLocal);
const money=n=>"NT$ "+Number(n||0).toLocaleString("zh-TW",{maximumFractionDigits:2});
const modeName={DISABLED:"僅立即取餐",OPTIONAL:"顧客可選立即或預約取餐",REQUIRED:"必須選擇取餐時間"};
const uuid=()=>{if(!globalThis.crypto?.randomUUID)throw Error("瀏覽器不支援安全訂單識別");return crypto.randomUUID();};
const lines=o=>(o.items||[]).map(i=>esc(i.name)+" × "+esc(i.qty)).join("、");

export async function loadPickupData(){
  if(routeState.view==="customer"&&customerState.customer){
    if(!pickupState.day)pickupState.day=taipei();
    if(pickupState.customerSlug!==routeState.slug){
      pickupState.customer=null;pickupState.customerSlug=routeState.slug;
      pickupState.cart={};pickupState.slot="";pickupState.requestId="";pickupState.method="scheduled";pickupState.confirming=false;pickupState.phoneType="mobile";pickupState.phone="";pickupState.phoneArea="02";pickupState.phoneLocal="";pickupState.customerHistory=null;pickupState.customerHistoryPage=1
    }
    if(!pickupState.customer||routeState.customerTab==="order"){
      try{pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});}
      catch(err){console.warn("取餐服務資料不可用",err);pickupState.customer=null;}
    }
    if(routeState.customerTab==="order"||(routeState.customerTab==="detail"&&routeState.detailKind==="order")){
      try{pickupState.customerHistory=await rpc("so_pickup_my_orders",{p_slug:routeState.slug,p_page:pickupState.customerHistoryPage});}
      catch(e){console.warn("無法讀取訂餐完整歷史",e);pickupState.customerHistory=null;}
    }
    if(pickupState.customer?.settings?.schedule_mode==="DISABLED")pickupState.method="immediate";
    if(pickupState.customer?.settings?.schedule_mode==="REQUIRED")pickupState.method="scheduled";
    if(!pickupState.customer?.slots?.some(x=>x.time===pickupState.slot&&x.left>0))pickupState.slot="";
  }else if(routeState.view==="customer"){pickupState.customer=null;}
  if(routeState.view==="staff"&&staffState.staff&&["orders","settings","dashboard","calendar"].includes(staffState.staffTab)){
    if(pickupState.staffSlug!==routeState.slug){pickupState.staff=null;pickupState.staffSlug=routeState.slug;}
    try{pickupState.staff=await rpc("so_pickup_staff",{p_slug:routeState.slug});}
    catch(err){console.warn("取餐店家資料不可用",err);pickupState.staff=null;}
    if(staffState.staffTab==="orders"){
      try{pickupState.history=await rpc("so_pickup_history",{p_slug:routeState.slug,p_page:pickupState.historyPage,p_filter:pickupState.historyFilter});}
      catch(err){console.warn("訂餐歷史暫時不可用",err);pickupState.history=null;}
    }
  }
}

export function renderPickupSettings(isManager){
 const data=pickupState.staff;
 if(!data)return box("線上點餐與取餐設定",'<p class="muted">尚無法取得取餐服務設定，請確認資料庫已更新或重新整理。</p>');
 const s=data.settings||{};
 const select=(id,options,value)=>'<select class="field" id="'+id+'">'+options.map(([v,label])=>
   '<option value="'+esc(v)+'" '+(String(v)===String(value)?"selected":"")+'>'+esc(label)+'</option>').join("")+'</select>';
 return box("線上點餐與取餐進度",
   '<p class="muted">沿用「設定 → 菜單與服務」的餐點，不另建第二份菜單。此模式與原本預約、取號獨立；不處理線上付款。</p>'+
   (!isManager?'<p>線上點餐：'+(s.enabled?"已啟用":"未啟用")+'；取餐方式：'+esc(modeName[s.schedule_mode]||"預約")+'</p>':
   '<p class="settings-guidance">線上點餐是否開放，請使用本頁上方的「顧客服務開放設定」。這裡只需調整取餐方式與時段。</p>'+
   '<label for="pickup-mode">顧客選擇取餐時間</label>'+
   select("pickup-mode",[["DISABLED",modeName.DISABLED],["OPTIONAL",modeName.OPTIONAL],["REQUIRED",modeName.REQUIRED]],s.schedule_mode)+
   '<p class="small">選擇預約取餐時，系統依顧客指定時間排單。晚一點取餐的餐點不會在清晨提前進入製作流程。</p>'+
   '<div class="grid"><div>'+field("每天最早取餐時間","pickup-start",s.pickup_start||"05:30","time")+
   field("每天最後取餐截止","pickup-end",s.pickup_end||"14:00","time")+
   '<label for="pickup-interval">取餐時段間隔</label>'+select("pickup-interval",[[5,"5 分鐘"],[10,"10 分鐘"],[15,"15 分鐘"],[20,"20 分鐘"],[30,"30 分鐘"],[60,"60 分鐘"]],s.interval_minutes)+'</div>'+
   '<div>'+'<label for="pickup-capacity-basis">取餐時段容量計算方式</label>'+
   select("pickup-capacity-basis",[["ORDERS","每時段訂單筆數"],["ITEMS","每時段餐點總份數"]],s.capacity_basis||"ORDERS")+
   field("每時段最多可接數量（依上方單位）","pickup-capacity",s.slot_capacity||5,"number",'min="1" max="300"')+
   field("至少提前幾分鐘下單","pickup-notice",s.min_notice_minutes??20,"number",'min="0" max="1440"')+
   field("可提前預訂天數（0～30）","pickup-days",s.days_ahead??7,"number",'min="0" max="30"')+'</div></div>'+
   field("預估製作時間（分鐘）","pickup-prep",s.prep_minutes??20,"number",'min="1" max="180"')+
   '<p class="small">取餐時段容量可選「訂單數」或「餐點份數」。選擇份數後，08:00 的 20 份漢堡會占用 20 份容量；已成立訂單的取餐時間不變。</p>'+
   '<div class="staff-actionbar">'+btn("儲存取餐設定","pickup-save","primary")+'</div>')+
   '<div class="inset" style="margin-top:12px"><strong>點餐連結</strong><p class="small">服務啟用後，可把下方網址提供給顧客。</p>'+
   (s.enabled?'<p style="overflow-wrap:anywhere"><a target="_blank" rel="noopener noreferrer" href="'+esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'">'+
   esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'</a></p>':'<p class="muted">尚未開放線上點餐</p>')+'</div>')+
   (isManager?box("店員訂餐操作權限",
    '<p class="small">只影響一般員工角色，負責人、管理者及平台管理員維持管理權限。已加入企業的員工不需要重複建立帳號。</p>'+
    '<label class="checklist"><input id="pickup-staff-view" type="checkbox" '+(data.staff_can_view===false?"":"checked")+'>允許一般員工查看訂單與取餐日曆</label>'+
    '<label class="checklist"><input id="pickup-staff-update" type="checkbox" '+(data.staff_can_update===false?"":"checked")+'>允許一般員工修改訂單狀態</label>'+
    btn("儲存訂餐員工權限","pickup-staff-permissions-save","primary")):"");
}

export function renderCustomerPickup(){
 const d=pickupState.customer;
 if(!d)return box("線上點餐",'<p class="muted">正在讀取店家菜單，若持續無法載入請重新整理。</p>');
 const s=d.settings||{};
 
 const immediate=pickupState.method==="immediate";
 const openNow=s.open_now!==false;
 const total=(d.items||[]).reduce((sum,x)=>sum+Number(x.price||0)*(pickupState.cart[x.id]||0),0);
 const count=Object.values(pickupState.cart).reduce((a,b)=>a+b,0);
 const customerOrders=pickupState.customerHistory?.orders||d.orders||[];
 const historyTotal=Number(pickupState.customerHistory?.total??customerOrders.length);
 const historyMax=Math.max(1,Math.ceil(historyTotal/25));
 const historyControls=historyTotal>25?
   '<div class="staff-actionbar">'+
   btn("上一頁","pickup-customer-history-page","outline",'data-page="'+(pickupState.customerHistoryPage-1)+'"'+(pickupState.customerHistoryPage<=1?' disabled':''))+
   '<span>第 '+pickupState.customerHistoryPage+'／'+historyMax+' 頁</span>'+
   btn("下一頁","pickup-customer-history-page","outline",'data-page="'+(pickupState.customerHistoryPage+1)+'"'+(pickupState.customerHistoryPage>=historyMax?' disabled':''))+
   '</div>':"";
 const featuredCancelIndex=customerOrders.findIndex(o=>o.status==="NEW"&&
   Number.isFinite(Date.parse(o.created_at||""))&&Date.now()<Date.parse(o.created_at)+15000);
 const orderCardList=customerOrders.map(o=>{
  const deadline=Date.parse(o.created_at||"")+15000;
  const remaining=Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-Date.now())/1000)):0;
  const canCancel=o.status==="NEW"&&remaining>0;
  return '<div class="inset" style="margin-top:10px"><div class="listline"><strong>'+esc(o.number)+'</strong><span>'+esc(canCancel?"可取消・倒數中":statusText[o.status]||o.status)+'</span></div>'+
   '<p class="small">取餐：'+esc(o.pickup_at)+(o.scheduled?"（預約）":"（即時）")+'</p>'+
   '<p>'+lines(o)+'</p><p><strong>'+money(o.total)+'</strong></p>'+
   (canCancel?'<div data-pickup-grace-until="'+deadline+'" role="status" aria-live="off">'+
    '<p class="notice" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>可取消訂單剩餘時間</span><strong style="font-size:1.45em;font-variant-numeric:tabular-nums"><span class="pickup-grace-seconds">'+remaining+'</span> 秒</strong></p>'+
    '<p class="small">倒數結束後訂單會送給店家，無法自行取消。</p>'+
    btn("取消訂單","pickup-cancel","outline",'data-id="'+esc(o.id)+'"')+'</div>':
    (o.status==="NEW"?'<p class="small">訂單已送給店家，無法自行取消。</p>':
    ["ACCEPTED","PREPARING","READY"].includes(o.status)?'<p class="small">店家已接單，無法自行取消。</p>':""))+
   '</div>';
 });
 const orderCards=orderCardList.join("");
 const featuredCancelCard=featuredCancelIndex>=0?orderCardList[featuredCancelIndex]:"";
 const otherOrderCards=orderCardList.filter((_,i)=>i!==featuredCancelIndex).join("");
 if(!s.enabled)return box("尚未開放線上點餐",'<p>店家暫停接受新訂單，既有訂單仍可查看。</p>'+(orderCards||'<p>目前沒有訂餐紀錄。</p>')+historyControls);
 const available=(d.slots||[]).filter(x=>x.left>0);
 return box("線上點餐",
  '<p class="muted">直接使用本店上架菜單，送出後可在此追蹤接單、製餐、可取餐與已取餐進度。</p>'+
  (featuredCancelCard?'<section role="region" aria-label="新訂單取消倒數" style="margin:10px 0 18px"><h3>訂單已送出</h3>'+featuredCancelCard+'</section>':
  '<p class="notice"><strong>下單後 15 秒內可取消。</strong>送出訂單後會顯示倒數；倒數結束，訂單才會交給店家接單，之後無法自行取消。</p>')+
  (s.schedule_mode==="OPTIONAL"?'<div class="staff-actionbar">'+
   btn("立即取餐","pickup-method",immediate?"primary":"outline",'data-value="immediate" '+(openNow?"":'disabled'))+
   btn("預約指定時間","pickup-method",!immediate?"primary":"outline",'data-value="scheduled"')+'</div>':"")+
  (immediate&&!openNow?'<p class="alert">目前不在營業時間內，無法立即取餐；可切換預約取餐日期查看開放時段。</p>':"")+
  (immediate?'<p class="notice">預估製作時間約 '+esc(s.prep_minutes)+' 分鐘，實際以店家接單進度為準。</p>':
   '<div class="grid"><div>'+field("取餐日期","pickup-day",pickupState.day||taipei(),"date",'min="'+taipei()+'"')+
   '</div><div><label for="pickup-slot">取餐時間</label><select class="field" id="pickup-slot"><option value="">請選擇取餐時間</option>'+
   available.map(x=>'<option value="'+esc(x.time)+'" '+(pickupState.slot===x.time?"selected":"")+'>'+esc(x.time)+'（可接 '+esc(x.left)+(s.capacity_basis==='ITEMS'?' 份':' 單')+'）</option>').join("")+
   '</select></div></div>'+
   (available.length?"":'<p class="alert">本日沒有可預約時段，請更換日期或稍後再試。</p>'))+
  '<h3 style="margin:18px 0 10px">選擇餐點</h3>'+
  (d.items||[]).map(i=>'<div class="listline" style="align-items:center;gap:10px"><div style="flex:1;min-width:0"><strong>'+esc(i.name)+'</strong>'+
   '<p class="small">'+esc(i.description||"")+'</p><strong>'+money(i.price)+'</strong></div>'+
   '<div class="staff-actionbar">'+btn("－","pickup-qty","outline",'data-id="'+esc(i.id)+'" data-delta="-1" aria-label="減少 '+esc(i.name)+'"')+
   '<strong>'+esc(pickupState.cart[i.id]||0)+'</strong>'+
   btn("＋","pickup-qty","outline",'data-id="'+esc(i.id)+'" data-delta="1" aria-label="增加 '+esc(i.name)+'"')+'</div></div>').join("")+
  '<div style="margin-top:12px"><label for="pickup-phone-type">聯絡電話類型</label><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
   '<select class="field" id="pickup-phone-type" style="width:140px;max-width:100%"><option value="mobile" '+(pickupState.phoneType==="mobile"?"selected":"")+'>手機</option><option value="landline" '+(pickupState.phoneType==="landline"?"selected":"")+'>市話</option></select>'+
   '</div>'+
   (pickupState.phoneType==="mobile"?
      field("手機號碼","pickup-customer-phone",pickupState.phone,"tel",'inputmode="numeric" autocomplete="tel-national" pattern="[0-9]*" maxlength="10" placeholder="例如：0912345678（臺灣號碼，09 開頭、10 碼、半形數字）"'):
      '<div style="display:grid;grid-template-columns:minmax(0,125px) minmax(0,1fr);gap:10px;margin-top:8px;align-items:end">'+
        '<div><label for="pickup-customer-area">市話區碼</label><select class="field" id="pickup-customer-area">'+TW_LANDLINE_AREAS.map(a=>'<option value="'+esc(a)+'" '+(a===pickupState.phoneArea?"selected":"")+'>'+esc(a)+'</option>').join("")+'</select></div>'+
        '<div style="min-width:0">'+field("市話號碼","pickup-customer-local",pickupState.phoneLocal,"tel",'inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="例如：'+esc(getTaiwanLandlineHint(pickupState.phoneArea).example)+'（臺灣市話，半形數字）"')+'</div></div>')+
   '</div>'+
   '<div style="margin-top:12px">'+field("給店家的備註（最多 200 字）","pickup-note",pickupState.note,"text",'maxlength="200" placeholder="例如：不要加辣"')+'</div>'+
  '<div class="listline"><strong>共 '+esc(count)+' 份</strong><strong>'+money(total)+'</strong></div>'+
  '<p class="small">此處僅建立訂單，不會線上收款；請依店家現場方式結帳。</p>'+
  (pickupState.confirming?'<div class="inset" role="group" aria-label="確認訂餐內容"><strong>請核對送出前的訂餐內容</strong>'+
    '<p>聯絡電話：'+esc(normalizeTaiwanPhone(pickupContactPhone()))+'</p>'+
    '<p>預計取餐：'+(immediate?'立即取餐（以店家接單為準）':esc(pickupState.day)+' '+esc(pickupState.slot))+'</p>'+
    '<p>餐點：'+(d.items||[]).filter(i=>pickupState.cart[i.id]>0).map(i=>esc(i.name)+' × '+esc(pickupState.cart[i.id])).join('、')+'</p>'+
    '<p>金額：'+money(total)+'（以送出時店家菜單價格重新計算）</p>'+
    '<p>備註：'+esc(pickupState.note||'無')+'</p><div class="staff-actionbar">'+
    btn("返回修改","pickup-review-back","outline")+btn("確定送出訂單","pickup-submit","primary")+'</div></div>':
    btn("下一步：確認訂單內容","pickup-review","primary full",(!count||(immediate&&!openNow)||(!immediate&&!pickupState.slot))?"disabled":""))+
  (customerOrders.length>(featuredCancelCard?1:0)?
    '<h3 style="margin:20px 0 8px">我的取餐進度（'+historyTotal+' 筆）</h3>'+otherOrderCards+historyControls:
    (featuredCancelCard?historyControls:'<p class="small">還沒有取餐訂單。</p>')));
}

export function renderStaffPickup(){
 const d=pickupState.staff;
 if(!d)return box("取餐訂單",'<p class="muted">目前無法讀取取餐訂單，請重新整理。</p>');
 // 停用訂餐僅阻止新增訂單，不隱藏既有訂單或歷史紀錄。
 const orders=d.orders||[],active=orders.filter(o=>!["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const history=orders.filter(o=>["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const canUpdate=d.can_update!==false;
 const staffStatusText={NEW:"待接單",ACCEPTED:"已接單",PREPARING:"製作中",
   READY:"已完成待取",PICKED_UP:"已取餐",REJECTED:"店家已取消訂單",CANCELLED:"已取消"};
 const action=(o,label,status,disabled=false,style="outline")=>btn(label,"pickup-status",style,
   'data-id="'+esc(o.id)+'" data-status="'+status+'" data-expected="'+esc(o.status)+'"'+
   (disabled?' disabled title="目前狀態或尚未到建議製作時間"':''));
 // These choices remain available for every order, including rejected and finished orders.
 const choices=o=>[[o.status==="READY"?"確認已取餐":"接單",o.status==="READY"?"PICKED_UP":"ACCEPTED"],["已完成待取","READY"],["取消訂單","REJECTED"]];
 const card=o=>'<div class="inset" style="margin:0 0 12px;padding:14px"><div class="listline"><strong>'+
  esc(o.number)+'</strong><strong>'+esc(staffStatusText[o.status]||o.status)+'</strong></div>'+
  '<p class="small"><strong>約定取餐 '+esc(o.pickup_at)+'</strong> '+(o.scheduled?"（指定時間）":"（立即）")+'</p>'+
  '<p class="small">聯絡電話：'+esc(o.customer_phone||'未提供')+'</p><p class="small">建議開始製作：'+esc(o.prepare_at)+(o.can_prepare?"":" — 尚未到製作時間")+'</p>'+
  '<p>'+lines(o)+'</p><p class="small">'+(o.note?"備註："+esc(o.note):"無備註")+' ・ '+money(o.total)+'</p>'+
  (canUpdate?'<div class="staff-actionbar" role="group" aria-label="選擇訂單狀態">'+
  choices(o).map(([label,status])=>action(o,label,status,o.status===status,o.status===status?"primary":"outline")).join("")+'</div>':
  '<p class="small">此員工角色僅可查看訂單，由管理者修改狀態。</p>')+
  (canUpdate?'<details style="margin-top:8px"><summary class="small">其他操作（開始製作／取消類型更正／恢復待接單）</summary>'+
  '<div class="staff-actionbar" style="margin-top:10px">'+
  (o.status==="ACCEPTED"?action(o,"開始製作","PREPARING",!o.can_prepare):"")+
  (o.status!=="CANCELLED"?action(o,"更正為顧客取消","CANCELLED"):"")+
  (o.status!=="NEW"?action(o,"恢復待接單","NEW"):"")+'</div></details>':"")+'</div>';
 const h=pickupState.history||{},past=h.orders||[],maxPage=Math.max(1,Math.ceil(Number(h.total||0)/25));
 const choose=(f,label)=>btn(label,"pickup-history-filter",pickupState.historyFilter===f?"primary":"outline",'data-filter="'+f+'"');
 return box("取餐訂單管理",
  '<p class="small">依約定取餐時間排序。可切換接單、已完成待取或取消訂單；誤操作可以更正，所有變更均保留稽核紀錄。</p>'+
  '<p><strong>待處理 '+active.length+' 筆</strong></p>'+
  (active.length?active.map(card).join(""):'<p class="muted">目前沒有待處理訂單。</p>')+
  '<details class="pickup-history-panel" open><summary>歷史訂單（'+Number(h.total??history.length)+' 筆，可更正狀態）</summary>'+
  '<div class="staff-actionbar" style="margin-top:12px">'+choose("all","全部")+choose("active","進行中")+choose("closed","已結束")+'</div>'+
  (past.length?past.map(card).join(""):'<p class="muted">目前沒有符合條件的訂單。</p>')+
  '<div class="staff-actionbar">'+btn("上一頁","pickup-history-page","outline",'data-page="'+(pickupState.historyPage-1)+'"'+(pickupState.historyPage<=1?' disabled':''))+
  '<span>第 '+pickupState.historyPage+'／'+maxPage+' 頁</span>'+
  btn("下一頁","pickup-history-page","outline",'data-page="'+(pickupState.historyPage+1)+'"'+(pickupState.historyPage>=maxPage?' disabled':''))+'</div></details>');

}

export async function handlePickupAction(ev,b,a,id){
 if(!a.startsWith("pickup-"))return false;
 if(a==="pickup-line-reply"){
   if(!id)return true;
   await act(async()=>{
     const handoff=await lineReplyHandoff("order",id);
     location.assign(handoff.oaMessageUrl);
     return "正在開啟 LINE 聊天室；請按傳送取得訂餐確認卡";
   });return true;
 }
 if(a==="pickup-customer-history-page"){
    const page=Number(b.dataset.page),max=Math.max(1,Math.ceil(Number(pickupState.customerHistory?.total||0)/25));
    if(Number.isInteger(page)&&page>=1&&page<=max){pickupState.customerHistoryPage=page;await load();}
    return true;
 }
 if(a==="pickup-history-page"){
  const page=Number(b.dataset.page),max=Math.max(1,Math.ceil(Number(pickupState.history?.total||0)/25));
  if(Number.isInteger(page)&&page>=1&&page<=max){pickupState.historyPage=page;await load();}
  return true;
 }
 if(a==="pickup-history-filter"){
  if(!["all","active","closed"].includes(b.dataset.filter))return true;
  pickupState.historyFilter=b.dataset.filter;pickupState.historyPage=1;await load();return true;
 }
 if(a==="pickup-review"){
   if(!validPickupContactPhone()){window.alert(pickupState.phoneType==="mobile"?"請輸入 09 開頭、10 碼的台灣手機號碼":"市話區碼與電話號碼格式錯誤，請依區碼確認位數及號碼開頭");return true;}
   if(!Object.values(pickupState.cart).some(n=>n>0)){window.alert("請先選擇餐點");return true;}
   pickupState.confirming=true;render();return true;
 }
 if(a==="pickup-review-back"){pickupState.confirming=false;render();return true;}
 if(a==="pickup-method"){
   pickupState.method=b.dataset.value==="immediate"?"immediate":"scheduled";pickupState.confirming=false;render();return true;
 }
 if(a==="pickup-qty"){
   const menu=pickupState.customer?.items||[];
   if(!menu.some(x=>x.id===id))return true;
   const qty=Math.max(0,Math.min(20,(pickupState.cart[id]||0)+Number(b.dataset.delta||0)));
   if(qty)pickupState.cart[id]=qty;else delete pickupState.cart[id];
   pickupState.requestId="";pickupState.confirming=false;render();return true;
 }
 if(a==="pickup-staff-permissions-save"){
   const canView=!!routeState.$("pickup-staff-view")?.checked;
   const canUpdate=!!routeState.$("pickup-staff-update")?.checked;
   if(!canView&&canUpdate){window.alert("若關閉訂單檢視權限，也必須關閉修改權限");return true;}
   await act(async()=>{
     await rpc("so_pickup_set_staff_permissions",{p_slug:routeState.slug,p_can_view:canView,p_can_update:canUpdate});
     return "一般員工的訂餐權限已更新";
   });return true;
 }
 if(a==="pickup-save"){
   await act(async()=>{
     await rpc("so_pickup_save_capacity_settings",{p_slug:routeState.slug,
       p_enabled:pickupState.staff?.settings?.enabled===true,p_mode:routeState.$("pickup-mode")?.value,
       p_start:routeState.$("pickup-start")?.value,p_end:routeState.$("pickup-end")?.value,
       p_interval:Number(routeState.$("pickup-interval")?.value),
       p_capacity:Number(routeState.$("pickup-capacity")?.value),
       p_notice:Number(routeState.$("pickup-notice")?.value),
       p_days:Number(routeState.$("pickup-days")?.value),
       p_prep:Number(routeState.$("pickup-prep")?.value),p_capacity_basis:routeState.$("pickup-capacity-basis")?.value});
     pickupState.customer=null;return "取餐時段與容量設定已儲存";
   });return true;
 }
 if(a==="pickup-submit"){
   if(!pickupState.confirming){window.alert("請先確認訂單內容");return true;}
   if(!validPickupContactPhone()){
     pickupState.confirming=false;window.alert("請填寫有效的台灣手機或市話");render();return true;
   }
   const items=Object.entries(pickupState.cart).filter(([,qty])=>qty>0).map(([itemId,qty])=>({id:itemId,qty}));
   if(!items.length)return true;
   if(pickupState.method!=="immediate"&&!pickupState.slot)return true;
   try{if(!pickupState.requestId)pickupState.requestId=uuid();}catch(e){window.alert(e.message);return true;}
   let placed=false;
   await act(async()=>{
     const res=await rpc("so_pickup_place_phone",{p_slug:routeState.slug,
       p_date:pickupState.method==="immediate"?null:pickupState.day,
       p_time:pickupState.method==="immediate"?null:pickupState.slot,
       p_items:items,p_note:pickupState.note,p_request_id:pickupState.requestId,
       p_immediate:pickupState.method==="immediate",
       p_customer_phone:normalizeTaiwanPhone(pickupContactPhone())});
     pickupState.cart={};pickupState.note="";pickupState.requestId="";pickupState.confirming=false;placed=true;
     if(!selectCustomerDetail("order",res.id))routeState.customerTab="order";
     const notice=await sendOrderReply(res.id);
      return "訂單 "+res.number+" 已送出。15 秒內可取消，倒數後交給店家接單"+customerNoticeSuffix(notice);
   });
   if(placed)window.scrollTo({top:0,behavior:"instant"});
   return true;
 }
 if(a==="pickup-status"){
   if(!id)return true;
   const desired=b.dataset.status,expected=b.dataset.expected;
   if(desired===expected)return true;
   if(["REJECTED","CANCELLED"].includes(desired)&&!confirm("確定要取消這筆訂單？"))return true;
   if(desired==="PICKED_UP"&&!confirm("確認顧客已領取這筆訂單？"))return true;
   await act(async()=>{
     await rpc("so_pickup_update",{p_slug:routeState.slug,p_order_id:id,p_expected:expected,p_status:desired});
     return "訂單狀態已更新為："+(statusText[desired]||desired);
   });return true;
 }
 if(a==="pickup-cancel"){
   if(!id)return true;
   // Cancel immediately: a confirmation dialog would consume the 15-second window.
   await act(async()=>{
     await rpc("so_pickup_cancel",{p_slug:routeState.slug,p_order_id:id});
     return "訂單已取消";
   });return true;
 }
 return true;
}

export function initializePickupMode(){
 pickupState.day=taipei();
 // Countdown updates only the DOM; no 1-second API requests.
 setInterval(()=>{
   document.querySelectorAll("[data-pickup-grace-until]").forEach(el=>{
     const seconds=Math.max(0,Math.ceil((Number(el.dataset.pickupGraceUntil)-Date.now())/1000));
     const counter=el.querySelector(".pickup-grace-seconds");
     if(counter)counter.textContent=String(seconds);
     if(!seconds){
       el.querySelectorAll("button").forEach(button=>{button.disabled=true;});
       if(!el.dataset.expired){
         el.dataset.expired="true";
         const p=el.querySelector(".notice");
         if(p)p.textContent="取消期限已結束，訂單已交給店家，無法自行取消。";
       }
     }
   });
 },250);
 document.addEventListener("input",ev=>{
  if(ev.target?.id==="pickup-note"){pickupState.note=ev.target.value;pickupState.requestId="";pickupState.confirming=false;}
  if(ev.target?.id==="pickup-customer-phone"){pickupState.phone=ev.target.value.replace(/\D/g,"").slice(0,10);ev.target.value=pickupState.phone;pickupState.requestId="";pickupState.confirming=false;}
  if(ev.target?.id==="pickup-customer-local"){pickupState.phoneLocal=ev.target.value.replace(/\D/g,"").slice(0,8);ev.target.value=pickupState.phoneLocal;pickupState.requestId="";pickupState.confirming=false;}
 });
 document.addEventListener("change",async ev=>{
  if(ev.target?.id==="pickup-phone-type"){pickupState.phoneType=ev.target.value==="landline"?"landline":"mobile";pickupState.requestId="";pickupState.confirming=false;render();return;}
  if(ev.target?.id==="pickup-customer-area"){pickupState.phoneArea=TW_LANDLINE_AREAS.includes(ev.target.value)?ev.target.value:"02";pickupState.requestId="";pickupState.confirming=false;render();return;}
  if(ev.target?.id==="pickup-day"){
   pickupState.day=ev.target.value;pickupState.slot="";pickupState.requestId="";pickupState.confirming=false;
   try{
     pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});
     render();
   }catch(err){window.alert(err.message);}
  }
  if(ev.target?.id==="pickup-slot"){pickupState.slot=ev.target.value;pickupState.requestId="";pickupState.confirming=false;render();}
 });
}
