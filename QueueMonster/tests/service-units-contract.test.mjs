import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "./helpers/source-fs.mjs";
import { spawnSync } from "node:child_process";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const ui = read("saas/index.html");
const board = read("saas/board.html");
const bridge = read("supabase/functions/line-bridge/index.ts");
const sql = read("supabase/migrations/20261105_unified_service_queues.sql");
const lookup = read("supabase/migrations/20261105_unified_service_queues_records.sql");
const prd = read("PRD.md");

test("new service-unit switches are opt-in with legacy booking/queue modules retained", () => {
  for (const key of ["multi_unit_enabled", "grouped_units_enabled", "checkin_queue_enabled"])
    assert.match(sql, new RegExp(key + "[^\\n]*default false"));
  assert.match(ui, /const unitEnabled=\(\)=>unitConfig\?\.multi===true/);
  assert.match(ui, /if\(!m\.reservation\)/);
  assert.match(ui, /else if\(unitEnabled\(\)\)html=unitBookingPanel\(\)/);
  assert.match(ui, /else if\(unitEnabled\(\)\)html=unitQueuePanel\(\)/);
  assert.match(ui, /so_book_with_contact_once/);
  assert.match(ui, /so_take_number_with_party/);
});

test("one shared tenant and resource model, not separate doctor/restaurant products", () => {
  assert.match(sql, /alter table public\.so_booking_resources/);
  assert.match(sql, /create table if not exists public\.so_service_sessions/);
  assert.match(sql, /foreign key \(tenant_id,unit_id\) references public\.so_booking_resources/);
  assert.match(sql, /add column if not exists service_session_id uuid/);
  assert.match(ui, /so_unit_manage/);
  assert.match(ui, /unitSettingsPanel/);
  assert.match(ui, /unitEnabled\(\)\?"":box\("預約資源/);
  assert.match(prd, /2026-11-05 通用服務單位/);
});

test("session booking protects capacity, idempotency, and tenant isolation", () => {
  assert.match(sql, /create or replace function public\.so_unit_book_once/);
  assert.match(sql, /for update/);
  assert.match(sql, /client_request_id=p_request_id/);
  assert.match(sql, /service_session_id=s\.id/);
  assert.match(sql, /if \(select coalesce\(sum\(party_size\),0\)/);
  assert.match(sql, /if v_count\+new\.party_size>s\.capacity/);
});

test("check-in is atomic and does not duplicate reservation queue ticket", () => {
  assert.match(sql, /create or replace function public\.so_unit_checkin/);
  assert.match(sql, /where reservation_id=r\.id for update/);
  assert.match(sql, /'replayed',true/);
  assert.match(sql, /private\.so_next_ticket_number/);
  assert.match(sql, /'RESERVATION'/);
  assert.match(ui, /so_unit_checkin/);
  assert.match(ui, /so_staff_set_reservation_status/);
});

test("independent queue RPC isolates current service session; link record lookup is authorized", () => {
  assert.match(sql, /create or replace function public\.so_unit_call/);
  assert.match(sql, /service_session_id=s\.id/);
  assert.match(sql, /create or replace function public\.so_unit_progress/);
  assert.match(sql, /create or replace function public\.so_unit_set_ticket_status/);
  assert.match(lookup, /private\.so_role\(t\.id\)/);
  assert.match(lookup, /so_line_links me/);
  assert.match(sql, /alter table public\.so_service_sessions enable row level security/);
});

test("one responsive TV board handles single and multiple queues without customer data", () => {
  assert.match(board, /so_unit_public_board/);
  assert.match(board, /so_public_board/);
  assert.match(board, /selectedSession/);
  assert.match(board, /renderUnits\(/);
  assert.doesNotMatch(board, /customer_name|customer_phone|line_sub|service_role/i);
  assert.match(board, /textContent/);
  assert.match(sql, /grant execute on function public\.so_unit_public_board\(text,uuid\) to anon,authenticated/);
});

test("LINE notice includes scoped session and preserves existing recipient behavior", () => {
  assert.match(bridge, /serviceSessionNoticeLines/);
  assert.match(bridge, /ticket\.service_session_id/);
  assert.match(bridge, /scope\(db\.from\("so_tickets"\)/);
  assert.match(bridge, /LINE_MESSAGING_ACCESS_TOKEN/);
  assert.match(bridge, /line_sub/);
});

test("new customer and board module JavaScript parses", () => {
  for (const [name, html] of [["index.html",ui],["board.html",board]]) {
    const matches = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(matches.length,1, name);
    const checked=spawnSync(process.execPath,["--input-type=module","--check"],{
      input:matches[0][1],encoding:"utf8"
    });
    assert.equal(checked.status,0,name+": "+checked.stderr);
  }
});
