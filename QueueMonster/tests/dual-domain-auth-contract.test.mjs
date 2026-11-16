import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("both site origins select their own LIFF app without replacing the existing LIFF",()=>{
 const client=read("saas/app/line-session.js");
 const bridge=read("supabase/functions/line-bridge/index.ts");
 const deploy=read("../.github/workflows/line-oa-deploy.yml");
 assert.match(client,/location\.hostname==="queue\.monsterport\.com"\?"queue":"legacy"/);
 assert.match(client,/&site="\+site/);
 assert.match(bridge,/Deno\.env\.get\(queueSite \? "LINE_LIFF_ID_QUEUE" : "LINE_LIFF_ID"\)/);
 assert.match(bridge,/https:\/\/hub-google\.github\.io/);
 assert.match(bridge,/https:\/\/queue\.monsterport\.com/);
 assert.match(deploy,/target = "https:\/\/hub-google\.github\.io\/LINE\/booking\/"/);
 assert.match(deploy,/sync-queue-auth-domains\.py/);
});
test("auth provisioning is additive, same-channel and preserves original redirects",()=>{
 const source=read("../.github/scripts/sync-queue-auth-domains.py");
 assert.match(source,/https:\/\/queue\.monsterport\.com\/\*\*/);
 assert.match(source,/https:\/\/hub-google\.github\.io\/LINE\/booking\/\*\*/);
 assert.match(source,/previous \+ list\(REQUIRED_REDIRECTS\)/);
 assert.match(source,/queue_id == old_id/);
 assert.match(source,/LINE_LIFF_ID_QUEUE/);
 assert.match(source,/site_url/);
});
