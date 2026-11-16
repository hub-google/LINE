import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=file=>readFileSync(new URL("../saas/app/"+file,import.meta.url),"utf8");
const units=source("service-units.js"), booking=source("customer-booking.js");
const events=source("form-events.js"), list=source("staff-list.js"), clicks=source("click-actions.js");

function extractFunction(source,name){
 const start=source.indexOf("export function "+name+"("),end=source.indexOf("\n}",start);
 assert.ok(start!==-1&&end>start,name+" should be an exported function");
 return source.slice(start,end+2).replace(/^export /,"");
}

test("multi-service booking uses one readiness rule for rendering and input changes",()=>{
 assert.match(units,/export function unitBookingReady\(\)/);
 assert.match(units,/unitBookingReady\(\)\?"":"disabled"/);
 assert.match(booking,/export function syncBookingSubmitButtons\(\)/);
 assert.match(events,/syncBookingSubmitButtons\(\)/);
 assert.match(booking,/button\[data-act="unit-book-review"\],button\[data-act="unit-book-final"\]/);
 assert.match(booking,/unit\.disabled=!unitBookingReady\(\)/);
 assert.match(booking,/if\(bookingState\.bookingParty!==previous\)/);
 assert.match(booking,/data-unit-booking-review/);
});

test("unit booking readiness respects contact, party size and remaining session capacity",()=>{
 const state={bookingParty:2,bookingChosenItems:[]}, customer={customer:{tenant:{menu_booking_mode:"DISABLED"},menu_items:[]}};
 let session={capacity:5,booked:3},contact=true,items=true;
 const ready=new Function("selectedUnitSession","bookingState","validBookingContact","menuChoiceReady","customerState",
   extractFunction(units,"unitBookingReady")+";return unitBookingReady;")(()=>session,state,()=>contact,()=>items,customer);
 assert.equal(ready(),true);
 contact=false;assert.equal(ready(),false);
 contact=true;items=false;assert.equal(ready(),false);
 items=true;state.bookingParty=3;assert.equal(ready(),false);
 state.bookingParty=0;assert.equal(ready(),false);
 state.bookingParty=2;session=null;assert.equal(ready(),false);
});

test("submit button text matches one-step and two-step booking flows",()=>{
 assert.match(units,/confirmationRequired\?"下一步：確認預約":"確定送出預約"/);
 assert.match(units,/confirming\?"unit-book-final":confirmationRequired\?"unit-book-review":"unit-book-final"/);
 assert.match(units,/confirming\?"確認送出預約"/);
});

