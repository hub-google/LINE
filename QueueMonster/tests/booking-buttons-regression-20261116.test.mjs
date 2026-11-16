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
