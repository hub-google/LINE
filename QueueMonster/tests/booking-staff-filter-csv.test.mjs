import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");

test("staff booking filters respect merchant-scoped returned records and exact status/date",()=>{
 const m=app.match(/function staffBookingMatches\(record,[\s\S]*?\n\}/);
 assert.ok(m,"missing pure staff booking filter");
 const filter=runInNewContext(m[0]+"\n staffBookingMatches;",{Date});
 const today="2026-11-04";
 const reservation={day:"2026-11-05",time:"14:30",name:"小王",number:"美2",status:"CONFIRMED",
   selected_items:[{name:"剪髮"}]};
 assert.equal(filter(reservation,"小王","all","all",today),true);
 assert.equal(filter(reservation,"剪髮","all","all",today),true);
 assert.equal(filter(reservation,"美2","all","all",today),true);
 assert.equal(filter(reservation,"未知","all","all",today),false);
 assert.equal(filter(reservation,"","today","all",today),false);
 assert.equal(filter(reservation,"","tomorrow","all",today),true);
 assert.equal(filter(reservation,"","next7","CONFIRMED",today),true);
 assert.equal(filter(reservation,"","next7","CANCELLED",today),false);
 assert.equal(filter({...reservation,day:"2026-11-12"},"","next7","all",today),false);
});

test("staff CSV export is manager-gated and spreadsheet-formula safe",()=>{
 assert.match(app,/if\(a==="export-bookings"\)/);
 assert.match(app,/!\["OWNER","MANAGER","PLATFORM"\]\.includes\(staff\?\.role\)/);
 assert.match(app,/pending_reservations\|\|\[\]\)\.concat\(staff\?\.processed_reservations\|\|\[\],staff\?\.deleted_reservations/);
 assert.match(app,/if\(\/\^\[\\s\]\*\[=\+@-\]\/\.test\(v\)\)v="'"\+v/);
 assert.match(app,/type:"text\/csv;charset=utf-8"/);
 assert.match(app,/目前已載入的資料/);
 assert.match(app,/完整歷史請使用下方「歷史預約查詢」/);
});
