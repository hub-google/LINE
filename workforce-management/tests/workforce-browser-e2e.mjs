// Browser acceptance test: real clicks on the deployed Workforce GitHub Pages app.
// Real Supabase public-DEMO tenant only; NOT proof of employee/manager Auth RLS.
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const api=source.match(/const API='([^']+)'/)?.[1];
const key=source.match(/const KEY='([^']+)'/)?.[1];
assert.ok(api&&key?.startsWith('sb_publishable_'));
const site=process.env.WORKFORCE_URL||'https://hub-google.github.io/LINE/workforce/';
const output=new URL('../e2e-artifacts/',import.meta.url);
await mkdir(output,{recursive:true});
const steps=[];
const uid='BROWSER-QA-'+Date.now();
let browser,page;
async function screenshot(name){await page.screenshot({path:new URL(name+'.png',output).pathname,fullPage:true});}
async function snapshot(){
 const r=await fetch(api+'/rest/v1/rpc/wm_demo_api',{method:'POST',
  headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_action:'snapshot',p_data:{}}),
  signal:AbortSignal.timeout(20000)});
 const body=await r.text();
 assert.equal(r.status,200,'Snapshot HTTP '+r.status+': '+body.slice(0,300));
 return JSON.parse(body);
}
async function check(name,fn){
 try{const v=await fn();steps.push({name,result:'PASS',detail:v||''});console.log('PASS '+name);}
 catch(e){steps.push({name,result:'FAIL',detail:String(e?.stack||e)});console.error('FAIL '+name,e);throw e;}
}
async function tab(name){
 await page.locator('#nav [data-tab="'+name+'"]').click();
 await page.waitForTimeout(250);
}
async function waitForReq(id,status){
 for(let i=0;i<35;i++){
  const r=(await snapshot()).requests.find(x=>x.id===id);
  if(r?.status===status)return r;
  await page.waitForTimeout(250);
 }
 throw Error('Request '+id+' did not become '+status);
}
async function submit(kind,reason,date,start,end){
 await tab('requests');
 const action={leave:'newLeaveRequest',overtime:'newOvertimeRequest',correction:'newCorrectionRequest'}[kind];
 await page.locator('#pageActions [data-action="'+action+'"]').click();
 const form=page.locator('#overlay form[data-form="request"]');
 await form.waitFor({state:'visible'});
 assert.equal(await form.getAttribute('data-request-kind'),kind);
 await form.locator('[name="member_id"]').selectOption({label:'林小美'});
 if(kind==='leave')await form.locator('[name="leave_kind"]').selectOption('annual');
 await form.locator('[name="starts_at"]').fill(date+'T'+start);
 await form.locator('[name="ends_at"]').fill(date+'T'+end);
 await form.locator('[name="reason"]').fill(reason);
 await screenshot('02-'+kind+'-filled');
 await form.locator('button[type="submit"]').click();
 await page.waitForFunction(value=>document.querySelector('#appContent')?.textContent?.includes(value),reason,{timeout:20000});
 const request=(await snapshot()).requests.find(x=>x.reason.includes(reason));
 assert.ok(request,'No DB request for '+reason);
 assert.equal(request.status,'pending');
 return request;
}
async function review(id,kind){
 await tab('approvals');
 const btn=page.locator('#appContent [data-action="'+kind+'"][data-id="'+id+'"]');
 await btn.waitFor({state:'visible'});
 await screenshot('03-before-'+kind);
 await btn.click();
 const expected=kind==='reject'?'rejected':'approved';
 const item=await waitForReq(id,expected);
 await page.waitForTimeout(600);
 await screenshot('04-after-'+kind);
 assert.equal(await page.locator('#appContent [data-action="'+kind+'"][data-id="'+id+'"]').count(),0);
 return item;
}
try{
 browser=await chromium.launch({headless:true});
 page=await browser.newPage({viewport:{width:1365,height:900},deviceScaleFactor:1});
 page.on('dialog',async d=>d.accept());
 page.setDefaultTimeout(20000);
 await check('Public GitHub Pages loads and Supabase live demo connects',async()=>{
  const res=await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(res.status(),200,'Site HTTP '+res.status());
  await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent?.includes('資料已同步'),null,{timeout:30000});
  assert.ok((await snapshot()).members.length>=5);
  await screenshot('01-overview');
 });
 let leave;
 await check('Employee UI: fill and submit leave; DB pending',async()=>{
  leave=await submit('leave',uid+'-REJECT','2026-12-15','09:00','10:00');
  await screenshot('03-submitted-leave');
  return leave.id;
 });
 await check('Manager UI: click reject; DB rejected; button gone',async()=>{
  const item=await review(leave.id,'reject');
  await tab('requests');
  assert.match(await page.locator('#appContent').innerText(),/已駁回/);
  await screenshot('05-employee-views-rejection');
  return item.status;
 });
 await check('Duplicate reject is blocked by live API',async()=>{
  const res=await fetch(api+'/rest/v1/rpc/wm_demo_api',{method:'POST',
   headers:{apikey:key,'Content-Type':'application/json'},
   body:JSON.stringify({p_action:'decide',p_data:{id:leave.id,status:'rejected',note:'duplicate QA'}}),
   signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,400);
  assert.match(await res.text(),/already decided|已處理/i);
  return 'HTTP 400 expected';
 });
 let overtime;
 await check('Employee UI: submit overtime; DB pending',async()=>{
  overtime=await submit('overtime',uid+'-APPROVE','2026-12-16','18:00','20:00');
  return overtime.id;
 });
 await check('Manager UI: click approve; DB approved',async()=>{
  return (await review(overtime.id,'approve')).status;
 });
 await check('Punch IN using UI; new Supabase record exists',async()=>{
  const before=(await snapshot()).punches.length;
  await tab('punch');
  await page.locator('#punchMember').selectOption({label:'林小美'});
  await page.locator('#appContent [data-action="clock"][data-kind="IN"]').click();
  for(let i=0;i<20;i++){
   const n=(await snapshot()).punches.length;
   if(n>before){await screenshot('06-clock');return 'DB punches '+before+' -> '+n;}
   await page.waitForTimeout(350);
  }
  throw Error('Punch button did not generate a Supabase record');
 });
 await check('Mobile request form can be opened',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#menuToggle').click();
  await page.locator('#nav [data-tab="requests"]').click();
  await page.locator('#pageActions [data-action="newOvertimeRequest"]').click();
  await page.locator('#overlay form[data-form="request"]').waitFor({state:'visible'});
  await screenshot('07-mobile-request');
  return '390px viewport';
 });
}catch(e){
 if(page)try{await screenshot('FAILED-page');}catch{}
 process.exitCode=1;
}finally{
 await writeFile(new URL('report.json',output),JSON.stringify({date:new Date().toISOString(),mode:'public demo real browser + Supabase API (no Auth role switching)',site,uid,steps},null,2));
 if(browser)await browser.close();
}
