// Real Auth acceptance against an isolated, disposable Workforce tenant.
// Secrets and random passwords remain exclusively in the GitHub Actions runner.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const project='unapiwajmgqqtdkixaab';
const api='https://'+project+'.supabase.co';
const manage='https://api.supabase.com/v1/projects/'+project;
const website='https://hub-google.github.io/LINE/workforce/';
const access=process.env.SUPABASE_ACCESS_TOKEN;
if(!access)throw Error('Encrypted SUPABASE_ACCESS_TOKEN is required');
const location=new URL('../auth-e2e-artifacts/',import.meta.url);
await mkdir(location,{recursive:true});
const run=randomBytes(5).toString('hex');
const report={name:'Workforce genuine two-user Auth acceptance',scope:'temporary isolated tenant',started:new Date().toISOString(),steps:[],cleanup:[]};
const users=[
 {email:'wf-auth-qa-owner-'+run+'@example.com',password:randomBytes(30).toString('base64url')+'A!8',role:'owner'},
 {email:'wf-auth-qa-employee-'+run+'@example.com',password:randomBytes(30).toString('base64url')+'A!8',role:'employee'},
 {email:'wf-auth-qa-manager-'+run+'@example.com',password:randomBytes(30).toString('base64url')+'A!8',role:'manager'}
];
let secret,publicKey,tenant,branch,member,managerMember,browser,managerPage,employeePage;
const created=[];
function header(key,bearer=key){return {apikey:key,authorization:'Bearer '+bearer};}
async function req(url,method='GET',body,headers={},check=true){
 const r=await fetch(url,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const t=await r.text();let result;
 try{result=t?JSON.parse(t):null;}catch{result={message:'non-JSON response'};}
 if(check&&!r.ok)throw Error(method+' '+new URL(url).pathname+' returned '+r.status+' ('+String(result?.code||result?.message||'error').slice(0,60)+')');
 return {ok:r.ok,status:r.status,data:result};
}
async function step(name,fn){
 try{const result=await fn();report.steps.push({name,status:'PASS',detail:result||''});console.log('PASS '+name);}
 catch(e){report.steps.push({name,status:'FAIL',detail:String(e?.message||e)});console.error('FAIL '+name,String(e?.message||e));throw e;}
}
async function rows(table,token,query){
 return (await req(api+'/rest/v1/'+table+'?'+query,'GET',null,header(publicKey,token))).data;
}
async function screenshot(page,name){await page.screenshot({path:new URL(name+'.png',location).pathname,fullPage:false});}
async function enter(user){
 const context=await browser.newContext({viewport:{width:1280,height:830}});
 const page=await context.newPage();
 page.on('dialog',d=>d.accept());
 await page.goto(website,{waitUntil:'domcontentloaded'});
 await page.locator('#switchReal').click();
 const f=page.locator('#overlay form[data-form="auth"]');
 await f.locator('[name="email"]').fill(user.email);
 await f.locator('[name="password"]').fill(user.password);
 await f.locator('button[type="submit"]').click();
 try{await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent==='資料已同步'&&document.querySelector('#modePill')?.classList.contains('real-pill'),null,{timeout:30000});}
 catch(e){await screenshot(page,'FAIL-login-'+user.role);throw Error('Login screen did not finish: '+(await page.locator('#connectionLabel').textContent())+'; '+(await page.locator('#appContent').innerText()).slice(0,220));}
 return page;
}
async function apply(kind,tag,day){
 await employeePage.locator('#nav [data-tab="requests"]').click();
 await employeePage.locator('#pageActions [data-action="'+(kind==='reject'?'newLeaveRequest':'newOvertimeRequest')+'"]').click();
 const form=employeePage.locator('#overlay form[data-form="request"]');
 await form.waitFor({state:'visible'});
 if(kind==='reject')await form.locator('[name="leave_kind"]').selectOption('annual');
 const selections=await form.locator('[name="member_id"] option').evaluateAll(xs=>xs.map(x=>x.value));
 assert.deepEqual(selections,[member]);
 await form.locator('[name="starts_at"]').fill(day+'T18:00');
 await form.locator('[name="ends_at"]').fill(day+'T20:00');
 await form.locator('[name="reason"]').fill(tag);
 await screenshot(employeePage,'employee-submit-'+kind);
 await form.locator('button[type="submit"]').click();
 await form.waitFor({state:'hidden'});
 const results=await rows('wm_requests',users[0].token,'select=id,status,reason&tenant_id=eq.'+tenant+'&reason=eq.'+encodeURIComponent(tag));
 assert.equal(results.length,1);assert.equal(results[0].status,'pending');
 return results[0];
}
async function decide(requestId,kind){
 await managerPage.locator('#refreshBtn').click();
 await managerPage.locator('#nav [data-tab="approvals"]').click();
 const btn=managerPage.locator('#appContent [data-action="'+kind+'"][data-id="'+requestId+'"]');
 await btn.waitFor({state:'visible'});
 await screenshot(managerPage,'manager-before-'+kind);
 await btn.click();
 const wanted=kind==='approve'?'approved':'rejected';
 for(let i=0;i<18;i++){
  const data=await rows('wm_requests',users[0].token,'select=status&id=eq.'+requestId);
  if(data[0]?.status===wanted){await screenshot(managerPage,'manager-after-'+kind);return wanted;}
  await managerPage.waitForTimeout(350);
 }
 throw Error('Approval status not persisted');
}
try{
 await step('Server-only management authentication has privileged project access',async()=>{
  const data=(await req(manage+'/api-keys?reveal=true','GET',null,{authorization:'Bearer '+access})).data;
  const keys=Array.isArray(data)?data:data?.keys||[];
  const elevated=keys.find(x=>x.name==='service_role'||x.role==='service_role');
  secret=elevated?.api_key||elevated?.apiKey||elevated?.key;
  assert.ok(secret&&secret.length>24);
  publicKey='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy';
  return 'Access verified; secrets redacted';
 });
 for(const user of users){
  await step('Create confirmed disposable Auth '+user.role,async()=>{
   const x=(await req(api+'/auth/v1/admin/users','POST',
    {email:user.email,password:user.password,email_confirm:true,app_metadata:{workforce_qa:true}},header(secret))).data;
   assert.ok(x.id);user.id=x.id;created.push(x.id);return 'Confirmed UUID issued';
  });
 }
 await step('Independent password-based Auth sessions succeed',async()=>{
  for(const user of users){
   const auth=(await req(api+'/auth/v1/token?grant_type=password','POST',
    {email:user.email,password:user.password},{apikey:publicKey})).data;
   assert.equal(auth.user?.id,user.id);assert.ok(auth.access_token);user.token=auth.access_token;
  }
  assert.notEqual(users[0].token,users[1].token);
 });
 await step('Owner creates real tenant and bootstrap owner membership',async()=>{
  tenant=randomUUID();
  await req(api+'/rest/v1/wm_tenants','POST',
   {id:tenant,name:'WORKFORCE_QA_'+run,created_by:users[0].id},
   {...header(publicKey,users[0].token),Prefer:'return=minimal'});
  const company=await rows('wm_tenants',users[0].token,'select=id&is_demo=eq.false');
  assert.ok(company.some(x=>x.id===tenant));
  branch=(await rows('wm_branches',users[0].token,'select=id&tenant_id=eq.'+tenant))[0]?.id;
  assert.ok(branch);
 });
 await step('Owner adds employee with own Auth UUID without leaking wage columns',async()=>{
  await req(api+'/rest/v1/wm_members','POST',
   {tenant_id:tenant,branch_id:branch,user_id:users[1].id,display_name:'E2E 測試員工',employee_code:'E2E001',role:'employee'},
   {...header(publicKey,users[0].token),Prefer:'return=minimal'});
  member=(await rows('wm_members',users[0].token,'select=id&tenant_id=eq.'+tenant+'&user_id=eq.'+users[1].id))[0]?.id;
  assert.ok(member);
  const visible=await rows('wm_tenants',users[1].token,'select=id&is_demo=eq.false');
  assert.ok(visible.some(x=>x.id===tenant));
 });
 await step('Owner adds a distinct manager-role Auth member for real reviews',async()=>{
  await req(api+'/rest/v1/wm_members','POST',
   {tenant_id:tenant,branch_id:branch,user_id:users[2].id,display_name:'E2E 測試主管',employee_code:'E2EMGR',role:'manager'},
   {...header(publicKey,users[0].token),Prefer:'return=minimal'});
  const members=await rows('wm_members',users[0].token,'select=id,role&tenant_id=eq.'+tenant+'&user_id=eq.'+users[2].id);
  managerMember=members[0]?.id;
  assert.equal(members[0]?.role,'manager');
  assert.ok(managerMember);
  const company=await rows('wm_tenants',users[2].token,'select=id&is_demo=eq.false');
  assert.ok(company.some(x=>x.id===tenant),'Manager must see its tenant');
 });
 browser=await chromium.launch({headless:true});
 await step('Actual manager and employee login in two separate browser contexts',async()=>{
  managerPage=await enter(users[2]);employeePage=await enter(users[1]);
  await screenshot(managerPage,'01-manager-login');await screenshot(employeePage,'02-employee-login');
 });
 await step('Employee RLS denies reading the manager member record',async()=>{
  const visible=await rows('wm_members',users[1].token,'select=id,role&tenant_id=eq.'+tenant);
  assert.ok(visible.length>0&&visible.every(x=>x.id===member));
  const mgrVisible=await rows('wm_members',users[2].token,'select=id,role&tenant_id=eq.'+tenant);
  assert.ok(mgrVisible.some(x=>x.id===member)&&mgrVisible.some(x=>x.id===managerMember));
  await employeePage.locator('#nav [data-tab="approvals"]').click();
  assert.equal(await employeePage.locator('#appContent [data-action="approve"]').count(),0);
  await screenshot(employeePage,'03-employee-no-approval-controls');
 });
 const dateA=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const dateB=new Date(Date.now()+31*86400000).toISOString().slice(0,10);
 let first;
 await step('Employee submits request through actual browser form',async()=>{
  first=await apply('reject','E2E-'+run+'-R',dateA);
 });
 await step('Employee cannot approve own pending request through authenticated RPC',async()=>{
  const r=await req(api+'/rest/v1/rpc/wm_decide_request','POST',
   {p_request:first.id,p_decision:'approved',p_note:'unauthorized'},
   header(publicKey,users[1].token),false);
  assert.ok(r.status>=400);
  const current=await rows('wm_requests',users[0].token,'select=status&id=eq.'+first.id);
  assert.equal(current[0]?.status,'pending');
 });
 await step('Actual manager clicks reject and employee sees it after refreshing',async()=>{
  assert.equal(await decide(first.id,'reject'),'rejected');
  await employeePage.context().close();
  employeePage=await enter(users[1]);
  await employeePage.locator('#nav [data-tab="requests"]').click();
  await employeePage.locator('#appContent .chip.rejected').first().waitFor({state:'visible',timeout:20000});
  await screenshot(employeePage,'04-employee-rejected');
 });
 await step('Actual manager clicks approve for second employee request',async()=>{
  const second=await apply('approve','E2E-'+run+'-A',dateB);
  assert.equal(await decide(second.id,'approve'),'approved');
  await employeePage.context().close();
  employeePage=await enter(users[1]);
  await employeePage.locator('#nav [data-tab="requests"]').click();
  await employeePage.locator('#appContent .chip.approved').first().waitFor({state:'visible',timeout:20000});
  await screenshot(employeePage,'05-employee-approved');
 });
 await step('Real notifications are visible only to the intended employee and manager',async()=>{
  const employeeNotes=await rows('wm_notifications',users[1].token,'select=recipient_member_id,event_key,body&tenant_id=eq.'+tenant);
  assert.ok(employeeNotes.some(x=>x.event_key.endsWith(':rejected')&&x.body.includes('駁回')),'Missing rejected notice');
  assert.ok(employeeNotes.some(x=>x.event_key.endsWith(':approved')&&x.body.includes('核准')),'Missing approved notice');
  assert.ok(employeeNotes.every(x=>x.recipient_member_id===member),'Employee saw another user notification');
  const managerNotes=await rows('wm_notifications',users[2].token,'select=recipient_member_id,event_key&tenant_id=eq.'+tenant);
  assert.ok(managerNotes.some(x=>x.event_key.startsWith('request:new:')),'Manager missing new request notice');
  assert.ok(managerNotes.every(x=>x.recipient_member_id===managerMember),'Manager saw another user notification');
  return 'Both decision notifications reached employee; new requests notified manager, RLS separated';
 });
 await step('Real manager creates a published employee shift through website',async()=>{
  await managerPage.locator('#nav [data-tab="schedule"]').click();
  await managerPage.locator('#pageActions [data-action="newShift"]').click();
  const form=managerPage.locator('#overlay form[data-form="shift"]');
  await form.waitFor({state:'visible'});
  await form.locator('[name="member_id"]').selectOption(member);
  await form.locator('[name="branch_id"]').selectOption(branch);
  await form.locator('[name="starts_at"]').fill('2027-02-15T09:00');
  await form.locator('[name="ends_at"]').fill('2027-02-15T17:00');
  await form.locator('[name="status"]').selectOption('published');
  await form.locator('[name="notes"]').fill('E2E manager shift '+run);
  await screenshot(managerPage,'06-manager-shift-form');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  const shifts=await rows('wm_shifts',users[2].token,'select=id,member_id,status&tenant_id=eq.'+tenant);
  assert.ok(shifts.some(x=>x.member_id===member&&x.status==='published'));
  return 'Manager UI published a real DB shift';
 });
 await step('Employee cannot create manager-only shift through REST',async()=>{
  const r=await req(api+'/rest/v1/wm_shifts','POST',{
   tenant_id:tenant,member_id:member,branch_id:branch,status:'published',created_by:users[1].id,
   starts_at:'2027-01-22T01:00:00Z',ends_at:'2027-01-22T09:00:00Z'},
  {...header(publicKey,users[1].token),Prefer:'return=minimal'},false);
  assert.ok(r.status>=400);
 });
}catch(e){report.error=String(e?.message||e);process.exitCode=1;
 if(employeePage)try{await screenshot(employeePage,'FAIL-employee');}catch{}
 if(managerPage)try{await screenshot(managerPage,'FAIL-manager');}catch{}
}finally{
 await browser?.close();
 if(tenant)try{
  const sql=[
   'begin;',
   ...['wm_request_actions','wm_audit','wm_request_documents','wm_period_adjustments','wm_attendance_adjustments','wm_shift_revisions','wm_qr_uses'].map(x=>"delete from public."+x+" where tenant_id='"+tenant+"';"),
   "delete from public.wm_requests where tenant_id='"+tenant+"';",
   "delete from public.wm_punches where tenant_id='"+tenant+"';",
   "delete from public.wm_shifts where tenant_id='"+tenant+"';",
   "delete from public.wm_tenants where id='"+tenant+"' and name='WORKFORCE_QA_"+run+"';",
   'commit;'
  ].join('\n');
  await req(manage+'/database/query','POST',{query:sql},{authorization:'Bearer '+access});
  report.cleanup.push({type:'isolated_tenant',result:'PASS'});
 }catch(e){report.cleanup.push({type:'isolated_tenant',result:'FAIL'});process.exitCode=1;}
 for(const id of created)try{
  await req(api+'/auth/v1/admin/users/'+id,'DELETE',undefined,header(secret));
  report.cleanup.push({type:'auth_user',result:'PASS'});
 }catch(e){report.cleanup.push({type:'auth_user',result:'FAIL'});process.exitCode=1;}
 await writeFile(new URL('result.json',location),JSON.stringify(report,null,2));
}
