// One verified customer record per screen. Keep existing reservation, queue and pickup RPCs.
// This module never fetches a record by a bare unverified user-provided ID.
import {bookingState} from "./state/bookingState.js";
import {customerState} from "./state/customerState.js";
import {crossStoreState} from "./state/crossStoreState.js";
import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";
import {pickupState,pickupStatusLabel} from "./pickup-mode.js";
import {editBookingForm} from "./booking-edit.js";
import {box,btn,esc,formatTaipeiCreated,jsStatus,selectedItemsHtml} from "./shared-ui.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES=new Set(["reservation","order"]);

function writeDetailUrl(replace=false){
 const u=new URL(location.href);
 u.searchParams.set("view","customer");
 if(routeState.slug)u.searchParams.set("merchant",routeState.slug);
 u.searchParams.set("tab","detail");
 u.searchParams.set("kind",routeState.detailKind);
 u.searchParams.set("item",routeState.detailId);
 u.searchParams.delete("ticket");
 u.searchParams.delete("manage");
 u.searchParams.delete("mode");
 // Preserve the existing LIFF URL path; use history navigation without a second login.
 history[replace?"replaceState":"pushState"](null,"",u.pathname+u.search+u.hash);
}
export function selectCustomerDetail(kind,id,replace=false){
 if(!TYPES.has(kind)||!UUID.test(String(id||"")))return false;
 routeState.detailKind=kind;
 routeState.detailId=id;
 routeState.customerTab="detail";
 bookingState.manageKind="";
 bookingState.manageItem="";
 bookingState.manageMode="view";
 writeDetailUrl(replace);
 return true;
}
export function returnToCustomerHistory(){
 routeState.customerTab="mine";
 routeState.detailId="";
 routeState.detailKind="";
 bookingState.manageKind="";
 bookingState.manageItem="";
 bookingState.manageMode="view";
 const u=new URL(location.href);
 u.searchParams.set("tab","mine");
 for(const key of ["kind","item","mode","manage","ticket"])u.searchParams.delete(key);
 history.pushState(null,"",u.pathname+u.search+u.hash);
}
const back=()=>'<div class="customer-detail-back">'+btn("返回歷史紀錄","detail-history","outline")+'</div>';
const meta=(label,value)=>'<div class="customer-detail-field"><span>'+esc(label)+'</span><strong>'+esc(value||"—")+'</strong></div>';
const heading=(title,merchant,number,sub)=>'<div class="customer-detail-heading">'+
 '<span class="customer-detail-kicker">'+esc(merchant||"店家")+'・專屬紀錄</span>'+
 '<h2>'+esc(title)+'</h2>'+
 (number?'<strong class="customer-detail-reference">'+esc(number)+'</strong>':"")+
 (sub?'<p>'+esc(sub)+'</p>':"")+'</div>';
