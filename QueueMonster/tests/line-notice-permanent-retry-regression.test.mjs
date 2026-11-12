import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
const source=readFileSync(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url),"utf8");
test("permanent LINE recipient failures end as SKIPPED instead of burning retries",()=>{
 assert.match(source,/result\.ok && \["CUSTOMER_NOT_LINKED", "OA_CANNOT_REACH_CUSTOMER", "REPLY_REQUIRED"\]\.includes\(reason\)/);
 assert.match(source,/return \{ status: "SKIPPED", reason \}/);
 assert.match(source,/return \{ status: "RETRY", reason \}/);
 assert.match(source,/const expired = claimed\.attempts >= 14/);
 assert.match(source,/\.in\("status", \["PENDING", "RETRY"\]\)/);
});