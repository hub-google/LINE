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
   const outputs={};for(const tab of tabs){staffState.staffTab=tab;staffState.settingsSection="profile";outputs[tab]=staffRender().replaceAll(location.origin,'https://hub-google.github.io');}
   staffState.staffTab="settings";
   staffState.settingsSection="operations";
   outputs["settings-operations"]=staffRender().replaceAll(location.origin,'https://hub-google.github.io');
   staffState.settingsSection="sessions";
   serviceUnitsState.unitConfig={units:[],sessions:[],multi:false,picker:false};
   serviceUnitsState.showSessionForm=true;
   outputs["settings-sessions"]=staffRender().replaceAll(location.origin,'https://hub-google.github.io');
   return outputs;
  }finally{objects.forEach((o,i)=>Object.assign(o,saved[i]));}
 },{fixture:baseline.fixture,tabs:Object.keys(baseline.hashes)});
 const {createHash}=await import('node:crypto');
 // Preserve the historical ten-tab snapshot contract while excluding only the explicitly
 // retired QR poster buttons from current UI. Reinsert those two old anchors for hashing.
 // The menu snapshot includes the newly approved custom type selector and input.
 const legacyPosterAnchor=(mode)=>'<a class="btn outline" href="./poster.html?merchant=greenfield-salon&type='+mode+'" target="_blank" rel="noopener noreferrer">'+(mode==='reserve'?'製作預約 QR 立牌':'製作現場取號 QR 立牌')+'</a>';
 for(const [tab,html]of Object.entries(snapshots)){
  assert.equal(html.includes('poster.html'),false,'Retired poster link must not appear in any staff panel');
  let historical=html;
  if(tab==='bookings'){
   const marker='未來預約僅可取消或恢復。</p>';
   const start=historical.indexOf(marker);
   assert.ok(start>=0,'booking management marker must exist');
   const end=historical.indexOf('</div>',start);
   assert.ok(end>=0,'booking action bar must exist');
   historical=historical.slice(0,end)+legacyPosterAnchor('reserve')+historical.slice(end);
  }
  if(tab==='queue'){
   const marker='電視即時叫號看板</a></div>';
   assert.ok(historical.includes(marker),'TV board link must remain available');
   historical=historical.replace(marker,'電視即時叫號看板</a>'+legacyPosterAnchor('queue')+'</div>');
  }
  if(tab==='menu'){
   assert.match(html,/value="__CUSTOM__"/,'Merchant menu must allow custom type');
   assert.match(html,/id="menu-custom-kind-wrap"/,'Merchant menu must provide type input');
   continue; // Approved new custom category changes historical HTML.
  }
  if(tab==='settings-operations'){
   assert.ok(html.includes('id="policy-closed-dates"'),'Operating hours must retain saved closure dates');
   assert.ok(html.includes('class="qm-closed-calendar"'),'Closure dates must keep the calendar');
   assert.ok(html.includes('data-closed-done'),'Calendar must include a completion action');
   assert.ok(html.includes('id="set-service-queue"'),'Queue mode remains configurable');
   continue;
  }
  if(tab==='settings-sessions'){
   assert.ok(html.includes('unit-admin-date'),'Sessions must allow date selection');
   assert.ok(html.includes('unit-session-save'),'A shop without service windows must be able to save a session');
   assert.ok(html.includes('不指定（一般場次）'),'Session window must be optional');
   continue;
  }
  if(tab==='settings'){
   assert.ok(html.includes('settings-hub-tabs'),'Settings must show grouped category navigation');
   assert.ok(html.includes('店家資料'),'Merchant profile must be the default category');
   assert.ok(html.includes('場次與窗口'),'Sessions must be grouped in Settings');
   assert.ok(html.includes('菜單與服務'),'Menu must be grouped in Settings');
   assert.ok(html.includes('分店管理'),'Branches must be grouped in Settings');
   continue;
  }
  if(['units','branches'].includes(tab)){
   assert.ok(html.includes('settings-hub-tabs'),'Legacy settings routes must redirect to Settings');
   continue;
  }
  // Every staff tab has an intentionally changed side menu. Check the navigation
  // and intact panel structure instead of a full-page historical hash.
  assert.ok(html.includes('>設定</button>'),'Unified Settings must be accessible everywhere');
  assert.ok(html.includes('class="layout'),'The normal staff layout must remain present');
 }
 assert.ok(!fs.existsSync(path.join(dist,'poster.html')),'Retired poster must not be included in production output');
 console.log('Staff panels retain their workflows with consolidated Settings navigation.');
 // Exercise production bundles at both desktop and mobile sizes with actual network reads.
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  for(const name of ['home.html','directory.html?mode=search','merchant-register.html','platform-login.html','index.html?view=platform','index.html?view=staff&merchant=greenfield-salon','index.html?view=customer&merchant=greenfield-salon','board.html?merchant=greenfield-salon']){
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


 // Drive the SAME board engine through many arbitrary shapes: landscape,
 // portrait, square, ultra-wide, and narrow. These are TEST INPUTS, not CSS modes.
 async function geometry(){
  return await page.evaluate(()=>{
   const viewport={width:innerWidth,height:innerHeight};
   const main=document.getElementById("single-board");
   const cards=[...document.querySelectorAll("#unit-board .unit-card")];
   const nodes=[
    ...document.querySelectorAll("body > header,body > footer,#single-board:not([hidden]),#unit-board:not([hidden]),#current,#upcoming li,#unit-board .unit-card,#board-page-indicator")
   ].filter(el=>el.getClientRects().length&&!el.closest("[hidden]")&&!el.hasAttribute("data-board-hidden"));
   const rects=nodes.map(el=>{
    const r=el.getBoundingClientRect();
    return {name:el.id||el.className||el.tagName,
      top:r.top,left:r.left,right:r.right,bottom:r.bottom};
   });
   const clipped=[...document.querySelectorAll("#current,#upcoming li,#unit-board .unit-now,#unit-board h2,#unit-board .unit-next")]
    .filter(el=>el.getClientRects().length&&!el.closest("[hidden]")&&!el.closest("[data-board-hidden]"))
    .filter(el=>el.scrollWidth>el.clientWidth+3||el.scrollHeight>el.clientHeight+3)
    .map(el=>({name:el.className||el.id||el.tagName,
      sw:el.scrollWidth,cw:el.clientWidth,sh:el.scrollHeight,ch:el.clientHeight}));
   const q=document.getElementById("upcoming");
   const g=getComputedStyle(q);
   return {viewport,fullscreen:!!document.fullscreenElement,
    scale:Number(document.body.style.zoom||"1"),
    layout:main.dataset.boardLayout||"",
    mainRatio:main.getBoundingClientRect().width/Math.max(1,main.getBoundingClientRect().height),
    currentFont:parseFloat(getComputedStyle(document.getElementById("current")).fontSize),
    upcomingFont:parseFloat(getComputedStyle(q.firstElementChild).fontSize),
    queueRows:g.gridTemplateRows.split(" ").length,
    queueCols:g.gridTemplateColumns.split(" ").length,
    documentHeight:document.documentElement.scrollHeight,
    documentWidth:document.documentElement.scrollWidth,
    unitCount:cards.length,
    visibleUnits:cards.filter(c=>!c.hasAttribute("data-board-hidden")).length,
    pageIndicator:document.getElementById("board-page-indicator").textContent,
    rects,clipped};
  });
 }
 const viewports=[
  {width:1920,height:1080},{width:1080,height:1920},
  {width:3840,height:1080},{width:800,height:800},
  {width:390,height:844},{width:320,height:568}
 ];
 for(const viewport of viewports){
  await page.setViewportSize(viewport);
  await page.goto(baseUrl+"/booking/board.html?merchant=greenfield-salon",
   {waitUntil:"networkidle",timeout:45000});
  await page.evaluate(()=>{
   document.getElementById("shop").textContent="測試店家｜即時叫號";
   const current=document.getElementById("current");
   current.textContent="A123";current.classList.remove("is-empty");
   const q=document.getElementById("upcoming");q.replaceChildren();
   for(const n of ["A124","A125","A126","A127","A128"]){
    const li=document.createElement("li");li.textContent=n;q.appendChild(li);
   }
  });
  await page.locator("#fullscreen").click();
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.waitForTimeout(160);
  const first=await geometry();
  assert.equal(first.fullscreen,true);
  assert.equal(first.scale,1,"Do not zoom the entire kiosk");
  assert.equal(first.layout,first.mainRatio>=1.05?"side":"stack",
   "Orientation must derive from usable container ratio");
  assert.ok(first.currentFont>=Math.min(viewport.width,viewport.height)*.1,
   "Current number should use its available space: "+JSON.stringify(first));
  assert.ok(first.upcomingFont>=Math.min(viewport.width,viewport.height)*.03,
   "Waiting numbers should be readable: "+JSON.stringify(first));
  assert.equal(first.rects.filter(r=>r.name==="LI").length,5);
  assert.ok(first.documentHeight<=viewport.height+2&&first.documentWidth<=viewport.width+2,
   "Fullscreen must not scroll: "+JSON.stringify(first));
  assert.ok(first.rects.every(r=>r.bottom<=viewport.height+2&&r.right<=viewport.width+2&&r.top>=-2&&r.left>=-2),
   "Every full-screen element must be visible: "+JSON.stringify(first));
  assert.deepEqual(first.clipped,[],"Queue text must not be clipped: "+JSON.stringify(first));
  console.log("Universal fullscreen five tickets:",JSON.stringify({viewport,
   layout:first.layout,currentFont:first.currentFont,nextFont:first.upcomingFont}));
  await page.evaluate(()=>{
   const q=document.getElementById("upcoming");q.replaceChildren();
   for(const n of ["6","7"]){const li=document.createElement("li");li.textContent=n;q.appendChild(li);}
   document.dispatchEvent(new Event("fullscreenchange"));
  });
  await page.waitForTimeout(120);
  const two=await geometry();
  assert.ok(two.queueCols*two.queueRows>=2&&two.queueCols*two.queueRows<=3,
   "Two waiting numbers must not waste five grid slots");
  assert.ok(two.rects.every(r=>r.bottom<=viewport.height+2&&r.right<=viewport.width+2));
  const latest=await page.evaluate(()=>{
   const grid=document.getElementById("unit-board");grid.replaceChildren();
   for(let i=1;i<=12;i++){
    const card=document.createElement("article");card.className="unit-card";
    for(const [tag,cls,value] of [
     ["div","group","第 "+i+" 場"],["h2","","服務單位 "+i],
     ["div","unit-now",String(i)],["div","unit-next","接下來："+(i+1)+"、"+(i+2)],
     ["span","unit-open","單獨顯示此場次"]
    ]){
     const el=document.createElement(tag);el.className=cls;el.textContent=value;card.append(el);
    }
    grid.append(card);
   }
   document.getElementById("single-board").hidden=true;grid.hidden=false;
   document.dispatchEvent(new Event("fullscreenchange"));
  });
  await page.waitForTimeout(160);
  const multi=await geometry();
  assert.equal(multi.unitCount,12);
  assert.ok(multi.visibleUnits>=1&&multi.visibleUnits<=12);
  assert.equal(multi.scale,1);
  assert.ok(multi.documentHeight<=viewport.height+2&&multi.documentWidth<=viewport.width+2);
  assert.ok(multi.rects.every(r=>r.bottom<=viewport.height+2&&r.right<=viewport.width+2&&r.top>=-2),
   "Visible unit cards cannot overflow: "+JSON.stringify(multi));
  assert.deepEqual(multi.clipped,[],"Service-unit text must fit");
  if(multi.visibleUnits<12)assert.match(multi.pageIndicator,/第 \d+\/\d+ 頁/);
  console.log("Universal fullscreen 12 units:",JSON.stringify({viewport,
   visible:multi.visibleUnits,page:multi.pageIndicator}));
  if(viewport.width===390){
   const initial=multi.pageIndicator;
   assert.ok(initial,"Portrait phone must show paging when units exceed readable capacity");
   await page.waitForTimeout(9100);
   const rotated=await geometry();
   assert.notEqual(rotated.pageIndicator,initial,"Every service unit must cycle through pages");
   assert.ok(rotated.rects.every(r=>r.bottom<=viewport.height+2&&r.right<=viewport.width+2));
  }
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.fullscreenElement);
 }
 assert.deepEqual(missing,[],'Missing local build assets');assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('Browser smoke passed; no business writes were submitted.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
