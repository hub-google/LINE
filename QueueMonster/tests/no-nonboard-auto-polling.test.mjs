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

test("only the public queue board polls data; other pages have no periodic refresh",()=>{
  const exceptions=new Set(["version-watch.js","assets/board/main.js","assets/board/fullscreen-fit.js"]);
  const unwanted=sourceFiles().flatMap(file=>{
    const relative=path.relative(root,file).replaceAll(path.sep,"/");
    if(exceptions.has(relative))return [];
    const lines=readFileSync(file,"utf8").split("\n");
    return lines.flatMap((line,i)=>/setInterval\s*\(/.test(line)?[relative+":"+(i+1)]:[]);
  });
  assert.deepEqual(unwanted,[],"Non-board pages must not schedule periodic polling");
  const startup=read("app/startup.js");
  assert.match(startup,/void load\(\)/);
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

test("the public board alone uses realtime capacity and API fallback",()=>{
  const board=read("assets/board/main.js");
  assert.match(board,/client\.channel\("queue-board:"\+slug/);
  assert.match(board,/too_many_connections/);
  assert.match(board,/tenant_events/);
  assert.match(board,/status==="CHANNEL_ERROR"\|\|status==="TIMED_OUT"\|\|status==="CLOSED"/);
  assert.match(board,/stopRealtimeChannel\(\)/);
  assert.match(board,/subscribeQueueChanges\(\)/);
  assert.match(board,/\},10000\)/);
  assert.match(board,/每 10 秒更新一次叫號/);
  assert.match(read("board.html"),/id="board-update-mode"/);
});
