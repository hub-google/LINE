import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../../",import.meta.url));
const source=(p)=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");

test("Cloudflare public hostname serves only the isolated release snapshot",()=>{
 const code=source("QueueMonster/cloudflare/monsterport-queue-bridge.mjs");
 assert.match(code,/const PREFIX="\/LINE\/queue-prod"/);
 assert.doesNotMatch(code,/const PREFIX="\/LINE\/booking"/);
 assert.match(code,/const TEST_PREFIX="\/LINE\/booking"/);
 assert.match(code,/independent-release-origin/);
});

test("normal commits deploy only to the test area",()=>{
 const yaml=source(".github/workflows/line-saas-pages.yml");
 assert.match(yaml,/branches: \[main\]/);
 assert.match(yaml,/github\.ref == 'refs\/heads\/main'/);
 assert.match(yaml,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.doesNotMatch(yaml,/queue-prod/);
});

test("production promotion writes only the isolated release area",()=>{
 const yaml=source(".github/workflows/queue-monster-production-release.yml");
 assert.match(yaml,/branches: \[release\]/);
 assert.match(yaml,/workflow_dispatch/);
 assert.match(yaml,/inputs\.confirmation == 'RELEASE'/);
 assert.match(yaml,/rm -rf "\$pubdir\/queue-prod"/);
 assert.match(yaml,/git -C "\$pubdir" add -A -- queue-prod\//);
 assert.match(yaml,/refs\/heads\/release/);
 assert.doesNotMatch(yaml,/rm -rf "\$pubdir\/booking"/);
});
