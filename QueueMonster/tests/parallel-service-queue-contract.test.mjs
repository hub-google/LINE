import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";

const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const nextCall=read("supabase/migrations/20261111120000_allow_parallel_service_while_calling_next.sql");
const board=read("supabase/migrations/20261111121500_queue_board_latest_called_at_parallel_service.sql");
const queue=read("saas/app/staff/queue.js");
const staffView=read("saas/app/staff-view.js");

test("staff call gate checks only an outstanding CALLED ticket, not other ongoing services",()=>{
  assert.match(nextCall,/status='CALLED'\)\) then raise exception '已有已叫號/);
  assert.match(nextCall,/status='CALLED'\)\)\s+then raise exception '本場次仍有尚未確認/);
  assert.match(nextCall,/if p_status='CALLED' and exists \(/);
  assert.match(nextCall,/if p_status='CALLED' and exists\(/);
  assert.match(nextCall,/other\.status='CALLED'/);
  assert.match(nextCall,/v\.status='CALLED'/);
  assert.match(nextCall,/for update/);
  assert.match(nextCall,/private\.so_role\(t\.id\)/);
  assert.match(nextCall,/line_call_event_id/);
});

test("front-end next call is not disabled for ARRIVED, ADMITTED or SERVING",()=>{
  assert.match(queue,/const active=openTickets\.find\(x=>x\.status==="CALLED"\)/);
  assert.match(queue,/const canCall=!!waiting\.length&&!active/);
  assert.match(staffView,/const active=openTickets\.find\(x=>x\.status==="CALLED"\)/);
  assert.match(queue,/服務中/);
});

test("board tracks most recent actual call, not the last service-status edit",()=>{
  assert.match(board,/last_called_at=now\(\)/);
  assert.match(board,/last_called_at=case when p_status='CALLED' then now\(\)/);
  assert.match(board,/order by k\.last_called_at desc nulls last,k\.updated_at desc/);
});
