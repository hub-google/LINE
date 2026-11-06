import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");

test("booking and ticket timestamps use real seconds in Asia/Taipei, not rounded minute",()=>{
 const matched=app.match(/function formatTaipeiCreated\(x\)\{[\s\S]*?\n\}/);
 assert.ok(matched,"missing common timestamp formatter");
 const fn=runInNewContext(matched[0]+"\n formatTaipeiCreated;",{Date,Intl,Number});
 assert.match(matched[0],/timeZone:"Asia\/Taipei"/);
 assert.match(matched[0],/second:"2-digit"/);
 assert.match(fn("2026-11-04T03:02:07Z"),/11:02:07/);
 assert.match(fn("2026-11-04T03:02:59Z"),/11:02:59/);
 assert.equal(fn(null),"時間未記錄");
});

test("timestamps appear in staff bookings, customer bookings, ticket receipt and CSV",()=>{
 assert.match(app,/送出預約時間：'\+esc\(formatTaipeiCreated\(x\.created_at\)\)/);
 assert.match(app,/取號時間：'\+esc\(formatTaipeiCreated\(x\.created_at\)\)/);
 assert.match(app,/formatTaipeiCreated\(record\.created_at\)/);
 assert.match(app,/formatTaipeiCreated\(x\.created_at\),x\.deleted_at/);
});
