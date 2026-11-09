import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const sql=readFileSync(path.join(root,"supabase/migrations/20261104_staff_reservation_history_search.sql"),"utf8");

test("RPC scopes all reservations by tenant and checks staff / platform authorization",()=>{
 assert.match(sql,/if auth\.uid\(\) is null then/);
 assert.match(sql,/where t\.slug=p_slug and t\.status='ACTIVE'/);
 assert.match(sql,/private\.so_role\(v_tenant_id\) is null and not private\.so_platform\(\)/);
 assert.match(sql,/where r\.tenant_id=v_tenant_id/);
 assert.match(sql,/revoke all on function public\.so_staff_reservation_search\([\s\S]*?from public,anon;/);
 assert.match(sql,/grant execute on function public\.so_staff_reservation_search\([\s\S]*?to authenticated;/);
 assert.doesNotMatch(sql,/truncate\s+|delete\s+from\s+public\.so_reservations|drop\s+table/i);
});

test("RPC searches full history in deterministic server pages, with validated filters",()=>{
 assert.match(sql,/p_search text default ''/);
 assert.match(sql,/p_date_from date default null/);
 assert.match(sql,/p_date_to date default null/);
 assert.match(sql,/p_deleted text default 'active'/);
 assert.match(sql,/p_page_size integer default 25/);
 assert.match(sql,/if v_page<1 or v_page>100000 or v_size<1 or v_size>100 then/);
 assert.match(sql,/if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then/);
 assert.match(sql,/v_status not in \('ALL','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW'\)/);
 assert.match(sql,/v_deleted not in \('active','deleted','all'\)/);
 assert.match(sql,/strpos\(lower\(concat_ws\(/);
 assert.match(sql,/order by booking_date desc, booking_time desc, created_at desc, id desc/);
 assert.match(sql,/limit v_size offset v_offset/);
 assert.match(sql,/select count\(\*\) from filtered/);
 assert.match(sql,/'has_more',v_offset\+v_size<v_total/);
 assert.match(sql,/r\.selected_items::text/);
 assert.match(sql,/r\.reference_code/);
});

test("staff page uses server result, not 500-record client worklist, to search all historic dates",()=>{
 assert.match(app,/function historyBookingResultHtml\(\)/);
 assert.match(app,/async function searchHistoricalBookings\(page=historicalBookingPage\)/);
 assert.match(app,/rpc\("so_staff_reservation_search",\{/);
 assert.match(app,/p_slug:merchant,p_search:historicalBookingQuery/);
 assert.match(app,/p_date_from:historicalBookingStart\|\|null,p_date_to:historicalBookingEnd\|\|null/);
 assert.match(app,/p_status:historicalBookingStatus,p_deleted:historicalBookingDeleted/);
 assert.match(app,/p_page:page,p_page_size:25/);
 assert.match(app,/function staffRender\(\)/);
 assert.match(app,/完整預約歷史/);
 assert.match(app,/if\(a==="historical-search"\)/);
 assert.match(app,/if\(a==="historical-reset"\)/);
 assert.match(app,/if\(a==="historical-prev"\|\|a==="historical-next"\)/);
 assert.match(app,/historicalBookingToken/);
 assert.match(app,/historicalBookingTenant===slug/);
});

test("historical page displays precise total, safe record details and paging controls",()=>{
 const match=app.match(/function historyBookingResultHtml\(\)\{[\s\S]*?\n\}/);
 assert.ok(match,"missing render helper");
 const ctx={
  historicalBookingResult:{total:126,page:2,page_size:25,has_more:true,
   items:[{number:"店4",day:"2026-11-03",time:"12:00",name:"林<TEST>",party:2,
    created_at:"2026-11-03T04:00:07Z",reference_code:"20261103120007000A02C",round:3,
    status:"CONFIRMED",selected_items:[],deleted_at:null}]},
  historicalBookingLoading:false,historicalBookingError:"",
  esc:x=>String(x??"").replaceAll("<","&lt;"),formatTaipeiCreated:x=>String(x),
  selectedItemsHtml:()=>"",tag:s=>s,btn:(label,action,variant,disabled)=>`[${label}:${action}:${disabled||"enabled"}]`,
  Number,Array,Math,String
 };
 const fn=runInNewContext(match[0]+"\nhistoryBookingResultHtml;",ctx);
 const html=fn();
 assert.match(html,/126/);
 assert.match(html,/第 2 \/ 6 頁/);
 assert.match(html,/林&lt;TEST>/);
 assert.match(html,/永久參考碼/);
 assert.match(html,/historical-next/);
 ctx.historicalBookingResult={total:1,page:1,page_size:25,has_more:false,items:[]};
 const first=fn();
 assert.match(first,/沒有符合條件/);
 assert.match(first,/\[下一頁:historical-next:disabled\]/);
});
