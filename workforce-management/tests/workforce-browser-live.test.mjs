import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const BASE='https://hub-google.github.io/LINE/';

function chromePath(){
 return [process.env.CHROME_BIN,
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser']
  .find(x=>x&&existsSync(x));
}

async function startBrowser(){
 const bin=chromePath();
 assert.ok(bin,'Headless Chrome is required; never report a simulated browser as E2E');
 const dir=await mkdtemp(path.join(tmpdir(),'workforce-chrome-'));
 let stderr='';
 const browser=spawn(bin,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'
 ],{stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',x=>{stderr=(stderr+String(x)).slice(-2400);});
 let port;
 try{
  // A busy GitHub Actions runner can take much longer than 8 seconds to
  // initialize Chrome. Wait a bounded 30 seconds before reporting failure.
  const startupDeadline=Date.now()+30000;
  while(Date.now()<startupDeadline){
   if(browser.exitCode!==null)throw Error('Chrome exited: '+stderr);
   try{
    const raw=await readFile(path.join(dir,'DevToolsActivePort'),'utf8');
    port=Number(raw.split('\n')[0]);
    if(port>0)break;
   }catch{}
   await sleep(250);
  }
  if(!port)throw Error('Chrome debugger never started: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  assert.ok(target,'Could not locate Chrome page debugger');
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   ws.addEventListener('open',resolve,{once:true});
   ws.addEventListener('error',()=>reject(Error('Chrome websocket failed')),{once:true});
  });
  let seq=0;
  const pending=new Map();
  ws.addEventListener('message',event=>{
   let result;
   try{result=JSON.parse(String(event.data));}catch{return;}
   const p=pending.get(result.id);
   if(!p)return;
   clearTimeout(p.timeout);pending.delete(result.id);
   if(result.error)p.reject(Error('DevTools '+result.error.message));
   else p.resolve(result.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;
   const timeout=setTimeout(()=>{pending.delete(id);reject(Error('DevTools timed out: '+method));},15000);
   pending.set(id,{resolve,reject,timeout});
   ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  return {send,async close(){
   ws.close();
   browser.kill('SIGTERM');
   await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }};
 }catch(error){
  browser.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true}).catch(()=>{});
  throw error;
 }
}
async function evaluate(devtools,expression){
 const out=await devtools.send('Runtime.evaluate',{
  expression,returnByValue:true,awaitPromise:true
 });
 if(out.exceptionDetails)throw Error('Browser JS error: '+out.exceptionDetails.text);
 return out.result?.value;
}
async function waitFor(devtools,expression,timeoutMs=25000){
 const start=Date.now();
 while(Date.now()-start<timeoutMs){
  if(await evaluate(devtools,expression))return;
  await sleep(400);
 }
 throw Error('Browser assertion timed out: '+expression);
}
async function navigate(devtools,url){
 await devtools.send('Page.navigate',{url});
 await waitFor(devtools,"location.href.startsWith("+JSON.stringify(url)+") && document.readyState==='complete'",22000);
}

test('Real Chrome Work E2E checks all core tabs, three request forms, login dialog, mobile and MINI', {timeout:110000},async()=>{
 const c=await startBrowser();
 try{
  await navigate(c,BASE+'workforce/');
  await waitFor(c,"!!document.querySelector('#appContent') && !!document.querySelector('[data-tab=\"requests\"]')");
  await evaluate(c,"document.querySelector('[data-tab=\"requests\"]').click()");
  await waitFor(c,"!!document.querySelector('[data-action=\"newLeaveRequest\"]')",30000);
  for(const [trigger,kind] of [
   ['newLeaveRequest','leave'],
   ['newOvertimeRequest','overtime'],
   ['newCorrectionRequest','correction']
  ]){
   await evaluate(c,"document.querySelector('[data-action=\""+trigger+"\"]').click()");
   await waitFor(c,"!!document.querySelector('#overlay form[data-form=\"request\"]') && !!document.querySelector('#overlay [data-request-kind=\""+kind+"\"]')");
   assert.equal(await evaluate(c,"document.querySelector('#overlay').hidden"),false);
   await evaluate(c,"document.querySelector('#overlay [data-action=\"closeModal\"]').click()");
   await waitFor(c,"document.querySelector('#overlay').hidden");
  }
  // Every core DEMO section must render in the real browser. No writes.
  for(const tab of [
   'schedule','punch','qr','employees','inbox','reports',
   'periods','anomalies','line','settings'
  ]){
   const selector='#nav button[data-tab="'+tab+'"]';
   assert.equal(await evaluate(c,"!!document.querySelector("+JSON.stringify(selector)+")"),true,tab+' is missing');
   await evaluate(c,"document.querySelector("+JSON.stringify(selector)+").click()");
   await waitFor(c,"document.querySelector("+JSON.stringify(selector)+")?.classList.contains('active')");
   assert.equal(await evaluate(c,"!!document.querySelector('#appContent')?.textContent?.trim()"),true,tab+' did not render');
  }
  // Public DEMO must never advertise the sensitive tenant archive as accessible.
  assert.equal(await evaluate(c,"document.querySelector('[data-tab=\"backup\"]')?.hidden"),true);
  await evaluate(c,"document.querySelector('#authBtn').click()");
  await waitFor(c,"!document.querySelector('#overlay')?.hidden && !!document.querySelector('#overlay [role=\"dialog\"]')");
  await evaluate(c,"document.querySelector('#overlay [data-action=\"closeModal\"]').click()");
  await waitFor(c,"document.querySelector('#overlay').hidden");
  await c.send('Emulation.setDeviceMetricsOverride',{
   width:390,height:844,deviceScaleFactor:3,mobile:true
  });
  await waitFor(c,"window.innerWidth===390");
  assert.equal(await evaluate(c,"!!document.querySelector('#menuToggle')"),true);
  assert.equal(await evaluate(c,"!!document.querySelector('[data-tab=\"punch\"]')"),true);

  // MINI uses its own HTML entrypoint and the same static business logic.
  await navigate(c,BASE+'workforce-mini/');
  await waitFor(c,"!!document.querySelector('#appContent') && document.body.textContent.includes('工作怪獸')",30000);
  assert.equal(await evaluate(c,"location.pathname.includes('workforce-mini')"),true);
 }finally{await c.close();}
});