test("staff lists can finish paging beyond 500 records",()=>{
 assert.doesNotMatch(list,/Math\.min\(500/);
 assert.doesNotMatch(clicks,/Math\.min\(500/);
 assert.match(clicks,/staffVisibleLimits\.set\(key,\(staffViewState\.staffVisibleLimits\.get\(key\)\|\|12\)\+12\)/);
 const state={staffVisibleLimits:new Map([["ticket-open",510]])};
 const page=new Function("staffViewState","btn","esc",
   extractFunction(list,"staffListPage")+";return staffListPage;")(
     state,(label,action,style,attrs)=>'<button data-act="'+action+'" '+attrs+'>'+label+'</button>',v=>String(v));
 const rows=Array.from({length:525},(_,i)=>i);
 const partial=page(rows,"ticket-open",i=>'<i>'+i+'</i>');
 assert.match(partial,/已顯示 510 \/ 525 筆/);
 assert.match(partial,/再顯示 12 筆/);
 state.staffVisibleLimits.set("ticket-open",526);
 const full=page(rows,"ticket-open",i=>'<i>'+i+'</i>');
 assert.match(full,/<i>524<\/i>/);
 assert.doesNotMatch(full,/再顯示 12 筆/);
});


test("all customer and staff sidebar navigation actions repaint immediately and refresh relevant data",async()=>{
 const sourceText=clicks;
 const start=sourceText.indexOf("export function registerClickActions(){");
 const end=sourceText.indexOf("\nexport function initializeClickActions()",start);
 assert.ok(start>=0&&end>start,"real delegated click handler is present");
 const registered=sourceText.slice(start,end).replace(/^export /,"");
 function harness(view){
   const calls=[],urlBase="https://example.invalid/LINE/booking/";
   const location={href:urlBase+"?view="+view+"&merchant=example-shop&tab=detail&kind=reservation&item=00000000-0000-0000-0000-000000000001"};
   const history={
     pushState(_s,_t,path){calls.push("pushState");location.href=new URL(path,location.href).href;},
     replaceState(_s,_t,path){calls.push("replaceState");location.href=new URL(path,location.href).href;}
   };
   let listener;
   const document={addEventListener:(kind,cb)=>{if(kind==="click")listener=cb;}};
   const feedbackState={busy:false,err:"",flash:""};
   const routeState={view,customerTab:"detail",detailKind:"reservation",detailId:"id",day:"2026-11-16"};
   const customerState={customer:{tenant:{modules:{reservation:true,queue:true}}}};
   const staffState={staffTab:"settings",settingsSection:"operations"};
   const queueState={progressTicketId:"ticket"};
   const crossStoreState={crossCurrentStore:true};
   const bookingState={manageKind:"reservation",manageItem:"id",manageMode:"edit"};
   const deps={document,feedbackState,routeState,customerState,staffState,queueState,crossStoreState,bookingState,location,history,
     stopQueueRealtime:()=>calls.push("stopQueueRealtime"),stopCrossQueueRealtime:()=>calls.push("stopCrossQueueRealtime"),
     render:()=>calls.push("render"),load:async()=>{calls.push("load");},
     taipei:()=>"2026-11-16",searchHistoricalBookings:async()=>{calls.push("searchHistoricalBookings");}};
   const install=new Function(...Object.keys(deps),registered+";return registerClickActions;")(...Object.values(deps));
   install();
   return {calls,location,routeState,staffState,bookingState,
      click:async tab=>{
        const button={dataset:{nav:view,tab}};
        const target={closest:selector=>selector==="button"?button:null};
        await listener({target});
      }};
 }
 for(const tab of ["home","reserve","queue","order","mine"]){
   const h=harness("customer");
   await h.click(tab);
   assert.equal(h.routeState.customerTab,tab,tab);
   assert.ok(h.calls.includes("render"),tab+" must render immediately");
   assert.equal(h.calls.includes("load"),tab!=="home",tab+" refresh contract");
   assert.ok(h.calls.includes("stopQueueRealtime"),tab);
   assert.ok(h.calls.includes("stopCrossQueueRealtime"),tab);
   const url=new URL(h.location.href);
   assert.equal(url.searchParams.get("tab"),tab);
   assert.equal(url.searchParams.has("kind"),false);
   assert.equal(url.searchParams.has("item"),false);
   assert.equal(h.bookingState.manageKind,"");
 }
 for(const tab of ["dashboard","queue","members","orders","bookings","calendar","analytics","customers","settings"]){
   const h=harness("staff");
   await h.click(tab);
   assert.equal(h.staffState.staffTab,tab,tab);
   assert.ok(h.calls.includes("render"),tab+" must render immediately");
   assert.ok(h.calls.includes("load"),tab+" must refresh merchant state");
   assert.equal(new URL(h.location.href).searchParams.get("tab"),tab);
   if(tab==="settings")assert.equal(h.staffState.settingsSection,"profile");
   if(tab==="bookings")assert.ok(h.calls.includes("searchHistoricalBookings"));
 }
});

test("headquarters arriving from generic merchant guide can choose a store",()=>{
 const staff=source("staff-view.js");
 assert.match(staff,/const isHeadquarters=!!authState\.context\?\.platform_admin/);
 assert.match(staff,/href="\.\/\?view=platform">前往總部企業列表/);
 assert.match(staff,/選擇要管理的門市/);
});
