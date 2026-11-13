import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../",import.meta.url);
const page=readFileSync(new URL("saas/assets/directory/main.js",base),"utf8");
const menu=readFileSync(new URL("../.github/scripts/publish_rich_menu.py",base),"utf8");
const migration=readFileSync(new URL("supabase/migrations/20261112173500_last_reservation_queue_board.sql",base),"utf8");
test("retired last-booking board is not in official menu or personal record UI",()=>{
  assert.doesNotMatch(menu,/上次預約看板/);
  assert.doesNotMatch(menu,/mode=mine&section=board/);
  assert.doesNotMatch(page,/sb\\.rpc\\("so_my_last_booking_board"\\)/);
  assert.match(page,/const recordKind=/);
  assert.match(page,/so_my_platform_records/);
});
test("last-booked-store lookup never trusts a supplied customer ID",()=>{
  assert.match(migration,/public\.qm_platform_line_identities/);
  assert.match(migration,/public\.qm_line_links/);
  assert.match(migration,/public\.qm_reservations/);
  assert.match(migration,/auth\.uid\(\)/);
  assert.match(migration,/r\.created_at desc/);
  assert.match(migration,/from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.so_my_last_booking_board\(\) to authenticated/);
  assert.doesNotMatch(migration,/p_user_id|p_line_sub|p_customer/);
});
