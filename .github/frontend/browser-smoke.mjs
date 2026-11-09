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
  const objects=[authState,staffState,routeState,calendarState,lineState];const saved=objects.map(o=>({...o}));
  try{
   authState.session={user:{id:'unit-render-user',email:'unit@example.invalid',is_anonymous:false}};
   authState.context={memberships:[],invitations:[]};staffState.staff=fixture;routeState.day='2026-11-09';calendarState.calendarAnchor='2026-11-09';lineState.lineConfig=null;
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
  for(const name of ['home.html','directory.html?mode=search','merchant-register.html','index.html?view=staff&merchant=greenfield-salon','index.html?view=customer&merchant=greenfield-salon','board.html?merchant=greenfield-salon','poster.html?merchant=greenfield-salon']){
   await page.goto(baseUrl+'/booking/'+name,{waitUntil:'networkidle',timeout:45000});
   assert.ok((await page.locator('body').innerText()).trim().length>30,name);
   console.log(width,name,await page.title());
  }
 }
 assert.deepEqual(missing,[],'Missing local build assets');assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('Browser smoke passed; no business writes were submitted.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
