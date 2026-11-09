import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
const sql=readFileSync(new URL("../supabase/migrations/20261104_queue_selected_call_audit.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("K10: selected call requires tenant management permission and verified pending ticket",()=>{
  assert.match(sql,/private\.so_role\(t\.id\)/);
  assert.match(sql,/not in \('OWNER','MANAGER'\)/);
  assert.match(sql,/ticket_id uuid/);
  assert.match(sql,/id=p_ticket_id and deleted_at is null and status='WAITING'/);
  assert.match(sql,/for update;/);
});
test("K10: selected call protects an ongoing call and keeps LINE event correlation",()=>{
  assert.match(sql,/status in \('CALLED','ARRIVED','ADMITTED','SERVING'\)/);
  assert.match(sql,/line_call_event_id=gen_random_uuid\(\)/);
  assert.match(sql,/'line_call_event_id',k\.line_call_event_id/);
  assert.match(ui,/notifyLineCalled\(result\.number,result\.ticket_id,result\.line_call_event_id\)/);
});
test("K10: manager enters a reason stored in append-only audit",()=>{
  assert.match(sql,/char_length\(v_reason\)<2/);
  assert.match(sql,/char_length\(v_reason\)>200/);
  assert.match(sql,/'call_selected'/);
  assert.match(sql,/'reason',v_reason/);
  assert.match(ui,/if\(a==="call-selected"\)/);
  assert.match(ui,/window\.prompt\("指定叫號原因/);
});
test("K10: selected call does not reset serials or create reservations",()=>{
  assert.doesNotMatch(sql,/\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\.so_reservations\b/i);
  assert.doesNotMatch(sql,/\bset\s+ticket_no\s*=/i);
});
