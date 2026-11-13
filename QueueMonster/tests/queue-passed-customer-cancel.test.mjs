import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261113_qm_allow_customer_cancel_passed.sql",import.meta.url),"utf8");
const booking=readFileSync(new URL("../saas/app/customer-booking.js",import.meta.url),"utf8");
const records=readFileSync(new URL("../saas/app/customer-records.js",import.meta.url),"utf8");
const progress=readFileSync(new URL("../saas/app/queue-progress.js",import.meta.url),"utf8");
test("an owned passed ticket can be cancelled before another take-number",()=>{
 assert.match(sql,/status in \('WAITING','HOLD','PASSED'\)/);
 assert.match(sql,/active_link.user_id=auth.uid\(\)/);
 assert.match(sql,/ticket.user_id/);
 assert.match(booking,/x.status==="PASSED"&&x.date===taipei\(\)/);
 assert.match(booking,/\["WAITING","HOLD","PASSED"\].includes\(live.status\)/);
 assert.match(records,/\["WAITING","HOLD","PASSED"\].includes\(x.status\)/);
 assert.match(progress,/\["WAITING","HOLD","PASSED"\].includes\(ownStatus\)/);
});