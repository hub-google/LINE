import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const migration=readFileSync(path.join(root,"supabase/migrations/20261104_customer_reference_code_projection.sql"),"utf8");

test("PRD 103: existing LINE-linked customer projection exposes immutable reference codes",()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.so_public_state/);
 assert.match(migration,/'id',r\.id,'reference_code',r\.reference_code,'number'/);
 assert.match(migration,/'id',k\.id,'reference_code',k\.reference_code,'number'/);
 assert.match(migration,/r\.user_id in \(select linked\.user_id/);
 assert.match(migration,/k\.user_id in \(select linked\.user_id/);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM public\.so_/i);
});
test("receipts use the real 21-character code, never a truncated UUID",()=>{
 assert.match(app,/const ref=String\(record\.reference_code\|\|"—"\)/);
 assert.doesNotMatch(app,/String\(record\.id\|\|""\)\.slice\(0,8\)\.toUpperCase\(\)/);
 assert.match(app,/查核參考碼：/);
 assert.match(app,/參考碼不能取代身分驗證/);
});
