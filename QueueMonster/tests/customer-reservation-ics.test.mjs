import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
import {runInNewContext} from "node:vm";

const begin=app.indexOf("function escapeIcsText(");
const end=app.indexOf("function downloadReservationIcs(");
assert.ok(begin>=0&&end>begin,"ICS functions must be defined");
const {reservationToIcs,escapeIcsText,foldIcsLine}=runInNewContext(app.slice(begin,end)+
 "\n ({reservationToIcs,escapeIcsText,foldIcsLine})",
 {Date,Intl,Number,String,TextEncoder,Array,Error});
const booking={id:"12345678-1234-4123-8123-123456789abc",day:"2026-11-04",time:"14:30",
 party:2,number:"美1",status:"CONFIRMED",selected_items:[{name:"理髮"}]};

test("single reservation export converts Taipei local appointment to real UTC ICS calendar event",()=>{
 const ics=reservationToIcs(booking,{name:"測試門市",slot_minutes:30,address:"臺北市"}, "2026-11-04T04:10:20.000Z");
 assert.match(ics,/BEGIN:VCALENDAR\r\nVERSION:2\.0/);
 assert.match(ics,/UID:12345678-1234-4123-8123-123456789abc@hub-google\.github\.io/);
 assert.match(ics,/DTSTAMP:20261104T041020Z/);
 assert.match(ics,/DTSTART:20261104T063000Z/);
 assert.match(ics,/DTEND:20261104T070000Z/);
 assert.match(ics,/SUMMARY:測試門市 預約/);
 assert.match(ics,/LOCATION:臺北市/);
 assert.match(ics,/STATUS:CONFIRMED/);
 assert.match(ics,/END:VCALENDAR\r\n$/);
});

test("ICS strings are escaped and UTF-8 lines are folded at 75 bytes",()=>{
 assert.equal(escapeIcsText("你好;下一項,完成\n換行\\文字"),
  "你好\\;下一項\\,完成\\n換行\\\\文字");
 const contents=reservationToIcs({...booking,selected_items:[{name:"服務專案".repeat(50)}]},
  {name:"台北市".repeat(30),slot_minutes:60,address:"中山區".repeat(40)});
 for(const line of contents.split("\r\n")){
  assert.ok(new TextEncoder().encode(line).length<=75,"ICS line has more than 75 bytes");
 }
 assert.match(contents,/DTEND:20261104T073000Z/);
});

test("no ICS is created for cancelled bookings, malformed date or foreign record",()=>{
 assert.throws(()=>reservationToIcs({...booking,status:"CANCELLED"},{}),/不能加入/);
 assert.throws(()=>reservationToIcs({...booking,day:"2026-02-30"},{}),/無效/);
 assert.throws(()=>reservationToIcs({...booking,id:"another-user"},{}),/識別碼/);
 assert.match(app,/if\(view!=="customer"\|\|lineLinkStatus!=="linked"\)/);
 assert.match(app,/\(customer\?\.my_reservations\|\|\[\]\)\.find\(x=>x\.id===bookingId\)/);
 assert.match(app,/if\(a==="booking-ics"\)\{downloadReservationIcs\(id\);return true;\}/);
 assert.match(app,/加入行事曆（ICS）/);
 assert.match(app,/改期或取消不會自動同步/);
 assert.match(app,/type:"text\/calendar;charset=utf-8"/);
});
