
import {routeState} from "./state/routeState.js";
import {customerState} from "./state/customerState.js";
import {staffState} from "./state/staffState.js";
import {box,btn,esc,field,taipei} from "./shared-ui.js";
import {rpc,act,load} from "./data-loading.js";
import {render} from "./staff-layout.js";

// The existing store, LINE identity and so_menu_items catalogue remain the source of truth.
// This module owns only pickup-specific presentation and form state.
export const pickupState={
  customer:null,staff:null,customerSlug:"",staffSlug:"",
  day:"",slot:"",method:"scheduled",cart:{},note:"",requestId:""
};
const statusText={NEW:"待店家接單",ACCEPTED:"已接單・待製作",PREPARING:"製作中",
  READY:"可取餐",PICKED_UP:"已取餐",REJECTED:"店家未接單",CANCELLED:"已取消"};
const money=n=>"NT$ "+Number(n||0).toLocaleString("zh-TW",{maximumFractionDigits:2});
const modeName={DISABLED:"僅立即取餐",OPTIONAL:"顧客可選立即或預約取餐",REQUIRED:"必須選擇取餐時間"};
const uuid=()=>{if(!globalThis.crypto?.randomUUID)throw Error("瀏覽器不支援安全訂單識別");return crypto.randomUUID();};
const lines=o=>(o.items||[]).map(i=>esc(i.name)+" × "+esc(i.qty)).join("、");

export async function loadPickupData(){
  if(routeState.view==="customer"&&customerState.customer){
    if(!pickupState.day)pickupState.day=taipei();
    if(pickupState.customerSlug!==routeState.slug){
      pickupState.customer=null;pickupState.customerSlug=routeState.slug;
      pickupState.cart={};pickupState.slot="";pickupState.requestId="";pickupState.method="scheduled";
    }
    if(!pickupState.customer||routeState.customerTab==="order"){
      try{pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});}
      catch(err){console.warn("取餐服務資料不可用",err);pickupState.customer=null;}
    }
    if(pickupState.customer?.settings?.schedule_mode==="DISABLED")pickupState.method="immediate";
    if(pickupState.customer?.settings?.schedule_mode==="REQUIRED")pickupState.method="scheduled";
    if(!pickupState.customer?.slots?.some(x=>x.time===pickupState.slot&&x.left>0))pickupState.slot="";
  }else if(routeState.view==="customer"){pickupState.customer=null;}
  if(routeState.view==="staff"&&staffState.staff&&["orders","settings"].includes(staffState.staffTab)){
    if(pickupState.staffSlug!==routeState.slug){pickupState.staff=null;pickupState.staffSlug=routeState.slug;}
    try{pickupState.staff=await rpc("so_pickup_staff",{p_slug:routeState.slug});}
    catch(err){console.warn("取餐店家資料不可用",err);pickupState.staff=null;}
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
   '<label class="checklist"><input id="pickup-enabled" type="checkbox" '+(s.enabled?"checked":"")+'>開放線上點餐</label>'+
   '<label for="pickup-mode">顧客選擇取餐時間</label>'+
   select("pickup-mode",[["DISABLED",modeName.DISABLED],["OPTIONAL",modeName.OPTIONAL],["REQUIRED",modeName.REQUIRED]],s.schedule_mode)+
   '<p class="small">選擇預約取餐時，系統依顧客指定時間排單。晚一點取餐的餐點不會在清晨提前進入製作流程。</p>'+
   '<div class="grid"><div>'+field("每天最早取餐時間","pickup-start",s.pickup_start||"05:30","time")+
   field("每天最後取餐截止","pickup-end",s.pickup_end||"14:00","time")+
   '<label for="pickup-interval">取餐時段間隔</label>'+select("pickup-interval",[[5,"5 分鐘"],[10,"10 分鐘"],[15,"15 分鐘"],[20,"20 分鐘"],[30,"30 分鐘"],[60,"60 分鐘"]],s.interval_minutes)+'</div>'+
   '<div>'+field("每時段最多接單數","pickup-capacity",s.slot_capacity||5,"number",'min="1" max="300"')+
   field("至少提前幾分鐘下單","pickup-notice",s.min_notice_minutes??20,"number",'min="0" max="1440"')+
   field("可提前預訂天數（0～30）","pickup-days",s.days_ahead??7,"number",'min="0" max="30"')+'</div></div>'+
   field("預估製作時間（分鐘）","pickup-prep",s.prep_minutes??20,"number",'min="1" max="180"')+
   '<p class="small">例如 08:00 取餐、預估製作 20 分鐘，需到 07:40 才可點「開始製作」；05:30 取餐的訂單不受影響。既有訂單的取餐時間不會因設定變更而被修改。</p>'+
   '<div class="staff-actionbar">'+btn("儲存取餐設定","pickup-save","primary")+'</div>')+
   '<div class="inset" style="margin-top:12px"><strong>點餐連結</strong><p class="small">服務啟用後，可把下方網址提供給顧客。</p>'+
   (s.enabled?'<p style="overflow-wrap:anywhere"><a target="_blank" rel="noopener noreferrer" href="'+esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'">'+
   esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'</a></p>':'<p class="muted">尚未開放線上點餐</p>')+'</div>');
}

