import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {isValidTaiwanPhone,normalizeTaiwanPhone} from "../saas/app/tw-phone.js";

const valid=[
 "0912345678","0987654321","02-23456789","03-2123456","037-234567",
 "04-22345678","04-7123456","049-2345678","05-2345678","06-2345678",
 "07-2345678","08-4123456","082-234567","0826-61234","0836-21234",
 "089-234567","+886 912345678","+886(2)23456789"
];
const invalid=[
 "1","0912","091234567","09123456789","123456789","0800-123456",
 "02-12345678","02-2345678","03-1234567","04-2234567",
 "04-5234567","037-123456","05-1234567","08-2234567",
 "0826-21234","0836-11234","+12345678901","09abcdefgh"
];

test("Taiwan mobile and geographical landline numbers obey their exact numbering plans",()=>{
 for(const n of valid)assert.equal(isValidTaiwanPhone(n),true,n);
 for(const n of invalid)assert.equal(isValidTaiwanPhone(n),false,n);
 assert.equal(normalizeTaiwanPhone("+886(2)23456789"),"0223456789");
 assert.equal(normalizeTaiwanPhone("0912-345-678"),"0912345678");
});

test("pickup UI and SQL boundary both use Taiwan-specific validation, not generic 8-15 digits",()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
 const ui=readFileSync(path.join(root,"saas/app/pickup-mode.js"),"utf8");
 const sql=readFileSync(path.join(root,"supabase/migrations/20261112120500_pickup_taiwan_phone_validation.sql"),"utf8");
 assert.match(ui,/isValidTaiwanPhone\(pickupState\.phone\)/);
 assert.match(ui,/normalizeTaiwanPhone\(pickupState\.phone\)/);
 assert.match(sql,/private\.so_valid_tw_phone\(v_phone\)/);
 assert.match(sql,/private\.so_normalize_tw_phone\(p_customer_phone\)/);
 assert.match(ui,/^\s*if\(!name\|\|name\.length>60\|\|\/\^\\d\+\$\/.test\(name\)/m);
 assert.doesNotMatch(ui,/8～15 位數字/);
 assert.doesNotMatch(sql,/8～15 位數字/);
});
