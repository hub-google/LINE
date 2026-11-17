import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const build=read("QueueMonster/miniapp/build-mini.mjs");
const workflow=read(".github/workflows/queue-monster-mini-pages.yml");
const verify=read("QueueMonster/supabase/functions/qm-mini-session/index.ts");
const miniCss=read("QueueMonster/miniapp/qm-mini.css");
const nav=read("QueueMonster/miniapp/qm-mini-nav.js");

test("3 LINE MINI IDs stay distinct",()=>{
 const ids=["2012649101-EFX2gymX","2012649102-rNb39YpL","2012649103-s6KPdX4H"];
 for(const id of ids){
  assert.ok(build.includes(id),"builder missing "+id);
  assert.ok(verify.includes(id),"backend missing "+id);
  assert.ok(nav.includes(id),"navigation missing "+id);
 }
 assert.equal(new Set(ids).size,3);
});
test("build stages copies; never rewrites original Queue Monster source",()=>{
 assert.match(build,/await cp\(source,staged,\{recursive:true\}\)/);
 assert.match(build,/await patch\(path\.join\(staged,"app\/line-session\.js"\)/);
 assert.match(build,/await patch\(path\.join\(staged,"site-auth\.js"\)/);
 assert.doesNotMatch(build,/await patch\(path\.join\(source,/);
 assert.match(build,/qm-mini-session/);
 assert.match(build,/so_mini_platform_records_page/);
});
test("publishing is scoped exclusively to queue-mini",()=>{
 assert.match(workflow,/rm -rf "\$site\/queue-mini\/developing"/);
 assert.ok(!workflow.includes('rm -rf "$site/queue-mini"'),"auto deploy must preserve review/published");
 assert.match(workflow,/git -C "\$site" add -A -- queue-mini\//);
 assert.doesNotMatch(workflow,/git -C "\$site" add -A -- booking/);
 assert.doesNotMatch(workflow,/git -C "\$site" add -A -- queue-prod/);
 assert.match(workflow,/group: line-saas-gh-pages/);
});
test("MINI auth validates LINE-issued subject on the server",()=>{
 assert.match(verify,/api\.line\.me\/oauth2\/v2\.1\/verify/);
 assert.match(verify,/api\.line\.me\/v2\/profile/);
 assert.match(verify,/getUser\(/);
 assert.match(verify,/LINE_ACCOUNT_CHANGED/);
 assert.doesNotMatch(verify,/Deno\.env\.get\("LINE_MESSAGING_ACCESS_TOKEN"\)/);
});
test("MINI display and navigation are isolated",()=>{
 assert.match(miniCss,/body\.qm-mini/);
 assert.match(nav,/qm-mini-bottom/);
 assert.match(nav,/directory\.html\?mode=queue/);
 assert.match(nav,/my-records\.html/);
});
