import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../../",import.meta.url));
const at=p=>path.join(root,p);
const read=p=>readFileSync(at(p),"utf8");

test("retired QR poster page and dedicated modules are removed",()=>{
 for(const file of ["QueueMonster/saas/poster.html","QueueMonster/saas/assets/poster/main.js","QueueMonster/saas/assets/poster/page.css"]){
  assert.equal(existsSync(at(file)),false,"Must not ship retired page: "+file);
 }
 const build=read(".github/scripts/build-line-saas.mjs");
 assert.doesNotMatch(build,/"poster\\.html"/);
});

test("neither staff tab nor merchant guide links to the deleted page",()=>{
 const booking=read("QueueMonster/saas/app/staff/bookings.js");
 const queue=read("QueueMonster/saas/app/staff/queue.js");
 const guide=read("QueueMonster/saas/merchant-center.html");
 for(const source of [booking,queue,guide]){
  assert.doesNotMatch(source,/poster\\.html|製作預約 QR 立牌|製作現場取號 QR 立牌/);
 }
 assert.match(queue,/board\\.html\\?merchant=/,"TV board remains operational");
});

test("deployment removes old public URLs instead of retaining previous gh-pages copies",()=>{
 const deploy=read(".github/workflows/line-saas-pages.yml");
 const pr=read(".github/workflows/line-saas-pr-validation.yml");
 assert.match(deploy,/rm -f "\\$pubdir\\/\\$product\\/poster\\.html"/);
 assert.match(deploy,/rm -rf "\\$pubdir\\/\\$product\\/assets\\/poster"/);
 assert.doesNotMatch(deploy,/for f in [^\\n]*poster\\.html/);
 assert.match(deploy,/test ! -e "\\$RUNNER_TEMP\\/line-saas-dist\\/poster\\.html"/);
 assert.match(pr,/test ! -e \\/tmp\\/line-saas-pr-dist\\/poster\\.html/);
 assert.match(deploy,/poster-removal-contract\\.test\\.mjs/);
 assert.match(pr,/poster-removal-contract\\.test\\.mjs/);
});