export function renderCustomerPickup(){
 const d=pickupState.customer;
 if(!d)return box("線上點餐",'<p class="muted">正在讀取店家菜單，若持續無法載入請重新整理。</p>');
 const s=d.settings||{};
 if(!s.enabled)return box("尚未開放線上點餐",'<p>店家目前尚未啟用此功能。</p>');
 const immediate=pickupState.method==="immediate";
 const total=(d.items||[]).reduce((sum,x)=>sum+Number(x.price||0)*(pickupState.cart[x.id]||0),0);
 const count=Object.values(pickupState.cart).reduce((a,b)=>a+b,0);
 const orderCards=(d.orders||[]).map(o=>
  '<div class="inset" style="margin-top:10px"><div class="listline"><strong>'+esc(o.number)+'</strong><span>'+esc(statusText[o.status]||o.status)+'</span></div>'+
  '<p class="small">取餐：'+esc(o.pickup_at)+(o.scheduled?"（預約）":"（即時）")+'</p>'+
  '<p>'+lines(o)+'</p><p><strong>'+money(o.total)+'</strong></p>'+
  (["NEW","ACCEPTED"].includes(o.status)?btn("取消這筆訂單","pickup-cancel","outline",'data-id="'+esc(o.id)+'"'):"")+'</div>').join("");
 const available=(d.slots||[]).filter(x=>x.left>0);
 return box("線上點餐",
  '<p class="muted">直接使用本店上架菜單，送出後可在此追蹤接單、製餐、可取餐與已取餐進度。</p>'+
  (s.schedule_mode==="OPTIONAL"?'<div class="staff-actionbar">'+
   btn("立即取餐","pickup-method",immediate?"primary":"outline",'data-value="immediate"')+
   btn("預約指定時間","pickup-method",!immediate?"primary":"outline",'data-value="scheduled"')+'</div>':"")+
  (immediate?'<p class="notice">預估製作時間約 '+esc(s.prep_minutes)+' 分鐘，實際以店家接單進度為準。</p>':
   '<div class="grid"><div>'+field("取餐日期","pickup-day",pickupState.day||taipei(),"date",'min="'+taipei()+'"')+
   '</div><div><label for="pickup-slot">取餐時間</label><select class="field" id="pickup-slot"><option value="">請選擇取餐時間</option>'+
   available.map(x=>'<option value="'+esc(x.time)+'" '+(pickupState.slot===x.time?"selected":"")+'>'+esc(x.time)+'（剩 '+esc(x.left)+' 單）</option>').join("")+
   '</select></div></div>'+
   (available.length?"":'<p class="alert">本日沒有可預約時段，請更換日期或稍後再試。</p>'))+
  '<h3 style="margin:18px 0 10px">選擇餐點</h3>'+
  (d.items||[]).map(i=>'<div class="listline" style="align-items:center;gap:10px"><div style="flex:1;min-width:0"><strong>'+esc(i.name)+'</strong>'+
   '<p class="small">'+esc(i.description||"")+'</p><strong>'+money(i.price)+'</strong></div>'+
   '<div class="staff-actionbar">'+btn("－","pickup-qty","outline",'data-id="'+esc(i.id)+'" data-delta="-1" aria-label="減少 '+esc(i.name)+'"')+
   '<strong>'+esc(pickupState.cart[i.id]||0)+'</strong>'+
   btn("＋","pickup-qty","outline",'data-id="'+esc(i.id)+'" data-delta="1" aria-label="增加 '+esc(i.name)+'"')+'</div></div>').join("")+
  '<div style="margin-top:12px">'+field("給店家的備註（最多 200 字）","pickup-note",pickupState.note,"text",'maxlength="200" placeholder="例如：不要加辣"')+'</div>'+
  '<div class="listline"><strong>共 '+esc(count)+' 份</strong><strong>'+money(total)+'</strong></div>'+
  '<p class="small">此處僅建立訂單，不會線上收款；請依店家現場方式結帳。</p>'+
  btn("確認送出訂單","pickup-submit","primary full",(!count||(!immediate&&!pickupState.slot))?"disabled":"")+
  (d.orders?.length?'<h3 style="margin:20px 0 8px">我的取餐進度</h3>'+orderCards:
    '<p class="small">還沒有取餐訂單。</p>'));
}

