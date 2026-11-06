import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sql=readFileSync(new URL("../supabase/migrations/20261104_tenant_customer_book_fr109.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("FR-108/109 customer ledger is tenant-scoped with RLS and private writes",()=>{
 assert.match(sql,/create table if not exists public\.so_customer_flags/);
 assert.match(sql,/primary key\(tenant_id,user_id\)/);
 assert.match(sql,/alter table public\.so_customer_flags enable row level security/);
 assert.match(sql,/revoke all on public\.so_customer_flags from public,anon,authenticated/);
 assert.match(sql,/private\.so_role\(v_tenant\) is null/);
 assert.match(sql,/public\.so_staff_customer_book\(p_slug text\)/);
 assert.match(sql,/public\.so_staff_set_customer_flag\(/);
 assert.match(sql,/where r\.tenant_id=v_tenant/);
 assert.match(sql,/count\(\*\) filter\(where r\.status='NO_SHOW'\)/);
 assert.match(sql,/customer_flags_changed/);
});
test("FR-109 blocking applies only to new bookings for verified same-tenant identity",()=>{
 assert.match(sql,/create trigger so_blocklisted_booking_guard before insert on public\.so_reservations/);
 assert.match(sql,/f\.tenant_id=new\.tenant_id and f\.block_new_bookings=true/);
 assert.match(sql,/linked_flag\.tenant_id=linked_viewer\.tenant_id/);
 assert.match(sql,/linked_flag\.line_sub=linked_viewer\.line_sub/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdelete from public\.so_(?:reservations|tickets)\b/i);
});
test("FR-108/109 manager UI can inspect and update customer flags",()=>{
 assert.match(ui,/so_staff_customer_book/);
 assert.match(ui,/so_staff_set_customer_flag/);
 assert.match(ui,/save-customer-flags/);
 assert.match(ui,/customer-flag-picker/);
 assert.match(ui,/customer-flag-notes/);
 assert.match(ui,/customer-flag-blacklisted/);
 assert.match(ui,/customer-flag-block/);
 const scripts=[...ui.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(scripts[0][1].replace(/^import\s+\{createClient\}[^;]+;/m,"const createClient=()=>{};")));
});
