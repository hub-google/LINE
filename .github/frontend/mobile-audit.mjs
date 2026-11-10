import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './node_modules/playwright/index.mjs';

// Read-only mobile visual QA: no sign-in and no booking/queue submissions.
const BASE = 'https://hub-google.github.io/LINE/booking/';
const OUT = 'reports/iphone17-20261110';
fs.mkdirSync(OUT,{recursive:true});
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const context = await browser.newContext({
  viewport:{width:402,height:874},deviceScaleFactor:3,isMobile:true,
  hasTouch:true,locale:'zh-TW',timezoneId:'Asia/Taipei',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});
const page = await context.newPage();
page.setDefaultTimeout(9000);
const report = [];
let currentErrors=[],currentFailures=[];
page.on('pageerror',e=>currentErrors.push(String(e.message||e).slice(0,350)));
page.on('requestfailed',r=>{if(currentFailures.length<12)currentFailures.push({url:r.url().slice(0,180),error:r.failure()?.errorText||'failed'});});
function clean(s){return String(s||'').replace(/\s+/g,' ').slice(0,115);}
async function inspect(id){
 const result=await page.evaluate(()=>{
  const width=innerWidth, height=innerHeight;
  const all=[...document.querySelectorAll('body *')];
  const over=all.map(el=>{
   const r=el.getBoundingClientRect();const s=getComputedStyle(el);
   if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.height===0)return null;
   if(r.right>width+3||r.left< -3) return {tag:el.tagName.toLowerCase(),selector:el.id?'#'+el.id:(typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).slice(0,3).join('.'):''),text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth};
   return null;
  }).filter(Boolean).slice(0,14);
  const taps=[...document.querySelectorAll('a,button,summary,[role=button],input,select')].filter(el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.top>=0&&r.top<height;
  }).map(el=>{
   const r=el.getBoundingClientRect();return {text:(el.textContent||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,28),width:Math.round(r.width),height:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top)};
  });
  return {
   title:document.title,finalUrl:location.href,width,height,
   docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
   docHeight:document.documentElement.scrollHeight,
   hasHorizontalOverflow:document.documentElement.scrollWidth>width+2,
   overflowElements:over,
   smallTaps:taps.filter(x=>x.height<38||x.width<38).slice(0,12),
   visibleTapCount:taps.length,
   keyRects:Object.fromEntries(['.page-header','.hero-heading','.main-panel','.tabs','#keyword','#explore-filters','#results','#results-heading','.hero-cta','.hero-showcase','.mobile-menu','.menu-panel','#root','.site-head'].map(sel=>{const el=document.querySelector(sel);if(!el)return [sel,null];const r=el.getBoundingClientRect();return[sel,{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),height:Math.round(r.height)}] }).filter(x=>x[1])),
   bodyText:(document.body.innerText||'').trim().replace(/\s+/g,' ').slice(0,500)
  };
 });
 const item={id,...result,errors:[...currentErrors],failedRequests:[...currentFailures]};
 report.push(item);console.log('AUDIT '+JSON.stringify(item));
 return item;
}
async function shot(id,opts={}){
 if(opts.wait)await page.waitForTimeout(opts.wait);
 await inspect(id);
 await page.screenshot({path:path.join(OUT,id+'.png'),animations:'disabled',timeout:25000});
}
async function visit(id,url,opts={}){
 currentErrors=[];currentFailures=[];
 try {await page.goto(url,{waitUntil:'domcontentloaded',timeout:38000});}
 catch(e){currentErrors.push('Navigation: '+String(e.message).slice(0,280));}
 await page.waitForTimeout(opts.wait??1700);
 await shot(id);
 if(opts.scroll){
  await page.evaluate(()=>scrollTo(0,Math.min(650,document.documentElement.scrollHeight-innerHeight)));
  await page.waitForTimeout(350);await shot(id+'-scroll');
 }
}
try{
 await visit('01-home',BASE+'home.html',{scroll:true});
 try{
  let menu=page.locator('.mobile-menu summary').first();
  if(await menu.isVisible()){await menu.click();await page.waitForTimeout(200);await shot('02-home-menu');}
 }catch(e){console.log('menu operation:',String(e));}
 await visit('03-directory-search',BASE+'directory.html?mode=search',{scroll:true,wait:2400});
 try{
  const search=page.locator('#keyword');
  if(await search.isVisible()){await search.fill('診所');await page.waitForTimeout(1700);await shot('04-directory-typed-search');}
 }catch(e){console.log('search interaction:',String(e));}
 await visit('05-directory-mine',BASE+'directory.html?mode=mine');
 await visit('06-directory-queue',BASE+'directory.html?mode=queue');
 await visit('07-directory-game',BASE+'directory.html?mode=game');
 await visit('08-customer-reserve',BASE+'?view=customer&merchant=greenfield-salon&tab=reserve',{scroll:true,wait:2200});
 await page.waitForTimeout(9000);await shot('08-customer-reserve-after-12s');
 await visit('09-customer-queue',BASE+'?view=customer&merchant=greenfield-salon&tab=queue',{scroll:true,wait:2200});
 await page.waitForTimeout(9000);await shot('09-customer-queue-after-12s');
 await visit('10-merchant-register',BASE+'merchant-register.html',{scroll:true});
 await visit('11-merchant-center',BASE+'merchant-center.html');
 await visit('12-staff',BASE+'?view=staff&merchant=greenfield-salon',{scroll:true});
 await visit('13-platform',BASE+'?view=platform',{scroll:true});
 await visit('14-public-board',BASE+'board.html?merchant=greenfield-salon');
} finally {
 fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({date:new Date().toISOString(),device:'iPhone 17 simulated Chromium, 402x874 CSS pixels, DPR3',note:'Read-only live website screenshots; no authentication, no writes; not physical Safari.',screens:report},null,2));
 await browser.close();
}
