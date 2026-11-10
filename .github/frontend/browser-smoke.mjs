import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './node_modules/playwright/index.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const dist=path.resolve(process.argv[2]||'line-saas-dist');
const source=path.join(repo,'QueueMonster/saas');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local');
 const base=(url.pathname.startsWith('/source/')||url.pathname.startsWith('/LINE/booking/'))?source:dist;
 const relative=decodeURIComponent(url.pathname.replace(/^\/(source|booking|LINE\/booking)\//,''));
 const file=path.resolve(base,relative);
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const context=await browser.newContext();const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const missing=[];page.on('response',r=>{if(r.url().startsWith(baseUrl)&&r.status()===404)missing.push(r.url());});
 const baseUrl='http://127.0.0.1:'+server.address().port;
 // Render the single approved brand image at a real browser origin, not just inspect SVG text.
 await page.goto(baseUrl+'/booking/home.html',{waitUntil:'networkidle'});
 const mascot=await page.evaluate(async()=>{
  const img=new Image();
  img.src=new URL('./monster-mascot.svg',location.href).href;
  await img.decode();
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=89;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let painted=0;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i]>128)painted++;
  return {width:img.naturalWidth,height:img.naturalHeight,painted};
 });
 assert.equal(mascot.width,480,'Mascot source width');
 assert.equal(mascot.height,443,'Mascot source height');
 assert.ok(mascot.painted>1500,'Mascot must actually render rather than showing a broken/blank SVG');
 console.log('Shared mascot rendered in Chromium:',JSON.stringify(mascot));
 // Execute the real source graph; these checks do not use the legacy lexical adapter.
 await page.goto(baseUrl+'/LINE/booking/index.html?view=staff&merchant=greenfield-salon',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const {bookingState}=await import('./app/state/bookingState.js');
  const {queueState}=await import('./app/state/queueState.js');
  const {routeState}=await import('./app/state/routeState.js');
  const {normalizeBookingPhone,availableForParty}=await import('./app/customer-booking.js');
  const {calendarPeriod}=await import('./app/booking-calendar.js');
  const {isSafeMerchant}=await import('./app/route-state.js');
  const {handleBookingSubmit}=await import('./app/actions/booking-submit.js');
  const ignored=await handleBookingSubmit(null,null,'unrelated',null);
  return {party:bookingState.bookingParty,queueParty:queueState.queuePartySize,slug:routeState.slug,
   phone:normalizeBookingPhone('+886912345678'),safe:isSafeMerchant('greenfield-salon'),unsafe:isSafeMerchant('../evil'),
   ignored,calendar:calendarPeriod('month','2026-11-09'),capacity:availableForParty({available:3},4),withinCapacity:availableForParty({available:3},2)};
 });
 assert.equal(result.party,1);assert.equal(result.queueParty,2);assert.equal(result.slug,'greenfield-salon');
 assert.equal(result.phone,'0912345678');assert.equal(result.safe,true);assert.equal(result.unsafe,false);assert.equal(result.ignored,false);assert.equal(result.capacity,false);assert.equal(result.withinCapacity,true);assert.equal(result.calendar.start,'2026-10-26');assert.equal(result.calendar.end,'2026-12-06');
 console.log('Native module initialization and feature functions:',JSON.stringify(result));
 const baseline=JSON.parse(fs.readFileSync(path.join(repo,'QueueMonster/tests/helpers/staff-render-baseline.json'),'utf8'));
 const snapshots=await page.evaluate(async ({fixture,tabs})=>{
  const {staffRender}=await import('./app/staff-view.js');
  const {authState}=await import('./app/state/authState.js');
  const {staffState}=await import('./app/state/staffState.js');
  const {routeState}=await import('./app/state/routeState.js');
  const {calendarState}=await import('./app/state/calendarState.js');
  const {lineState}=await import('./app/state/lineState.js');
  const {serviceUnitsState}=await import('./app/state/serviceUnitsState.js');
  const objects=[authState,staffState,routeState,calendarState,lineState,serviceUnitsState];const saved=objects.map(o=>({...o}));
  try{
   authState.session={user:{id:'unit-render-user',email:'unit@example.invalid',is_anonymous:false}};
   authState.context={memberships:[],invitations:[]};staffState.staff=fixture;routeState.day='2026-11-09';calendarState.calendarAnchor='2026-11-09';serviceUnitsState.unitAdminDate='2026-11-09';lineState.lineConfig=null;
   const outputs={};for(const tab of tabs){staffState.staffTab=tab;outputs[tab]=staffRender().replaceAll(location.origin,'https://hub-google.github.io');}
   return outputs;
  }finally{objects.forEach((o,i)=>Object.assign(o,saved[i]));}
 },{fixture:baseline.fixture,tabs:Object.keys(baseline.hashes)});
 const {createHash}=await import('node:crypto');
 for(const [tab,html]of Object.entries(snapshots))assert.equal(createHash('sha256').update(html).digest('hex'),baseline.hashes[tab],tab+' render changed from pre-refactor baseline');
 console.log('All ten staff panels match pre-refactor HTML snapshots.');
 // Exercise production bundles at both desktop and mobile sizes with actual network reads.
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  for(const name of ['home.html','directory.html?mode=search','merchant-register.html','platform-login.html','index.html?view=platform','index.html?view=staff&merchant=greenfield-salon','index.html?view=customer&merchant=greenfield-salon','board.html?merchant=greenfield-salon','poster.html?merchant=greenfield-salon']){
   await page.goto(baseUrl+'/booking/'+name,{waitUntil:'networkidle',timeout:45000});
   assert.ok((await page.locator('body').innerText()).trim().length>30,name);
   if(name==='home.html'){
    const rects=await page.locator('.hero-demo').evaluateAll(nodes=>nodes.map(n=>{
     const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};
    }));
    assert.equal(rects.length,2,'Homepage must show booking and queue examples together');
    assert.ok(rects.every(r=>r.width>=150&&r.left>=-2&&r.right<=width+2),'Hero cards must fit viewport');
    if(width<=620)assert.ok(rects[1].top>=rects[0].bottom-2,'Mobile examples should stack cleanly');
    else assert.ok(rects[1].left>=rects[0].right-2,'Desktop examples should display side by side');
    console.log('Homepage dual-examples layout:',width,JSON.stringify(rects));
   }
   if(name==='home.html'||name.startsWith('directory.html')){
    const excluded=await page.locator('a[href*="merchant-register"],a[href*="platform-login"],a[href*="view=staff"],a[href*="view=platform"]').count();
    assert.equal(excluded,0,'Public portals must not display manager or headquarters links');
   }
   if(width===390&&name==='directory.html?mode=search'){
    const geometry=await page.evaluate(()=>({
     viewport:innerWidth,
     document:document.documentElement.scrollWidth,
     searchTop:document.querySelector('#keyword').getBoundingClientRect().top,
     filterCollapsed:!document.getElementById('explore-filters').open
    }));
    assert.ok(geometry.document<=geometry.viewport+2,'Mobile directory must not overflow the viewport');
    assert.ok(geometry.searchTop<440,'Mobile search should be visible near top of first screen');
    assert.equal(geometry.filterCollapsed,true,'Advanced filters must begin collapsed on mobile');
    await page.locator('#filter-summary').click();
    assert.equal(await page.locator('#explore-filters').evaluate(el=>el.open),true);
   }
   if(name==='index.html?view=staff&merchant=greenfield-salon'){
    const links=await page.locator('#headlinks a').allTextContents();
    assert.deepEqual(links,['店家工作台','操作說明'],'Merchant header must contain only merchant functions');
   }
   if(name==='index.html?view=platform'){
    const links=await page.locator('#headlinks a').allTextContents();
    assert.deepEqual(links,['總部管理'],'Headquarters header must not show merchant or customer entry');
   }
   if(name==='index.html?view=customer&merchant=greenfield-salon'){
    const links=await page.locator('#headlinks a').allTextContents();
    assert.deepEqual(links,['搜尋店家','預約與取號'],'Customer header must not show merchant or headquarters entry');
   }
   if(name==='merchant-register.html'||name==='platform-login.html'){
    const forbidden=name==='merchant-register.html'?'directory.html,home.html,platform-login.html':'directory.html,home.html,merchant-register.html';
    const selectors=forbidden.split(',').map(s=>'header a[href*="'+s+'"]').join(',');
    assert.equal(await page.locator(selectors).count(),0,'Private portal must not link to the other portals');
   }
   if(name==='merchant-register.html'){
    // Simulate an authenticated merchant account to verify visual geometry
    // without submitting credentials or touching the production database.
    const layout=await page.evaluate(()=>{
     document.getElementById('auth-zone').classList.add('hidden');
     document.getElementById('account-zone').classList.remove('hidden');
     document.querySelector('.password-panel').classList.add('hidden');
     const items=['switch-account','logout'];
     const positions=items.map(id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width};
     });
     const signup=document.querySelector('#account-zone a.secondary-action').getBoundingClientRect();
     const panel=document.querySelector('.panel').getBoundingClientRect();
     return {items:positions,signup:{top:signup.top,bottom:signup.bottom,left:signup.left,right:signup.right},panel:{left:panel.left,right:panel.right}};
    });
    assert.ok(layout.items[0].bottom+8<=layout.signup.top,'Merchant account links must be vertically separated');
    assert.ok(layout.signup.bottom+8<=layout.items[1].top,'Logout must not overlap the registration link');
    assert.ok(layout.items.every(r=>r.width>150&&r.left>=layout.panel.left&&r.right<=layout.panel.right),'Account buttons must stay inside the panel');
   }
   if(name==='home.html'||name.startsWith('directory.html')){
    const logo=await page.locator('.site-auth-login').first().evaluate(el=>{
     const css=getComputedStyle(el,'::before');
     return {image:css.backgroundImage,width:parseFloat(css.width),height:parseFloat(css.height)};
    });
    assert.match(logo.image,/line-app-icon\.svg/,'LINE login must display the original icon');
    assert.ok(logo.width>=20&&logo.height>=20,'LINE icon must remain visible at all widths');
    const icon=await page.evaluate(async()=>{
     const r=await fetch('./line-app-icon.svg');
     return r.ok&&(await r.text()).includes('data:image/png;base64,');
    });
    assert.ok(icon,'LINE icon asset must be reachable by the browser');
   }
   console.log(width,name,await page.title());
  }
 }
 assert.deepEqual(missing,[],'Missing local build assets');assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('Browser smoke passed; no business writes were submitted.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
