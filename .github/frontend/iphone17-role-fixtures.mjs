import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './node_modules/playwright/index.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const src=path.join(root,'QueueMonster/saas');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'QueueMonster/tests/helpers/staff-render-baseline.json'),'utf8')).fixture;
const out='reports/iphone17-safari-20261110/role-fixtures';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const relative=decodeURIComponent(url.pathname.replace(/^\/LINE\/booking\//,''));
 const file=path.resolve(src,relative);
 if(!file.startsWith(src+path.sep)){res.writeHead(403).end();return}
 try{
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/LINE/booking/';
const report={note:'VISUAL-ONLY ROLE FIXTURES. Synthetic role/tenant states injected in browser; do not infer real login, backend authorization, or LINE delivery. No production data writes.',screens:[],failures:[]};
for(const [engineName,engine] of [['webkit',webkit],['chromium',chromium]]){
 let browser;
 try{
  browser=await engine.launch({headless:true,args:engineName==='chromium'?['--no-sandbox']:[]});
  const context=await browser.newContext({viewport:{width:402,height:874},screen:{width:402,height:874},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'zh-TW'});
  const page=await context.newPage();
  await page.route('https://unapiwajmgqqtdkixaab.supabase.co/**',route=>route.abort());
  await page.goto(base+'index.html?view=staff&merchant=greenfield-salon',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1600);
  for(const tab of ['dashboard','bookings','queue','settings']){
   try{
    const result=await page.evaluate(async ({fixture,tab})=>{
     const {staffRender}=await import('./app/staff-view.js');
     const {authState}=await import('./app/state/authState.js');
     const {staffState}=await import('./app/state/staffState.js');
     const {routeState}=await import('./app/state/routeState.js');
     const {calendarState}=await import('./app/state/calendarState.js');
     const {serviceUnitsState}=await import('./app/state/serviceUnitsState.js');
     const {lineState}=await import('./app/state/lineState.js');
     const {staffHistoryState}=await import('./app/state/staffHistoryState.js');
     const {sharedUiState}=await import('./app/state/sharedUiState.js');
     authState.session={user:{id:'qa-visual-only',is_anonymous:false,email:'synthetic.invalid@example.com'},access_token:'synthetic-for-render-only'};
     authState.context={memberships:[],invitations:[]};
     staffState.staff=fixture;staffState.staffTab=tab;
     routeState.view='staff';routeState.slug='greenfield-salon';routeState.day='2026-11-10';
     calendarState.calendarAnchor='2026-11-10';lineState.lineConfig=null;
     staffHistoryState.staffHistoryDays=14;
     serviceUnitsState.unitConfig=null;serviceUnitsState.unitChoice='';
     sharedUiState.bookingPath='/LINE/booking/';
     document.body.dataset.portal='staff';
     document.getElementById('root').innerHTML=staffRender();
     const nav=document.querySelector('.staff-mobile-nav');
     return {text:document.getElementById('root').innerText.slice(0,400),hasQuickNav:!!nav,hasMore:!!nav?.querySelector('summary'),docWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    },{fixture,tab});
    const ok=result.hasQuickNav&&result.hasMore&&result.docWidth<=result.viewport+2;
    report.screens.push({engine:engineName,tab,ok,...result});
    if(!ok)report.failures.push({engine:engineName,tab,reason:'mobile nav absent or viewport overflow'});
    await page.screenshot({path:path.join(out,engineName+'-staff-'+tab+'.png'),animations:'disabled'});
    if(tab==='dashboard'){
     const more=page.locator('.staff-mobile-more summary');
     if(await more.count())await more.click();
     await page.screenshot({path:path.join(out,engineName+'-staff-more-menu.png'),animations:'disabled'});
     if(!await page.locator('.staff-mobile-popup [data-tab="settings"]').isVisible())report.failures.push({engine:engineName,tab,reason:'settings missing from mobile more-menu'});
    }
   }catch(e){report.failures.push({engine:engineName,tab,reason:String(e)})}
  }
  try{
   const h=await page.evaluate(async()=>{
    const {platformRender}=await import('./app/platform-view.js');
    const {authState}=await import('./app/state/authState.js');
    const {routeState}=await import('./app/state/routeState.js');
    const {sharedUiState}=await import('./app/state/sharedUiState.js');
    authState.session={user:{id:'qa-visual-only',is_anonymous:false},access_token:'synthetic-for-render-only'};
    authState.context={platform_admin:true};
    routeState.view='platform';routeState.platformTab='list';
    routeState.overview=[{name:'展示門市（僅渲染用）',slug:'greenfield-salon',status:'ACTIVE',modules:{reservation:true,queue:true,calling:true},staff:2,today_reservations:2,today_waiting:1}];
    sharedUiState.features=[['reservation','線上預約'],['queue','線上取號'],['calling','現場叫號']];
    document.body.dataset.portal='platform';
    document.getElementById('root').innerHTML=platformRender();
    return {text:document.getElementById('root').innerText.slice(0,450),docWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   report.screens.push({engine:engineName,tab:'headquarters-list',ok:h.docWidth<=h.viewport+2,...h});
   if(h.docWidth>h.viewport+2)report.failures.push({engine:engineName,tab:'headquarters-list',reason:'viewport overflow'});
   await page.screenshot({path:path.join(out,engineName+'-headquarters-list.png'),animations:'disabled'});
  }catch(e){report.failures.push({engine:engineName,tab:'headquarters-list',reason:String(e)})}
  await context.close();
 }catch(e){report.failures.push({engine:engineName,reason:'boot: '+String(e)})}
 finally{await browser?.close()}
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('ROLE-FIXTURES',JSON.stringify({screens:report.screens,failures:report.failures}));
await new Promise(resolve=>server.close(resolve));
if(report.failures.length)process.exitCode=2;