export function renderStaffPickup(){
 const d=pickupState.staff;
 if(!d)return box("取餐訂單",'<p class="muted">目前無法讀取取餐訂單，請重新整理。</p>');
 if(!d.settings?.enabled)return box("取餐訂單",'<p>尚未啟用線上點餐。請在「設定 → 線上點餐」開放服務。</p>');
 const orders=d.orders||[],active=orders.filter(o=>!["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const history=orders.filter(o=>["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const action=(o,label,status,disabled=false)=>btn(label,"pickup-status","outline",'data-id="'+esc(o.id)+'" data-status="'+status+'" data-expected="'+esc(o.status)+'"'+(disabled?' disabled title="尚未到建議製作時間"':''));
 const card=o=>'<div class="inset" style="margin:0 0 12px;padding:14px"><div class="listline"><strong>'+esc(o.number)+'</strong><strong>'+esc(statusText[o.status]||o.status)+'</strong></div>'+
  '<p class="small"><strong>約定取餐 '+esc(o.pickup_at)+'</strong> '+(o.scheduled?"（指定時間）":"（立即）")+'</p>'+
  '<p class="small">建議開始製作：'+esc(o.prepare_at)+(o.can_prepare?"":" — 尚未到製作時間")+'</p>'+
  '<p>'+lines(o)+'</p><p class="small">'+(o.note?"備註："+esc(o.note):"無備註")+' ・ '+money(o.total)+'</p>'+
  '<div class="staff-actionbar">'+(o.status==="NEW"?action(o,"接單","ACCEPTED")+action(o,"拒單","REJECTED"):
  o.status==="ACCEPTED"?action(o,"開始製作","PREPARING",!o.can_prepare)+action(o,"取消","CANCELLED"):
  o.status==="PREPARING"?action(o,"完成，可取餐","READY")+action(o,"取消","CANCELLED"):
  o.status==="READY"?action(o,"已取餐","PICKED_UP")+action(o,"返回製作中","PREPARING"):
  o.status==="PICKED_UP"?action(o,"恢復可取餐","READY"):"")+'</div></div>';
 return box("取餐訂單管理",'<p class="small">依約定取餐時間排序。完成製餐後按「完成，可取餐」，顧客的進度會即時更新。</p>'+
  '<p><strong>待處理 '+active.length+' 筆</strong></p>'+
  (active.length?active.map(card).join(""):'<p class="muted">目前沒有待處理訂單。</p>')+
  '<details><summary>已結束的訂單（'+history.length+'）</summary><div style="margin-top:10px">'+
  (history.length?history.map(card).join(""):'<p>尚無已結束訂單。</p>')+'</div></details>');
}

export async function handlePickupAction(ev,b,a,id){
 if(!a.startsWith("pickup-"))return false;
 if(a==="pickup-method"){
   pickupState.method=b.dataset.value==="immediate"?"immediate":"scheduled";render();return true;
 }
 if(a==="pickup-qty"){
   const menu=pickupState.customer?.items||[];
   if(!menu.some(x=>x.id===id))return true;
   const qty=Math.max(0,Math.min(20,(pickupState.cart[id]||0)+Number(b.dataset.delta||0)));
   if(qty)pickupState.cart[id]=qty;else delete pickupState.cart[id];
   pickupState.requestId="";render();return true;
 }
 if(a==="pickup-save"){
   await act(async()=>{
     await rpc("so_pickup_save_settings",{p_slug:routeState.slug,
       p_enabled:!!routeState.$("pickup-enabled")?.checked,p_mode:routeState.$("pickup-mode")?.value,
       p_start:routeState.$("pickup-start")?.value,p_end:routeState.$("pickup-end")?.value,
       p_interval:Number(routeState.$("pickup-interval")?.value),
       p_capacity:Number(routeState.$("pickup-capacity")?.value),
       p_notice:Number(routeState.$("pickup-notice")?.value),
       p_days:Number(routeState.$("pickup-days")?.value),
       p_prep:Number(routeState.$("pickup-prep")?.value)});
     pickupState.customer=null;return "取餐服務與時段容量設定已儲存";
   });return true;
 }
 if(a==="pickup-submit"){
   const items=Object.entries(pickupState.cart).filter(([,qty])=>qty>0).map(([itemId,qty])=>({id:itemId,qty}));
   if(!items.length)return true;
   if(pickupState.method!=="immediate"&&!pickupState.slot)return true;
   try{if(!pickupState.requestId)pickupState.requestId=uuid();}catch(e){window.alert(e.message);return true;}
   await act(async()=>{
     const res=await rpc("so_pickup_place",{p_slug:routeState.slug,
       p_date:pickupState.method==="immediate"?null:pickupState.day,
       p_time:pickupState.method==="immediate"?null:pickupState.slot,
       p_items:items,p_note:pickupState.note,p_request_id:pickupState.requestId,
       p_immediate:pickupState.method==="immediate"});
     pickupState.cart={};pickupState.note="";pickupState.requestId="";
     return "訂單 "+res.number+" 已送出，請在我的取餐進度查看店家接單狀態";
   });return true;
 }
 if(a==="pickup-status"){
   if(!id)return true;
   const desired=b.dataset.status,expected=b.dataset.expected;
   if(["REJECTED","CANCELLED"].includes(desired)&&!confirm("確定要取消或拒絕這筆訂單？"))return true;
   await act(async()=>{
     await rpc("so_pickup_update",{p_slug:routeState.slug,p_order_id:id,p_expected:expected,p_status:desired});
     return "訂單狀態已更新為："+(statusText[desired]||desired);
   });return true;
 }
 if(a==="pickup-cancel"){
   if(!id||!confirm("確定取消這筆尚未製作的訂單？"))return true;
   await act(async()=>{
     await rpc("so_pickup_cancel",{p_slug:routeState.slug,p_order_id:id});
     return "已取消訂單";
   });return true;
 }
 return true;
}

export function initializePickupMode(){
 pickupState.day=taipei();
 document.addEventListener("input",ev=>{
  if(ev.target?.id==="pickup-note"){pickupState.note=ev.target.value;pickupState.requestId="";}
 });
 document.addEventListener("change",async ev=>{
  if(ev.target?.id==="pickup-day"){
   pickupState.day=ev.target.value;pickupState.slot="";pickupState.requestId="";
   try{
     pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});
     render();
   }catch(err){window.alert(err.message);}
  }
  if(ev.target?.id==="pickup-slot"){pickupState.slot=ev.target.value;pickupState.requestId="";render();}
 });
}
