import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const sql=readFileSync(new URL("../supabase/migrations/20261104_booking_confirmation_fr112.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("FR-112: confirmation default enabled and database policy stays tenant-scoped",()=>{
 assert.match(sql,/require_confirmation boolean not null default true/);
 assert.match(sql,/public\.so_booking_policy/);
 assert.match(sql,/public\.so_customer_booking_confirmation\(p_slug text\)/);
 assert.match(sql,/status='ACTIVE'/);
 assert.match(sql,/public\.so_set_booking_confirmation\(p_slug text,p_required boolean\)/);
 assert.match(sql,/private\.so_role\(v_tenant\.id\) not in \('OWNER','MANAGER'\)/);
 assert.match(sql,/booking_confirmation_changed/);
 assert.match(sql,/revoke all on function public\.so_set_booking_confirmation\(text,boolean\) from public,anon/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdrop table\b|\bdelete from public\.so_(?:reservations|tickets)\b/i);
});

test("FR-112: confirmation review is shown before creating reservation",()=>{
 assert.match(ui,/bookingConfirmationFingerprint/);
 assert.match(ui,/bookingConfirmationKey===bookingConfirmationFingerprint\(\)/);
 assert.match(ui,/customer\.booking_confirmation_required/);
 assert.match(ui,/so_customer_booking_confirmation/);
 assert.match(ui,/data-act="book-final"|btn\("確認預約","book-final"/);
 assert.match(ui,/btn\("返回修改","book-back"/);
 assert.match(ui,/if\(a==="book"&&customer\?\.booking_confirmation_required!==false\)/);
 assert.match(ui,/if\(a==="book-final"&&/);
 assert.match(ui,/if\(a==="book"\|\|a==="book-final"\)\{await act/);
 assert.match(ui,/so_book_with_items_once/);
 assert.match(ui,/customerBookingRequestId/);
 assert.match(ui,/clearCustomerBookingRequest\(requestId\)/);
});

test("FR-112: owner/manager can toggle without changing other booking policy",()=>{
 assert.match(ui,/id="policy-confirm-required"/);
 assert.match(ui,/save-booking-confirmation/);
 assert.match(ui,/so_set_booking_confirmation/);
 assert.match(sql,/on conflict\(tenant_id\) do update/);
 assert.match(sql,/set require_confirmation=excluded\.require_confirmation/);
});

test("FR-112: same pre-existing module script remains syntactically valid",()=>{
 const scripts=[...ui.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const source=scripts[0][1].replace(/^import\s+\{createClient\}[^;]+;/m,"const createClient=()=>{};");
 assert.doesNotThrow(()=>new vm.Script(source));
});
