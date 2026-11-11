import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../saas");
const read=name=>readFileSync(path.join(root,name),"utf8");
function sourceFiles(dir=root){
  return readdirSync(dir,{withFileTypes:true}).flatMap(item=>{
    const p=path.join(dir,item.name);
    if(item.isDirectory())return sourceFiles(p);
    return /\.(?:js|mjs|html)$/.test(item.name)?[p]:[];
  });
}

test("only store-scoped customer, merchant and public board pages can poll business data",()=>{
  const exceptions=new Set(["version-watch.js","store-live-sync.js","assets/board/main.js","assets/board/fullscreen-fit.js"]);
  const unwanted=sourceFiles().flatMap(file=>{
    const relative=path.relative(root,file).replaceAll(path.sep,"/");
    if(exceptions.has(relative))return [];
    const lines=readFileSync(file,"utf8").split("\n");
    return lines.flatMap((line,i)=>/setInterval\s*\(/.test(line)?[relative+":"+(i+1)]:[]);
  });
  assert.deepEqual(unwanted,[],"Non-board pages must not schedule periodic polling");
  const startup=read("app/startup.js");
  assert.match(startup,/void load\(\)\.finally\(/);
  assert.doesNotMatch(startup,/setInterval|addEventListener\(["']focus|visibilitychange/);
  const progress=read("app/queue-progress.js");
  const crossStore=read("app/cross-store.js");
  assert.doesNotMatch(progress,/\.channel\(|\.subscribe\(/);
  assert.doesNotMatch(crossStore,/\.channel\(|\.subscribe\(/);
  assert.match(progress,/重新整理進度/);
});

test("new-version toast remains active and checks GitHub Pages, not Supabase",()=>{
  const watch=read("version-watch.js");
  assert.match(watch,/\.\/release\.json/);
  assert.match(watch,/function showNotice\(\)/);
  assert.match(watch,/網站已有新版本/);
  assert.match(watch,/現在更新/);
  assert.match(watch,/setInterval\(\(\) => \{ void checkVersion\(\); \}, CHECK_MS\)/);
  assert.doesNotMatch(watch,/supabase\.co|\.rpc\(/i);
});

test("customer and merchant share the public board's Realtime/10s API fallback",()=>{
  const board=read("assets/board/main.js");
  const startup=read("app/startup.js");
  const sync=read("store-live-sync.js");
  assert.match(board,/createStoreLiveSync/);
  assert.match(startup,/createStoreLiveSync/);
  assert.match(startup,/routeState.view==="customer"/);
  assert.match(startup,/routeState.view==="staff"/);
  assert.match(startup,/routeState.slug===merchant/);
  assert.match(startup,/feedbackState.busy/);
  assert.match(startup,/staffState.staffTab/);
  assert.match(startup,/refreshQueueProgress/);
  assert.match(startup,/refreshCrossStoreOverview/);
  assert.match(sync,/client.channel/);
  assert.match(sync,/too_many_connections/);
  assert.match(sync,/tenant_events/);
  assert.match(sync,/fallbackMs=10000,reconcileMs=60000/);
  assert.match(sync,/setInterval/);
  assert.match(board,/每 10 秒更新一次叫號/);
  assert.match(read("board.html"),/id="board-update-mode"/);
  // The merchant landing page, directory and HQ use different entrypoints
  // and must not import this controller.
  for(const html of ["home.html","directory.html","platform-login.html"]){
    assert.doesNotMatch(read(html),/store-live-sync|createStoreLiveSync/);
  }
});