export function renderCustomerDetail(){
 if(!TYPES.has(routeState.detailKind)||!UUID.test(String(routeState.detailId||"")))
  return box("無法開啟紀錄",'<p class="alert">這筆紀錄的連結不正確。</p>'+back());
 const shop=customerState.customer?.tenant?.name||"店家";
 const id=routeState.detailId;
 if(routeState.detailKind==="reservation"){
   const record=(customerState.customer?.my_reservations||[]).find(x=>x.id===id)||
    (crossStoreState.customerActivity?.reservations||[]).find(x=>x.id===id&&x.slug===routeState.slug);
   // The authenticated so_public_state RPC controls which personal records exist.
   if(!record)return box("查無預約紀錄",'<p class="alert">目前帳號找不到這筆店家的預約，請確認使用原本的 LINE 帳號。</p>'+back());
   const confirmed=record.status==="CONFIRMED";
   const message=confirmed?"預約成功":record.status==="CHECKED_IN"?"已完成報到":
     record.status==="COMPLETED"?"預約已完成":record.status==="CANCELLED"?"預約已取消":
     record.status==="NO_SHOW"?"本次預約未到": "預約狀態："+jsStatus(record.status);
   const actions=confirmed?
     '<div class="staff-actionbar customer-detail-actions">'+
       btn("修改預約日期／人數","edit-book","primary",'data-id="'+esc(id)+'"')+
       btn("修改姓名／電話","edit-book-contact","secondary",'data-id="'+esc(id)+'"')+
       btn("取消預約","cancel-my-book","outline",'data-id="'+esc(id)+'"')+'</div>':
     '<p class="small">目前狀態不開放線上修改或取消；如有需要請聯絡店家。</p>';
   return '<section class="card customer-detail-screen" data-customer-detail="reservation">'+back()+
     heading(message,shop,"預約編號 "+(record.number||"—"),confirmed?"預約已成立，請依預約日期與時間前往店家。":"以下為這筆預約的目前狀態。")+
     '<div class="customer-detail-fields">'+
       meta("預約日期",record.day)+meta("預約時間",record.time)+
       meta("預約人數",String(record.party||1)+" 位")+meta("預約姓名",record.name)+
       meta("聯絡電話",record.phone)+meta("預約狀態",jsStatus(record.status))+
     '</div>'+selectedItemsHtml(record.selected_items)+
     actions+(confirmed?'<div class="staff-actionbar customer-detail-secondary">'+
       btn("加入行事曆","booking-ics","outline",'data-id="'+esc(id)+'"')+
       btn("查看／列印預約憑證","booking-receipt","outline",'data-id="'+esc(id)+'"')+'</div>':"")+
     editBookingForm(record)+'</section>';
 }
 // Use the existing user-scoped ordering RPC. A raw order ID is never enough
 // to fetch somebody else's order, and no separate unauthenticated endpoint is added.
 const orders=pickupState.customerHistory?.orders||pickupState.customer?.orders||[];
 const order=orders.find(x=>x.id===id)||
   (crossStoreState.customerActivity?.orders||[]).find(x=>x.id===id&&x.slug===routeState.slug);
 if(!order){
   return box("訂單詳情",'<p class="muted">目前還無法取得這筆訂單的資料；請重新整理，或以原本的 LINE 帳號登入。</p>'+
      btn("重新讀取訂單","detail-refresh","primary")+back());
 }
 const deadline=Date.parse(order.created_at||"")+15000;
 const remaining=Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-Date.now())/1000)):0;
 const canCancel=order.status==="NEW"&&remaining>0;
 const title=order.status==="NEW"?"訂單已送出":order.status==="READY"?"餐點已完成待取":
   ["REJECTED","CANCELLED"].includes(order.status)?"訂單已取消":
   order.status==="PICKED_UP"?"已完成取餐":"訂單"+pickupStatusLabel(order.status);
 const items=(Array.isArray(order.items)?order.items:[]).map(x=>
   '<div class="customer-detail-item"><span>'+esc(x.name||"餐點")+' × '+esc(x.qty||1)+'</span></div>').join("");
 return '<section class="card customer-detail-screen" data-customer-detail="order">'+back()+
   heading(title,shop,"訂單編號 "+(order.number||"—"),canCancel?
     "顧客可於下單後 15 秒內取消，倒數結束才會交給店家。":
     order.status==="NEW"?"已超過顧客自行取消期限，等待店家接單。":"請依目前訂單進度安排取餐。")+
   '<div class="customer-detail-fields">'+meta("取餐時間",order.pickup_at)+
     meta("取餐方式",order.scheduled?"指定時間":"立即取餐")+
     meta("目前狀態",pickupStatusLabel(order.status))+
     meta("訂單金額","NT$ "+Number(order.total||0).toLocaleString("zh-TW"))+'</div>'+
   (items?'<div class="customer-detail-items"><h3>訂購餐點</h3>'+items+'</div>':"")+
   (canCancel?'<div class="customer-order-cancel" data-pickup-grace-until="'+deadline+'">'+
     '<p class="notice">可取消訂單剩餘時間：<strong><span class="pickup-grace-seconds">'+remaining+'</span> 秒</strong></p>'+
     btn("取消訂單","pickup-cancel","outline",'data-id="'+esc(id)+'"')+'</div>':
    order.status==="NEW"?'<p class="small">訂單已送交店家，無法自行取消。若需更改請聯絡店家。</p>':"")+
   '<div class="staff-actionbar">'+btn("重新整理訂單進度","detail-refresh","secondary")+'</div>'+
   '</section>';
}
