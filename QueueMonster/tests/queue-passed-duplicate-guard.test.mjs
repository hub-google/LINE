import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../supabase/migrations/20261113_qm_no_duplicate_passed_ticket.sql",import.meta.url),"utf8");
test("both ticket issuance RPCs count recoverable passed tickets as active",()=>{
  assert.match(src,/CREATE OR REPLACE FUNCTION public\.so_take_number_with_items/);
  assert.match(src,/status in\('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED'\)/);
  assert.match(src,/CREATE OR REPLACE FUNCTION public\.so_unit_take_number/);
  assert.match(src,/k\.status in\('WAITING','CALLED','ARRIVED','ADMITTED','SERVING','HOLD','PASSED'\)/);
  assert.match(src,/FOR UPDATE/i);
  assert.match(src,/line_sub/);
});
