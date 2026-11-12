import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const modulePath=fileURLToPath(new URL("../saas/store-live-sync.js",import.meta.url));
const raw=readFileSync(modulePath,"utf8");
const {createStoreLiveSync}=await import("data:text/javascript;base64,"+Buffer.from(raw).toString("base64"));

test("shared live-sync receives events and falls back to API on the 201st connection",async()=>{
  const prior=Object.fromEntries(["document","window","navigator"].map(
    k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const doc=new EventTarget();doc.hidden=false;
  const win=new EventTarget();const nav={onLine:true};
  for(const [k,v] of [["document",doc],["window",win],["navigator",nav]]){
    Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
  }
  let subscriber,receiver,removed=0,channels=0;
  const requests=[],modes=[];
  const client={
    channel(topic,opts){
      channels++;
      assert.equal(topic,"queue-board:verified-merchant");
      assert.equal(opts.config.private,false);
      const ch={
        on(event,filter,callback){
          assert.equal(event,"broadcast");
          assert.equal(filter.event,"invalidate");
          receiver=callback;return this;
        },
        subscribe(callback){
          subscriber=callback;
          callback("SUBSCRIBED");
          return this;
        }
      };
      return ch;
    },
    async removeChannel(){removed++;}
  };
  let sync;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try{
    sync=createStoreLiveSync({
      client,slug:"verified-merchant",
      refresh:async options=>{requests.push(options);},
      onModeChange:mode=>modes.push(mode)
    });
    sync.start();
    await sleep(10);
    assert.equal(sync.mode,"realtime");
    assert.equal(sync.connected,true);
    assert.equal(channels,1);
    assert.equal(requests[0].reason,"connected");
    receiver({payload:{kind:"reservation",changed:true}});
    await sleep(340);
    assert.ok(requests.some(x=>x.reason==="event"&&x.kind==="reservation"));
    const numberOfReads=requests.length;
    subscriber("CHANNEL_ERROR",{message:"too_many_connections 429"});
    assert.equal(sync.mode,"api");
    assert.equal(sync.connected,false);
    sync.tick();
    await sleep(10);
    assert.equal(requests.length,numberOfReads+1);
    assert.equal(requests.at(-1).reason,"fallback");
    // No attempt to steal another viewer's Realtime slot during backoff.
    sync.tick();
    assert.equal(channels,1);
    doc.hidden=true;
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.ok(removed>=1);
    doc.hidden=false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await sleep(10);
    assert.equal(sync.mode,"realtime");
    assert.equal(channels,2);
    win.dispatchEvent(new Event("pagehide"));
    assert.equal(sync.mode,"api");
    win.dispatchEvent(new Event("pageshow"));
    await sleep(10);
    assert.equal(sync.mode,"realtime");
    assert.equal(channels,3);
    assert.deepEqual(modes.slice(0,2),["api","realtime"]);
  }finally{
    sync?.stop();
    for(const k of ["document","window","navigator"]){
      if(prior[k])Object.defineProperty(globalThis,k,prior[k]);
      else delete globalThis[k];
    }
  }
});

test("no-OA shops are skipped and HTTP backup is exactly five seconds",()=>{
  const notices=readFileSync(new URL("../supabase/functions/line-bridge/index.ts",import.meta.url),"utf8");
  const board=readFileSync(new URL("../saas/assets/board/main.js",import.meta.url),"utf8");
  const pickup=readFileSync(new URL("../saas/assets/pickup-board/main.js",import.meta.url),"utf8");
  const progress=readFileSync(new URL("../saas/app/queue-progress.js",import.meta.url),"utf8");
  assert.match(notices,/\["MERCHANT_OA_NOT_CONNECTED", "CUSTOMER_NOT_LINKED"/);
  assert.match(raw,/fallbackMs=5000,reconcileMs=60000/);
  assert.match(pickup,/fallbackMs:5000,reconcileMs:60000/);
  for(const source of [raw,board,pickup,progress])assert.doesNotMatch(source,/每 10 秒|10s API/);
  assert.match(board,/每 5 秒更新一次叫號/);
  assert.match(pickup,/每 5 秒備援同步/);
  assert.match(progress,/叫號進度約每 5 秒更新一次/);
});
