import fs from 'node:fs';
import path from 'node:path';
import {chromium, webkit} from './node_modules/playwright/index.mjs';

const origin='https://hub-google.github.io';
const base=origin+'/LINE/booking/';
const out='reports/iphone17-safari-20261110';
fs.mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString(),target:base,viewport:{width:402,height:874,deviceScaleFactor:3},description:'Real published website, read-only mobile browser emulation; LINE Login not authenticated; no real iPhone hardware.',runs:[],failures:[]};
const scenarios=[
 ['home','home.html',2800],
 ['directory','directory.html?mode=search',3500],
 ['queue-list','directory.html?mode=queue',3000],
 ['my-records-guest','directory.html?mode=mine',3500],
 ['arcade','directory.html?mode=game',3000],
 ['customer-reserve-guest','?view=customer&merchant=greenfield-salon&tab=reserve',12500],
 ['customer-queue-guest','?view=customer&merchant=greenfield-salon&tab=queue',9000],
 ['merchant-login','merchant-register.html?mode=login',2400],
 ['merchant-signup','merchant-register.html?mode=signup',2200],
 ['staff-guard','?view=staff&merchant=greenfield-salon',2400],
 ['headquarters-guard','?view=platform',2400],
 ['guide','merchant-center.html',2500],
 ['public-board','board.html?merchant=greenfield-salon',2600],
];
function safe(s){return String(s??'').replace(/\s+/g,' ').slice(0,450);}
for(const [engineName,engine] of [['webkit',webkit],['chromium',chromium]]){
 let browser;
 try{
  browser=await engine.launch({headless:true,args:engineName==='chromium'?['--no-sandbox']:[]});
  const context=await browser.newContext({
   viewport:{width:402,height:874},screen:{width:402,height:874},
   deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'zh-TW',timezoneId:'Asia/Taipei',
   userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
  });
  const page=await context.newPage();
  page.setDefaultTimeout(14000);
  for(const [name,route,wait] of scenarios){
   const row={engine:engineName,name,url:base+route,checks:[],errors:[],failedRequests:[]};
   const onError=e=>row.errors.push(safe(e?.message??e));
   const onRequestFail=req=>{const u=req.url();if(u.startsWith(origin)&&row.failedRequests.length<10)row.failedRequests.push({url:u.slice(0,180),error:req.failure()?.errorText})};
   page.on('pageerror',onError);page.on('requestfailed',onRequestFail);
   try{
    await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForTimeout(wait);
    row.metrics=await page.evaluate(()=>{
     const selectors=['#keyword','#results','#results-heading','#filter-summary','.mobile-menu','.menu-panel','#root','.site-head','#mobile-guide-nav'];
     const rects={};for(const sel of selectors){const e=document.querySelector(sel);if(e){const r=e.getBoundingClientRect();rects[sel]={top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),visible:r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}}}
     const anchors=[...document.querySelectorAll('button,a,summary,[role=button]')].map(el=>{const r=el.getBoundingClientRect();return {name:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,25),top:Math.round(r.top),height:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right)}}).filter(x=>x.height>0&&x.top>=0&&x.top<innerHeight);
     return {title:document.title,url:location.href,width:innerWidth,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,rects,touchUnder40:anchors.filter(a=>a.height<40).slice(0,12),body:safeInner(document.body.innerText),loginVisible:document.body.innerText.includes('使用 LINE 登入'),hasBookingForm:!!document.querySelector('#customer-day'),hasQueueForm:!!document.querySelector('[data-act="queue-join"]')};
     function safeInner(x){return String(x||'').replace(/\s+/g,' ').slice(0,600)}
    });
    const m=row.metrics;
    row.checks.push({name:'No horizontal overflow',ok:m.documentWidth<=m.width+2,detail:m.documentWidth+' / '+m.width});
    if(name==='directory'){
     row.checks.push({name:'Search input above fold',ok:m.rects['#keyword']?.top<520,detail:m.rects['#keyword']?.top});
     row.checks.push({name:'Result cards start in first screen',ok:m.rects['#results']?.top<874,detail:m.rects['#results']?.top});
     row.checks.push({name:'Search data rendered',ok:!/資料暫時無法載入|正在載入店家/.test(m.body),detail:m.body.slice(-170)});
    }
    if(name==='my-records-guest'){
     // An identity check may still be pending on slower mobile connections.
     // Neither waiting nor unauthenticated should ever show "popular stores".
     const first=await page.locator('body').innerText();
     row.checks.push({name:'Personal records never show the popular-stores loading placeholder',ok:!/熱門店家排行/.test(first)&&/我的紀錄/.test(first),detail:safe(first)});
     if(!/請先使用 LINE 登入/.test(first))await page.waitForTimeout(8500);
     const last=await page.locator('body').innerText();
     row.checks.push({name:'Guest records resolve to login or explicit network error',ok:/請先使用 LINE 登入|目前無法取得紀錄|資料暫時無法載入/.test(last)&&!/還沒有找到你的預約紀錄/.test(last),detail:safe(last)});
    }
    if(name==='customer-reserve-guest'||name==='customer-queue-guest'){
     row.checks.push({name:'No unsolicited external LINE redirect',ok:m.url.startsWith(base),detail:m.url});
     row.checks.push({name:'Guest can see public board and explicit LINE action',ok:/公開即時叫號|公開叫號看板/.test(m.body)&&/LINE/.test(m.body),detail:m.body});
    }
    if(name==='staff-guard')row.checks.push({name:'Staff sign-in required',ok:/店家登入/.test(m.body)&&!/已登入排隊怪獸/.test(m.body),detail:m.body});
    if(name==='headquarters-guard')row.checks.push({name:'HQ requires separate authorization',ok:/總部登入|總部管理員登入/.test(m.body),detail:m.body});
    if(name==='public-board')row.checks.push({name:'Board renders without identity',ok:/目前叫號|接下來等候排序/.test(m.body),detail:m.body});
    await page.screenshot({path:path.join(out,engineName+'-'+name+'.png'),animations:'disabled'});
    if(name==='home'){
     const menu=page.locator('.mobile-menu summary');if(await menu.isVisible()){await menu.click();await page.waitForTimeout(250);row.menuText=safe(await page.locator('.menu-panel').innerText());await page.screenshot({path:path.join(out,engineName+'-home-menu.png'),animations:'disabled'});row.checks.push({name:'Mobile menu offers customer and merchant paths',ok:/搜尋店家|顧客找店家/.test(row.menuText)&&/註冊與開通流程|註冊店家|我是店家/.test(row.menuText),detail:row.menuText});}
    }
    if(name==='directory'){
     const filters=page.locator('#explore-filters');
     row.checks.push({name:'Filters initially collapsed',ok:await filters.evaluate(el=>!el.open)});
     const summary=page.locator('#filter-summary');if(await summary.isVisible()){await summary.click();row.checks.push({name:'Filters can be expanded',ok:await filters.evaluate(el=>el.open)});await page.screenshot({path:path.join(out,engineName+'-directory-filters.png'),animations:'disabled'});}
     const rpcCalls=[];
     const rpcHandler=req=>{
      if(!req.url().includes('/rpc/so_public_store_search'))return;
      try{rpcCalls.push(JSON.parse(req.postData()||'{}'))}catch{}
     };
     page.on('request',rpcHandler);
     await page.locator('#keyword').fill('診所');
     await page.waitForTimeout(1800);
     const txt=await page.locator('#results').innerText();
     page.off('request',rpcHandler);
     row.categoryResult=safe(txt);
     row.categoryRpcCalls=rpcCalls;
     const visible=/醫療／診所|澄心健康服務中心/.test(txt);
     const validEmpty=/找不到符合條件的店家/.test(txt);
     const categoryRpcUsed=rpcCalls.some(args=>args.p_query===null&&String(args.p_category||'').includes('診所'));
     const categoryAvailable=await page.locator('#explore-category option').evaluateAll(nodes=>nodes.some(n=>(n.value||'').includes('診所')));
     // Disabled/suspended stores are absent from the public directory entirely:
     // if no active clinic category exists, an empty search is correct, not a regression.
     const expected=visible||(validEmpty&&(!categoryAvailable||categoryRpcUsed));
     row.checks.push({name:'Clinic category fallback respects the current published/active directory',ok:expected&&!/搜尋暫時失敗|正在搜尋店家/.test(txt),detail:JSON.stringify({visible,validEmpty,categoryAvailable,categoryRpcUsed,body:safe(txt)})});
     await page.screenshot({path:path.join(out,engineName+'-directory-search-clinic.png'),animations:'disabled'});
    }
    if(name==='guide'){
      const guide=page.locator('#mobile-guide-nav');if(await guide.isVisible()){await guide.locator('summary').click();row.checks.push({name:'All 8 guide chapters accessible',ok:await guide.locator('a[href^="#"]').count()===8});await page.screenshot({path:path.join(out,engineName+'-guide-menu.png'),animations:'disabled'})}
    }
   }catch(e){row.errors.push('Scenario failed: '+safe(e?.stack||e));}
   finally{page.off('pageerror',onError);page.off('requestfailed',onRequestFail);report.runs.push(row);for(const c of row.checks)if(!c.ok)report.failures.push({engine:engineName,scenario:name,...c});console.log('AUDIT',JSON.stringify({engine:engineName,name,checks:row.checks,errors:row.errors,metrics:row.metrics?.rects,body:row.metrics?.body?.slice(0,150)}));}
  }
  await context.close();
 }catch(e){report.failures.push({engine:engineName,scenario:'browser startup',reason:String(e)})}
 finally{await browser?.close()}
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('SUMMARY',JSON.stringify({totalScenarios:report.runs.length,failed:report.failures.length,failures:report.failures}));
if(report.failures.length)process.exitCode=2;
