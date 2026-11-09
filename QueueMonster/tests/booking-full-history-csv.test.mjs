import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");

test("complete-history CSV escapes spreadsheet formulas, quotes, newlines and controls",()=>{
 const m=app.match(/function safeHistoryCsvCell\(value\)\{[\s\S]*?\n\}/);
 assert.ok(m,"missing CSV hardening helper");
 const fn=runInNewContext(m[0]+"\n safeHistoryCsvCell;",{String});
 assert.equal(fn("=SUM(1,1)"),'"\'=SUM(1,1)"');
 assert.equal(fn("+1"),'"\'+1"');
 assert.equal(fn("-2"),'"\'-2"');
 assert.equal(fn("@X"),'"\'@X"');
 assert.equal(fn('hi"there'),'"hi""there"');
 assert.equal(fn("A\nB"),'"A B"');
 assert.equal(fn("李小姐"),'"李小姐"');
 assert.equal(fn(null),'""');
});

test("full-history export pages through authorized RPC and aborts on changing data",()=>{
 assert.match(app,/async function exportHistoricalBookings\(\)/);
 assert.match(app,/view!=="staff"\|\|staffTab!=="bookings"\|\|!\["OWNER","MANAGER","PLATFORM"\]\.includes\(staff\?\.role\)/);
 assert.match(app,/if\(!Number\.isInteger\(total\)\|\|total<0\|\|total>20000\)/);
 assert.match(app,/const pages=Math\.ceil\(total\/100\)/);
 assert.match(app,/p_page:page,p_page_size:100/);
 assert.match(app,/rpc\("so_staff_reservation_search",\{\.\.\.query/);
 assert.match(app,/Number\(data\?\.total\)!==total/);
 assert.match(app,/if\(ids\.has\(record\.id\)\)throw/);
 assert.match(app,/if\(records\.length!==total\)throw/);
 assert.match(app,/historicalBookingDeleted!=="active"&&!confirm/);
 assert.match(app,/link\.download="LINE_booking_history_"/);
 assert.match(app,/if\(a==="historical-export"\)\{void exportHistoricalBookings\(\);return;\}/);
 assert.match(app,/單次最多匯出 20,000 筆/);
 assert.match(app,/絕不默默截斷/);
});

test("CSV content contains permanent reference, status, service, and deletion flags",()=>{
 const safe=app.match(/function safeHistoryCsvCell\(value\)\{[\s\S]*?\n\}/);
 const maker=app.match(/function historyCsvContent\(items\)\{[\s\S]*?\n\}/);
 assert.ok(safe&&maker);
 const make=runInNewContext(safe[0]+"\n"+maker[0]+"\n historyCsvContent;",{
  String,Array,jsStatus:x=>x,formatTaipeiCreated:x=>x||"無紀錄"
 });
 const csv=make([{day:"2026-11-04",time:"10:30",number:"1",reference_code:"20261104103000000ZZZZ",
  round:2,name:"=HYPERLINK(1)",party:2,status:"CONFIRMED",
  selected_items:[{name:"洗髮"}],created_at:"2026-11-04T02:10:20Z",updated_at:null,deleted_at:null}]);
 assert.match(csv,/永久參考碼/);
 assert.match(csv,/20261104103000000ZZZZ/);
 assert.match(csv,/洗髮/);
 assert.match(csv,/"'=HYPERLINK\(1\)"/);
 assert.ok(csv.startsWith("\uFEFF"));
});
