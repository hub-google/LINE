import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const sql=read("supabase/migrations/20261104_customer_booking_idempotency_request.sql");
const ui=read("saas/index.html");

test("existing reservations stay intact while client request IDs become unique",()=>{
 assert.match(sql,/add column if not exists client_request_id uuid/i);
 assert.match(sql,/create unique index if not exists so_reservation_customer_request_once/i);
 assert.match(sql,/on public\.so_reservations \(tenant_id,user_id,client_request_id\)/);
 assert.match(sql,/where client_request_id is not null/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from|alter column .* not null/i);
});

test("booking retry is server-authorized, serialized, and reuses the exact booking",()=>{
 assert.match(sql,/create or replace function public\.so_book_with_items_once\(/i);
 assert.match(sql,/v_user uuid := auth\.uid\(\)/);
 assert.match(sql,/for update;/i);
 assert.match(sql,/r\.client_request_id=p_request_id/);
 assert.match(sql,/v_existing\.booking_date is distinct from p_date/);
 assert.match(sql,/v_existing\.party_size is distinct from p_party/);
 assert.match(sql,/public\.so_book_with_items\(/);
 assert.match(sql,/return v_result \|\| jsonb_build_object\('replayed',false\)/);
 assert.match(sql,/revoke all on function public\.so_book_with_items_once[\s\S]*from public,anon;/i);
 assert.match(sql,/grant execute on function public\.so_book_with_items_once[\s\S]*to authenticated;/i);
});

test("LINE first customer UI retries the same request without repeating side effects",()=>{
 assert.match(ui,/CUSTOMER_BOOKING_REQUEST_KEY/);
 assert.match(ui,/customerBookingRequestId\(/);
 assert.match(ui,/sessionStorage\.setItem\(CUSTOMER_BOOKING_REQUEST_KEY/);
 assert.match(ui,/rpc\("so_book_with_contact_once"/);
 assert.match(ui,/p_request_id:requestId/);
 assert.match(ui,/clearCustomerBookingRequest\(requestId\)/);
 assert.match(ui,/if\(result\.replayed\)return/);
 const scripts=[...ui.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const parsed=spawnSync(process.execPath,["--input-type=module","--check"],{input:scripts[0][1],encoding:"utf8"});
 assert.equal(parsed.status,0,parsed.stderr);
});
