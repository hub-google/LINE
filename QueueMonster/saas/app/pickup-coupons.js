
import {routeState} from "./state/routeState.js";
import {rpc,act} from "./data-loading.js";
import {box,btn,esc,field} from "./shared-ui.js";
import {render} from "./staff-layout.js";

export const couponState={code:"",preview:null,admin:[],edit:null};
const money=x=>"NT$ "+Number(x||0).toLocaleString("zh-TW");
export async function loadCouponAdmin(){
 try{couponState.admin=await rpc("so_pickup_coupon_admin",{p_slug:routeState.slug});}
 catch(error){couponState.admin=[];console.warn("優惠碼管理暫時無法讀取",error);}
}
export function renderCouponCustomer(total,groupId=""){
 if(groupId)return '<p class="small">團體訂餐由主揪統一結帳，目前優惠碼僅適用個人訂餐。</p>';
 const valid=couponState.preview&&couponState.preview.cartAmount===total&&couponState.preview.code===couponState.code.trim().toUpperCase();
 return '<div class="inset" style="margin:12px 0">'+
 '<strong>店家優惠碼（選填）</strong>'+
 '<div class="staff-actionbar"><input class="field" id="pickup-coupon-code" aria-label="優惠碼" maxlength="24" placeholder="輸入店家優惠碼" value="'+esc(couponState.code)+'">'+
 btn("套用優惠碼","pickup-coupon-preview","outline")+'</div>'+
 (valid?'<p class="notice">優惠折抵 '+money(couponState.preview.discount)+'，預計應付 '+money(couponState.preview.estimated_payable)+'</p>':
 (couponState.code?'<p class="small">確認優惠碼後才會套用折抵；修改餐點需要重新確認。</p>':''))+
 '<p class="small">優惠金額由店家設定，下單時重新確認是否符合門檻、次數與有效期限；實際付款仍依店家現場方式。</p></div>';
}
export function renderCouponAdmin(){
 const e=couponState.edit||{};
 const rows=(couponState.admin||[]).map(c=>'<tr><td><strong>'+esc(c.code)+'</strong></td><td>'+money(c.discount)+
 '</td><td>'+money(c.minimum)+'</td><td>'+esc(c.uses)+' / '+esc(c.max_uses)+'</td><td>'+
 esc(c.ends_at)+'</td><td>'+esc(c.active?'啟用':'已停用')+'</td><td>'+
 btn("編輯","pickup-coupon-edit","outline",'data-code="'+esc(c.code)+'"')+'</td></tr>').join("");
 return box("本店熟客優惠碼",
 '<p class="small">可發給熟客的店家專屬折價碼。每位顧客同一碼最多使用一次，店家可設定折抵金額、最低消費、總使用次數及有效期限。不含線上收款。</p>'+
 (rows?'<div class="scroll"><table class="rows"><thead><tr><th>優惠碼</th><th>折抵</th><th>低消</th><th>使用次數</th><th>到期日</th><th>狀態</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':
 '<p class="small">目前還沒有建立優惠碼。</p>')+
 '<div class="grid"><div>'+field("優惠碼（英數或 -，4～24 碼）","pickup-coupon-admin-code",e.code||"","text",'maxlength="24" placeholder="WELCOME50"')+
 field("折抵金額（NT$）","pickup-coupon-discount",e.discount??50,"number",'min="1" max="10000"')+
 field("最低消費門檻（NT$）","pickup-coupon-minimum",e.minimum??100,"number",'min="0" max="100000"')+'</div><div>'+
 field("最多使用次數（所有顧客合計）","pickup-coupon-max",e.max_uses??100,"number",'min="1" max="100000"')+
 field("優惠截止日期","pickup-coupon-expiry",e.ends_at||"","date")+
 '<label class="checklist"><input type="checkbox" id="pickup-coupon-active" '+(e.active===false?'':'checked')+'> 開放使用</label></div></div>'+
 '<div class="staff-actionbar">'+btn("儲存優惠碼","pickup-coupon-save","primary")+
 (couponState.edit?btn("取消編輯","pickup-coupon-clear","outline"):'')+'</div>');
}
export function initializeCouponInputs(onChange=()=>{}){
 document.addEventListener("input",event=>{
  if(event.target?.id==="pickup-coupon-code"){
   couponState.code=event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,24);
   event.target.value=couponState.code;
   couponState.preview=null;onChange();
  }
 });
}
export async function handleCouponAction(action,button,total){
 if(!action.startsWith("pickup-coupon-"))return false;
 if(action==="pickup-coupon-clear"){couponState.edit=null;render();return true;}
 if(action==="pickup-coupon-edit"){
   const code=button.dataset.code;
   couponState.edit=(couponState.admin||[]).find(x=>x.code===code)||null;
   render();return true;
 }
 if(action==="pickup-coupon-preview"){
   const code=(couponState.code||"").trim().toUpperCase();
   if(!code){window.alert("請先輸入店家優惠碼");return true;}
   await act(async()=>{
     const result=await rpc("so_pickup_coupon_preview",{p_slug:routeState.slug,p_code:code,p_estimated_total:total});
     couponState.preview={...result,cartAmount:total};
     return "優惠碼已確認：折抵 "+money(result.discount);
   });return true;
 }
 if(action==="pickup-coupon-save"){
   const value=id=>document.getElementById(id)?.value?.trim()||"";
   const code=value("pickup-coupon-admin-code").toUpperCase();
   const discount=Number(value("pickup-coupon-discount")),minimum=Number(value("pickup-coupon-minimum"));
   const max=Number(value("pickup-coupon-max"));
   const date=value("pickup-coupon-expiry");
   const ends=date?new Date(date+"T23:59:59+08:00"):null;
   if(!/^[A-Z0-9-]{4,24}$/.test(code)||!Number.isFinite(discount)||discount<=0||
     !Number.isFinite(minimum)||minimum<0||!Number.isInteger(max)||max<1||
     !ends||!Number.isFinite(ends.valueOf())||ends<=new Date()){
       window.alert("請確認優惠碼格式、折抵金額、最低消費、次數與到期日");return true;
   }
   await act(async()=>{
     await rpc("so_pickup_coupon_save",{p_slug:routeState.slug,p_code:code,
       p_discount:discount,p_minimum:minimum,p_max_uses:max,p_ends_at:ends.toISOString(),
       p_active:!!document.getElementById("pickup-coupon-active")?.checked});
     couponState.edit=null;await loadCouponAdmin();
     return "優惠碼 "+code+" 已儲存";
   });return true;
 }
 return false;
}
