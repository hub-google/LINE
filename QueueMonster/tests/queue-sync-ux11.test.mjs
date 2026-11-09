import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");

test("UX-11 remembers last successful queue sync per merchant, not on failure",()=>{
 assert.match(app,/let queueLastSuccessAt="",queueLastSuccessShop="";/);
 const start=app.indexOf("async function refreshQueueProgress()");
 const end=app.indexOf("function queueProgressBoard(){",start);
 const source=app.slice(start,end);
 assert.match(source,/queueLive=data;queueLiveShop=shop;queueLiveError="";/);
 assert.match(source,/queueLastSuccessAt=new Date\(\)\.toISOString\(\);queueLastSuccessShop=shop/);
 const index=source.indexOf("queueLastSuccessAt=new Date()");
 assert.ok(index>source.indexOf("const data=await rpc"),"save timestamp only after successful RPC");
 assert.ok(index<source.indexOf("}catch(e)"),"error handler must not replace last success");
});

test("UX-11 queue displays cached snapshot warning, actual Taipei timestamp and manual reload",()=>{
 const start=app.indexOf("function queueProgressBoard(){");
 const end=app.indexOf("function stopCrossQueueRealtime()",start);
 const source=app.slice(start,end);
 assert.match(source,/const fresh=queueLiveShop===slug\?queueLive:null/);
 assert.match(source,/const lastSync=queueLastSuccessShop===slug\?queueLastSuccessAt:""/);
 assert.match(source,/const notLive=!!queueLiveError\|\|navigator\.onLine===false/);
 assert.match(source,/最新進度無法確認/);
 assert.match(source,/以下為最後取得的資料/);
 assert.match(source,/最後成功更新/);
 assert.match(source,/formatTaipeiCreated\(lastSync\)/);
 assert.match(source,/尚未成功同步/);
 assert.match(source,/btn\("重新整理進度","queue-refresh"/);
 assert.match(app,/if\(a==="queue-refresh"\)\{void refreshQueueProgress\(\);return;\}/);
 assert.match(app,/document\.addEventListener\("visibilitychange"/);
});

test("UX-11 cross-store sync timestamp scoped by merchant and manual refresh available",()=>{
 assert.match(app,/let crossLastSuccessAt="",crossLastSuccessShop="";/);
 assert.match(app,/crossLastSuccessAt=new Date\(\)\.toISOString\(\);crossLastSuccessShop=currentSlug/);
 assert.match(app,/crossLastSuccessAt=new Date\(\)\.toISOString\(\);crossLastSuccessShop=slug/);
 assert.match(app,/const lastCrossSync=crossLastSuccessShop===slug\?crossLastSuccessAt:""/);
 assert.match(app,/const crossStale=!!customerActivityError\|\|navigator\.onLine===false/);
 assert.match(app,/跨店進度未即時同步，以下紀錄可能不是最新狀態/);
 assert.match(app,/btn\("手動更新跨店進度","cross-refresh"/);
 assert.match(app,/if\(a==="cross-refresh"\)\{void refreshCrossStoreOverview\(\);return;\}/);
});
