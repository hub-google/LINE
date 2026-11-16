import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=read("../supabase/migrations/20261116101000_qm_confirmed_queue_near_and_cross_store_history.sql");
const directory=read("../saas/assets/directory/main.js");
const pickup=read("../saas/app/pickup-mode.js");

test("Q01: queue near-alert enqueue and send-time checks use the same unit/session/round",()=>{
  assert.match(migration,/so_queue_enqueue_near_alerts\(\)/);
  assert.match(migration,/so_queue_near_alert_eligibility\(p_ticket_id uuid\)/);
  for(const column of ["service_unit_id","service_session_id","queue_session_code"]){
    const expr="ahead."+column+" is not distinct from k."+column;
    assert.equal(migration.split(expr).length-1,2,expr+" should appear in both checks");
  }
  assert.match(migration,/ahead\.status='WAITING'/);
  assert.match(migration,/k\.queue_near_alert_threshold in \(3,5\)/);
});

test("B02: LINE-verified cross-store history uses bounded per-category incremental pages",()=>{
  assert.match(migration,/so_my_platform_records_page\(p_kind text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50\)/);
  assert.match(migration,/limit least\(greatest\(coalesce\(p_limit,50\),1\),100\) offset greatest\(coalesce\(p_offset,0\),0\)/);
  assert.match(directory,/async function loadMoreHistory\(kind\)/);
  assert.match(directory,/historyHasMore\[kind\]/);
  assert.match(directory,/data-history-more/);
  assert.match(directory,/p_offset:offset,p_limit:historyPageSize\+1/);
});

test("B03: verified historical records are available from formerly active merchants",()=>{
  // The migration rewrites both compatible legacy and new paginated functions.
  const historySource=migration.slice(migration.indexOf("FUNCTION public.so_my_platform_records("));
  assert.doesNotMatch(historySource,/t\.status='ACTIVE'/);
  assert.match(historySource,/public\.qm_line_links/);
  assert.match(historySource,/verified_subjects/);
  assert.match(historySource,/auth\.uid\(\)/);
  assert.match(migration,/grant execute on function public\.so_my_platform_records_page\(text,integer,integer\) to authenticated/);
});

test("O04: active pickup orders stay on the active worklist, history defaults to closed",()=>{
 assert.match(pickup,/historyFilter:"closed"/);
 assert.match(pickup,/const history=orders\.filter\(o=>\["PICKED_UP","REJECTED","CANCELLED"\]\.includes\(o\.status\)\)/);
 assert.match(pickup,/choose\("all","全部"\)/);
});
