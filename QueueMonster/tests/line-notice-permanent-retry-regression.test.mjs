import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
const source=readFileSync(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url),"utf8");
test("permanent LINE recipient failures end as SKIPPED instead of burning retries",()=>{
 assert.match(source,/result\.ok && \["MERCHANT_OA_NOT_CONNECTED", "CUSTOMER_NOT_LINKED", "OA_CANNOT_REACH_CUSTOMER", "REPLY_REQUIRED"\]\.includes\(reason\)/);
 assert.match(source,/return \{ status: "SKIPPED", reason \}/);
 assert.match(source,/if \(!token\) return reply\(200, \{ ok:true, sent:false, reason:"MERCHANT_OA_NOT_CONNECTED" \}/);
 assert.match(source,/const token = merchantOa\?\.token;/);
 assert.doesNotMatch(source,/const token = merchantOa\?\.token \|\| Deno\.env\.get\("LINE_MESSAGING_ACCESS_TOKEN"\)/);
 assert.match(source,/return \{ status: "RETRY", reason \}/);
 assert.match(source,/const expired = claimed\.attempts >= 14/);
 assert.match(source,/\.in\("status", \["PENDING", "RETRY"\]\)/);
});