import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");

test("listing and test permissions use metadata, not merchant names or slug prefixes",()=>{
 const source=read("supabase/migrations/20261109161500_metadata_based_test_scoping.sql");
 const listing=read("migrations/20261109_remove_hardcoded_store_exclusions.sql");
 for(const code of [source,listing]){
   assert.doesNotMatch(code,/slug\s+(?:not\s+)?(?:like|in)\s+['"(]*qa-/i);
   assert.doesNotMatch(code,/greenfield-salon|demo-clinic/);
 }
 assert.match(source,/is_test_tenant/);
 assert.match(source,/is_test_request/);
 assert.match(source,/directory_enabled/);
 assert.match(source,/onboarding_complete/);
});

test("front end does not hide named or prefix-matched test stores",()=>{
 const street=read("saas/explore-game.js");
 const loading=read("saas/app/data-loading.js");
 const route=read("saas/app/route-state.js");
 const login=read("saas/site-auth.js");
 for(const code of [street,loading,route,login]){
   assert.doesNotMatch(code,/greenfield-salon|demo-clinic/);
   assert.doesNotMatch(code,/slug\.startsWith\(["']qa-|slug\s+not\s+like\s+["']qa-/);
 }
 assert.match(street,/publicShops\.filter\(s=>typeof s\?\.slug/);
 assert.doesNotMatch(login,/BIND_SHOP/);
 assert.match(route,/routeState\.slug=isSafeMerchant/);
});
