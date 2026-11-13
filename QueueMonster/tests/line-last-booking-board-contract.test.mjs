import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../",import.meta.url);
const page=readFileSync(new URL("saas/assets/directory/main.js",base),"utf8");
const menu=readFileSync(new URL("../.github/scripts/publish_rich_menu.py",base),"utf8");
const migration=readFileSync(new URL("supabase/migrations/20261112173500_last_reservation_queue_board.sql",base),"utf8");
test("LINE OA last reservation board uses verified session RPC, not a shared board",()=>{
  assert.match(menu,/上次預約看板/);
  assert.match(menu,/directory\.html\?mode=mine&section=board/);
  assert.doesNotMatch(menu,/service=%E7%9C%8B%E6%9D%BF/);
  assert.match(page,/sb\.rpc\("so_my_last_booking_board"\)/);
  assert.match(page,/lastBoardResult\?\.status==="FOUND"/);
  assert.match(page,/board\.searchParams\.set\("merchant",lastBoardResult\.slug\)/);
  assert.match(page,/site_return=directory\.html%3Fmode%3Dmine%26section%3Dboard/);
  assert.match(page,/BOARD_UNAVAILABLE/);
  assert.match(page,/NO_BOOKING/);
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
