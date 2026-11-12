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
  assert.equal(existsSync(at(file)),false,"Retired page still exists: "+file);
 }
 assert.equal(read(".github/scripts/build-line-saas.mjs").includes('"poster.html"'),false);
});

test("staff controls and merchant guide do not expose the deleted page",()=>{
 const booking=read("QueueMonster/saas/app/staff/bookings.js");
 const queue=read("QueueMonster/saas/app/staff/queue.js");
 const guide=read("QueueMonster/saas/merchant-center.html");
 for(const source of [booking,queue,guide]){
  assert.equal(source.includes("poster.html"),false);
  assert.equal(source.includes("製作預約 QR 立牌"),false);
  assert.equal(source.includes("製作現場取號 QR 立牌"),false);
 }
 assert.ok(queue.includes("board.html?merchant="),"TV board must be retained");
});

test("Pages deployment deletes existing public copies of the retired page",()=>{
 const deploy=read(".github/workflows/line-saas-pages.yml");
 assert.ok(deploy.includes('rm -f "$pubdir/$product/poster.html"'));
 assert.ok(deploy.includes('rm -rf "$pubdir/$product/assets/poster"'));
 assert.ok(deploy.includes('test ! -e "$RUNNER_TEMP/line-saas-dist/poster.html"'));
 assert.ok(deploy.includes("poster-removal-contract.test.mjs"));
});


test("LINE OAuth and page login never return to a deleted poster URL",()=>{
 const site=read("QueueMonster/saas/site-auth.js");
 const oauth=read("QueueMonster/saas/app/line-session.js");
 for(const source of [site,oauth]){
  assert.doesNotMatch(source,/board\|poster|poster\|merchant-center/);
  assert.match(source,/board\|merchant-center/);
 }
});
