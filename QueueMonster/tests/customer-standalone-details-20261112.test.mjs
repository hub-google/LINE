import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const uuid="29d38151-251e-44d8-908f-5fdb393424c0";
const other="29d38151-251e-44d8-908f-5fdb393424c1";

function harness(){
 const routeState={view:"customer",slug:"qa-tenant",customerTab:"detail",detailKind:"reservation",detailId:uuid};
 const customerState={customer:{tenant:{name:"測試1"},
  my_reservations:[{id:uuid,number:"A102",day:"2026-11-15",time:"10:00",party:2,status:"CONFIRMED",name:"測試使用者",phone:"0912345678"}],
  my_tickets:[]}};
 const crossStoreState={customerActivity:{reservations:[],tickets:[],orders:[]}};
 const pickupState={customerHistory:{orders:[]},customer:null};
 const bookingState={manageKind:"",manageItem:"",manageMode:"view"};
 const location={href:"https://hub-google.github.io/LINE/booking/?view=customer&merchant=qa-tenant&tab=mine"};
 const URLs=[];
 const history={pushState(_a,_b,url){URLs.push(url);location.href=new URL(url,location.href).href},
                replaceState(_a,_b,url){URLs.push(url);location.href=new URL(url,location.href).href}};
 const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
 const btn=(label,act,style="",attrs="")=>'<button data-act="'+act+'" '+attrs+'>'+esc(label)+'</button>';
 const box=(label,inner)=>'<section><h2>'+label+'</h2>'+inner+'</section>';
 const jsStatus=status=>({CONFIRMED:"已預約",CHECKED_IN:"已報到",COMPLETED:"已完成",CANCELLED:"已取消"})[status]||status;
 const status=s=>({NEW:"待店家接單",READY:"已完成待取",CANCELLED:"已取消"})[s]||s;
 const source=read("saas/app/customer-detail.js")
  .replace(/^import .*;\s*$/gm,"")
  .replace(/\bexport function\b/g,"function");
 const exports=new Function("bookingState","customerState","crossStoreState","routeState","sharedUiState","pickupState","pickupStatusLabel","editBookingForm","box","btn","esc","formatTaipeiCreated","jsStatus","selectedItemsHtml","history","location",source+"\nreturn {renderCustomerDetail,selectCustomerDetail,returnToCustomerHistory};")(
  bookingState,customerState,crossStoreState,routeState,{},pickupState,status,()=>"",box,btn,esc,()=>"",jsStatus,()=>"",history,location);
 return {...exports,routeState,customerState,crossStoreState,pickupState,history,location,URLs};
}

test("one reservation result screen confirms success with correct edit/cancel actions",()=>{
 const h=harness();
 const html=h.renderCustomerDetail();
 assert.match(html,/測試1/);
 assert.match(html,/預約成功/);
 assert.match(html,/A102/);
 assert.match(html,/2026-11-15/);
 assert.match(html,/10:00/);
 assert.match(html,/修改預約日期／人數/);
 assert.match(html,/修改姓名／電話/);
 assert.match(html,/取消預約/);
 assert.doesNotMatch(html,/取餐訂單管理/);
 h.customerState.customer.my_reservations[0].status="CANCELLED";
 const cancelled=h.renderCustomerDetail();
 assert.match(cancelled,/預約已取消/);
 assert.doesNotMatch(cancelled,/data-act="cancel-my-book"/);
});

test("one pickup order screen shows its own 15-second cancel and real status",()=>{
 const h=harness();h.routeState.detailKind="order";
 h.pickupState.customerHistory.orders=[{id:uuid,number:"P0012",status:"NEW",pickup_at:"2026-11-15 08:00",scheduled:true,total:110,created_at:new Date().toISOString(),items:[{name:"蛋餅",qty:2}]}];
 let html=h.renderCustomerDetail();
 assert.match(html,/訂單已送出/);
 assert.match(html,/P0012/);
 assert.match(html,/pickup-grace-seconds/);
 assert.match(html,/取消訂單/);
 assert.match(html,/蛋餅/);
 h.pickupState.customerHistory.orders[0].status="READY";
 html=h.renderCustomerDetail();
 assert.match(html,/餐點已完成待取/);
 assert.doesNotMatch(html,/data-act="pickup-cancel"/);
});

test("a foreign record ID is not accepted without a user-scoped record",()=>{
 const h=harness();h.routeState.detailId=other;
 assert.match(h.renderCustomerDetail(),/查無預約紀錄/);
 h.routeState.detailKind="order";
 assert.match(h.renderCustomerDetail(),/目前還無法取得這筆訂單/);
});

test("deep link includes identity-scoped record and back to history clears it",()=>{
 const h=harness();
 assert.ok(h.selectCustomerDetail("order",uuid));
 assert.equal(h.routeState.customerTab,"detail");
 assert.match(h.URLs.at(-1),/tab=detail/);
 assert.match(h.URLs.at(-1),/kind=order/);
 assert.match(h.URLs.at(-1),/item=29d38151/);
 h.returnToCustomerHistory();
 assert.equal(h.routeState.customerTab,"mine");
 assert.match(h.URLs.at(-1),/tab=mine/);
 assert.doesNotMatch(h.URLs.at(-1),/[?&]item=/);
 assert.equal(h.selectCustomerDetail("reservation","bad"),false);
});

test("all three successful customer flows navigate to a single detail/queue board",()=>{
 const book=read("saas/app/actions/booking-submit.js");
 const units=read("saas/app/actions/service-unit-actions.js");
 const orders=read("saas/app/pickup-mode.js");
 const queue=read("saas/app/actions/cross-store-actions.js");
 const history=read("saas/app/cross-store.js");
 const portal=read("saas/app/customer-booking.js");
 const router=read("saas/app/route-state.js");
 assert.match(book,/selectCustomerDetail\("reservation",result\.id\)/);
 assert.match(units,/selectCustomerDetail\("reservation",result\.id\)/);
 assert.match(units,/queueState\.progressTicketId=result\.id;routeState\.customerTab="progress"/);
 assert.match(orders,/selectCustomerDetail\("order",res\.id\)/);
 assert.match(queue,/queueState\.progressTicketId=result\.id/);
 assert.match(history,/customer-history-entry/);
 assert.match(history,/open-cross-order/);
 assert.match(portal,/nav\("歷史紀錄"/);
 assert.match(portal,/renderCustomerDetail\(\)/);
 assert.match(router,/"detail"/);
 assert.match(read("saas/app/line-session.js"),/routeState\.customerTab==="detail"/);
});
