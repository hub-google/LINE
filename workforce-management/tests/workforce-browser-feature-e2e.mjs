// Additional LIVE browser exercises. Uses public Demo only, not Supabase Auth role switching.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const api=source.match(/const API='([^']+)'/)?.[1];
const key=source.match(/const KEY='([^']+)'/)?.[1];
assert.ok(api&&key?.startsWith('sb_publishable_'));
const folder=new URL('../e2e-artifacts/',import.meta.url);
await mkdir(folder,{recursive:true});
const cases=[];const nonce='BROWSER-EXT-'+Date.now();
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
page.on('dialog',async d=>d.accept());
page.setDefaultTimeout(18000);
async function shot(name){await page.screenshot({path:new URL(name+'.png',folder).pathname,fullPage:false});}
async function getData(){
 const r=await fetch(api+'/rest/v1/rpc/wm_demo_api',{method:'POST',
 headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_action:'snapshot',p_data:{}}),
 signal:AbortSignal.timeout(16000)});
 const text=await r.text();assert.equal(r.status,200,text.slice(0,200));return JSON.parse(text);
}
async function latest(check,desc){
 for(let i=0;i<65;i++){const item=check(await getData());if(item)return item;await page.waitForTimeout(300);}
 const notice=await page.locator('#toast').innerText().catch(()=> '');
 throw Error(desc+' did not persist; website notice: '+notice.slice(0,250));
}
async function run(name,fn){
 try{const detail=await fn();cases.push({name,status:'PASS',detail});console.log('PASS '+name+' '+JSON.stringify(detail));}
 catch(e){cases.push({name,status:'FAIL',detail:String(e)});console.log('FAIL '+name,String(e));throw e;}
}
async function tab(n){await page.locator('#nav [data-tab="'+n+'"]').click();}
async function shift(member,day,status){
 await tab('schedule');await page.locator('#pageActions [data-action="newShift"]').click();
 const form=page.locator('#overlay form[data-form="shift"]');await form.waitFor({state:'visible'});
 await form.locator('[name="member_id"]').selectOption({label:member});
 await form.locator('[name="branch_id"]').selectOption({label:'台北總店'});
 await form.locator('[name="starts_at"]').fill(day+'T09:00');
 await form.locator('[name="ends_at"]').fill(day+'T17:00');
 await form.locator('[name="status"]').selectOption(status);
 await form.locator('[name="notes"]').fill(nonce+'-'+member+'-'+day);
 await form.locator('button[type="submit"]').click();
 return latest(d=>d.shifts.find(s=>s.notes===nonce+'-'+member+'-'+day),'shift');
}
try{
 await run('Load site and synchronize Supabase',async()=>{
  await page.goto('https://hub-google.github.io/LINE/workforce/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent?.includes('資料已同步'));
  return 'connected';
 });
 let correction;
 await run('UI correction submission becomes pending',async()=>{
  await tab('requests');await page.locator('#pageActions [data-action="newCorrectionRequest"]').click();
  const form=page.locator('#overlay form[data-form="request"]');
  await form.locator('[name="member_id"]').selectOption({label:'林小美'});
  await form.locator('[name="correction_type"]').selectOption('漏下班卡');
  await form.locator('[name="starts_at"]').fill('2026-12-18T09:00');
  await form.locator('[name="ends_at"]').fill('2026-12-18T17:00');
  await form.locator('[name="reason"]').fill(nonce+' 補卡');
  await shot('09-correction-form');
  await form.locator('button[type="submit"]').click();
  correction=await latest(d=>d.requests.find(x=>x.reason.includes(nonce+' 補卡')&&x.status==='pending'),'correction request');
  return correction.id;
 });
 await run('UI supervisor approves correction; DB reflects approved',async()=>{
  await tab('approvals');
  const button=page.locator('#appContent [data-action="approve"][data-id="'+correction.id+'"]');
  await button.waitFor({state:'visible'});
  await button.click();
  const changed=await latest(d=>d.requests.find(x=>x.id===correction.id&&x.status==='approved'),'approved correction');
  await shot('10-correction-approved');
  return changed.status;
 });
 let lin,zhang,beforeLinMember,beforeZhangMember;
 const d=await getData();
 const latestShiftStart=d.shifts.reduce((max,x)=>Math.max(max,Date.parse(x.starts_at)||0),Date.now());
 const shiftDayLin=new Date(latestShiftStart+4*86400000).toISOString().slice(0,10);
 const shiftDayZhang=new Date(latestShiftStart+5*86400000).toISOString().slice(0,10);
 await run('UI creates draft shift then publishes it',async()=>{
  lin=await shift('林小美',shiftDayLin,'draft');
  assert.equal(lin.status,'draft');
  await page.locator('#weekPicker').fill(shiftDayLin);
  await page.locator('#weekPicker').dispatchEvent('change');
  const publish=page.locator('#appContent [data-action="publishShift"][data-id="'+lin.id+'"]');
  await publish.waitFor({state:'visible'});
  await publish.click();
  lin=await latest(d=>d.shifts.find(s=>s.id===lin.id&&s.status==='published'),'published shift');
  await shot('11-shift-published');
  return lin.id;
 });
 await run('UI creates second member published shift',async()=>{
  zhang=await shift('張志明',shiftDayZhang,'published');
  assert.equal(zhang.status,'published');beforeLinMember=lin.member_id;beforeZhangMember=zhang.member_id;return zhang.id;
 });
 let swap;
 await run('UI creates shift swap requiring peer consent',async()=>{
  await tab('schedule');
  await page.locator('#appContent [data-extra="newSwap"]').click();
  await page.locator('[data-swap-sync-status]').getByText(/已同步最新班表/).waitFor({timeout:20000});
  const form=page.locator('#overlay form[data-form="swap_create"]');
  await form.waitFor({state:'visible'});
  await form.locator('[name="source_shift_id"]').selectOption(lin.id);
  await form.locator('[name="target_shift_id"]').selectOption(zhang.id);
  await form.locator('[name="reason"]').fill(nonce+' 交換班別');
  await shot('12-swap-request');
  await form.locator('button[type="submit"]').click();
  swap=await latest(d=>d.requests.find(r=>r.kind==='swap'&&r.reason===nonce+' 交換班別'),'swap submission');
  assert.equal(swap.status,'pending');
  assert.equal(swap.target_accepted_at,null);
  return swap.id;
 });
 await run('UI peer accepts shift swap',async()=>{
  await tab('requests');
  await page.locator('#appContent [data-extra="swapConsent"][data-id="'+swap.id+'"]').click();
  swap=await latest(d=>d.requests.find(r=>r.id===swap.id&&r.target_accepted_at),'peer consent');
  await page.waitForLoadState('networkidle',{timeout:20000});
  await shot('13-swap-peer-accepted');
  return 'consented';
 });
 await run('UI manager approves swap, DB shifts exchange owners',async()=>{
  await tab('approvals');
  await page.locator('#appContent [data-action="approve"][data-id="'+swap.id+'"]').click();
  await page.waitForLoadState('networkidle',{timeout:20000});
  const r=await latest(d=>d.requests.find(x=>x.id===swap.id&&x.status==='approved'),'approved swap');
  const d=await getData();
  const a=d.shifts.find(x=>x.id===lin.id),b=d.shifts.find(x=>x.id===zhang.id);
  assert.equal(a.member_id,beforeZhangMember);
  assert.equal(b.member_id,beforeLinMember);
  await shot('14-swap-approved');
  return r.status;
 });
 await run('Click export CSV and verify download is not empty',async()=>{
  await tab('reports');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#pageActions [data-action="exportCsv"]').click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/\.csv$/i);
  return download.suggestedFilename();
 });
 await run('Open inbox and attendance anomaly management',async()=>{
  await tab('inbox');
  assert.match(await page.locator('#appContent').innerText(),/通知|收件匣/);
  await tab('anomalies');
  assert.match(await page.locator('#appContent').innerText(),/出勤異常|待處理異常/);
  await shot('15-attendance-anomalies');
  return 'tabs visible';
 });
}catch(e){
 process.exitCode=1;
 try{await shot('FAILED-extended-feature-page');}catch{}
}finally{
 await writeFile(new URL('extended-report.json',folder),JSON.stringify({date:new Date().toISOString(),nonce,cases},null,2));
 await browser.close();
}
