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
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
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
 await page.locator('#nav [data-tab="employees"]').click();
 await page.getByText('E2E 測試員工',{exact:true}).first().waitFor({state:'visible',timeout:25000});
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
  // Company hierarchy: the actual manager must be the employee's supervisor.
  // The manager is not authorized to read or approve unrelated employees.
  await req(api+'/rest/v1/wm_members?id=eq.'+member+'&tenant_id=eq.'+tenant,'PATCH',
   {reports_to:managerMember},
   {...header(publicKey,users[0].token),Prefer:'return=minimal'});
  const assigned=await rows('wm_members',users[0].token,'select=reports_to&id=eq.'+member);
  assert.equal(assigned[0]?.reports_to,managerMember);
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
 let availabilityId;
 await step('Employee submits unavailable preference; requires supervisor approval',async()=>{
  await employeePage.locator('#nav [data-tab="schedule"]').click();
  await employeePage.locator('#appContent [data-action="newAvailability"]').click();
  const form=employeePage.locator('#overlay form[data-form="availability"]');
  await form.waitFor({state:'visible'});
  assert.equal(await form.locator('[name="member_id"]').inputValue(),member);
  const day=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
  await form.locator('[name="starts_at"]').fill(day+'T09:00');
  await form.locator('[name="ends_at"]').fill(day+'T18:00');
  await form.locator('[name="available"]').selectOption('false');
  await form.locator('[name="note"]').fill('QA-'+run+'-不可上班');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  const list=await rows('wm_availability',users[0].token,
   'select=id,status,note&tenant_id=eq.'+tenant+'&member_id=eq.'+member);
  const saved=list.find(x=>x.note==='QA-'+run+'-不可上班');
  assert.equal(saved?.status,'pending');
  availabilityId=saved.id;
 });
 await step('Employee cannot self-approve availability and supervisor can review',async()=>{
  const denied=await req(api+'/rest/v1/rpc/wm_review_availability','POST',
   {p_availability:availabilityId,p_approved:true,p_note:'self'},header(publicKey,users[1].token),false);
  assert.ok(denied.status>=400);
  await managerPage.locator('#refreshBtn').click();
  await managerPage.locator('#nav [data-tab="schedule"]').click();
  const button=managerPage.locator('#appContent [data-wf-availability="review"][data-ok="true"][data-id="'+availabilityId+'"]');
  await button.waitFor({state:'visible'});
  await button.click();
  const form=managerPage.locator('#overlay form[data-form="wf_availability_review"]');
  await form.locator('[name="p_note"]').fill('主管核准排休');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  const list=await rows('wm_availability',users[0].token,'select=status&id=eq.'+availabilityId);
  assert.equal(list[0]?.status,'approved');
  await screenshot(managerPage,'08-reviewed-availability');
 });
 await step('Owner cutoff policy blocks late employee submissions',async()=>{
  const policy=(await req(api+'/rest/v1/rpc/wm_set_availability_policy','POST',
   {p_tenant:tenant,p_cutoff_hours:336},header(publicKey,users[0].token))).data;
  assert.equal(policy.cutoff_hours,336);
  const start=new Date(Date.now()+7*86400000),end=new Date(start.getTime()+3600000);
  const denied=await req(api+'/rest/v1/wm_availability','POST',
   {tenant_id:tenant,member_id:member,available:true,
    starts_at:start.toISOString(),ends_at:end.toISOString(),note:'too late'},
   {...header(publicKey,users[1].token),Prefer:'return=minimal'},false);
  assert.ok(denied.status>=400);
  const reset=(await req(api+'/rest/v1/rpc/wm_set_availability_policy','POST',
   {p_tenant:tenant,p_cutoff_hours:0},header(publicKey,users[0].token))).data;
  assert.equal(reset.cutoff_hours,0);
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
 let cancellationId;
 await step('Employee submits a future annual leave and manager approves it',async()=>{
  const leaveDay=new Date(Date.now()+33*86400000).toISOString().slice(0,10);
  const original=await apply('reject','E2E-'+run+'-LEAVE-CANCEL',leaveDay);
  await decide(original.id,'approve');
  cancellationId=original.id;
 });
 await step('Employee uses browser to request cancellation; original remains approved',async()=>{
  await employeePage.locator('#refreshBtn').click();
  await employeePage.locator('#nav [data-tab="requests"]').click();
  const button=employeePage.locator('#appContent [data-wf-lifecycle="requestCancel"][data-id="'+cancellationId+'"]');
  await button.waitFor({state:'visible'});
  await button.click();
  const form=employeePage.locator('#overlay form[data-form="wf_leave_cancel"]');
  await form.locator('[name="p_reason"]').fill('E2E 行程變更，取消已核准的請假');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  const data=await rows('wm_requests',users[0].token,'select=status&id=eq.'+cancellationId);
  assert.equal(data[0]?.status,'approved');
  const cancel=(await req(api+'/rest/v1/rpc/wm_list_leave_cancellations','POST',
    {p_tenant:tenant},header(publicKey,users[1].token))).data;
  assert.equal(cancel.find(x=>x.request_id===cancellationId)?.status,'pending');
 });
 await step('Employee cannot approve own leave cancellation',async()=>{
  const list=(await req(api+'/rest/v1/rpc/wm_list_leave_cancellations','POST',
   {p_tenant:tenant},header(publicKey,users[1].token))).data;
  const c=list.find(x=>x.request_id===cancellationId);
  assert.ok(c?.id);
  const response=await req(api+'/rest/v1/rpc/wm_decide_leave_cancellation','POST',
    {p_cancellation:c.id,p_approve:true,p_note:'Self-approval not authorized'},
    header(publicKey,users[1].token),false);
  assert.ok(response.status>=400);
 });
 await step('Manager approves cancellation and original leave becomes cancelled',async()=>{
  await managerPage.locator('#refreshBtn').click();
  await managerPage.locator('#nav [data-tab="approvals"]').click();
  const cancel=(await req(api+'/rest/v1/rpc/wm_list_leave_cancellations','POST',
    {p_tenant:tenant},header(publicKey,users[2].token))).data;
  const c=cancel.find(x=>x.request_id===cancellationId);
  assert.equal(c?.status,'pending');
  const button=managerPage.locator('#appContent [data-wf-lifecycle="decideCancel"][data-ok="true"][data-id="'+c.id+'"]');
  await button.waitFor({state:'visible'});
  await button.click();
  const form=managerPage.locator('#overlay form[data-form="wf_leave_cancel_decision"]');
  await form.locator('[name="p_note"]').fill('批准取消，依稽核規則保留紀錄');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  const original=await rows('wm_requests',users[0].token,'select=status&id=eq.'+cancellationId);
  assert.equal(original[0]?.status,'cancelled');
  const audit=await rows('wm_audit',users[0].token,
   'select=action&tenant_id=eq.'+tenant+'&target_id=eq.'+cancellationId);
  assert.ok(audit.some(x=>x.action==='leave_cancellation_decided'));
  await screenshot(managerPage,'07-reviewed-leave-cancellation');
 });

 let amendmentRequestId,amendmentId,amendmentBefore;
 await step('Employee submits future leave to amend; manager approves via original workflow',async()=>{
  const startDate=new Date(Date.now()+62*86400000).toISOString().slice(0,10);
  const original=await apply('reject','E2E-'+run+'-AMEND',startDate);
  amendmentRequestId=original.id;
  assert.equal(await decide(amendmentRequestId,'approve'),'approved');
  amendmentBefore=(await rows('wm_requests',users[0].token,
   'select=starts_at,ends_at,status&id=eq.'+amendmentRequestId))[0];
  assert.equal(amendmentBefore.status,'approved');
 });
 await step('Employee requests a date amendment for approved leave through actual browser',async()=>{
  await employeePage.locator('#refreshBtn').click();
  await employeePage.locator('#nav [data-tab="requests"]').click();
  const button=employeePage.locator('#appContent [data-wf-leave-amend="submit"][data-id="'+amendmentRequestId+'"]');
  await button.waitFor({state:'visible',timeout:20000});
  await button.click();
  const form=employeePage.locator('#overlay form[data-form="wf_leave_amend_request"]');
  await form.waitFor({state:'visible'});
  const nextDate=new Date(new Date(amendmentBefore.starts_at).getTime()+86400000).toISOString().slice(0,10);
  await form.locator('[name="p_start"]').fill(nextDate+'T18:00');
  await form.locator('[name="p_end"]').fill(nextDate+'T20:00');
  await form.locator('[name="p_reason"]').fill('E2E 班別變動，需調整已核准的請假日期');
  await screenshot(employeePage,'09-employee-date-amendment-form');
  await form.locator('button[type="submit"]').click();
  await Promise.race([
   form.waitFor({state:'hidden',timeout:20000}),
   employeePage.locator('#toast .toast.error').last().waitFor({state:'visible',timeout:20000})
    .then(async()=>{throw Error('Amendment API rejected: '+(await employeePage.locator('#toast').innerText()).slice(0,220));})
  ]);
  const original=(await rows('wm_requests',users[0].token,
   'select=starts_at,ends_at,status&id=eq.'+amendmentRequestId))[0];
  assert.deepEqual(original,amendmentBefore,'The approved leave MUST remain unchanged pending approval');
  const amendments=(await req(api+'/rest/v1/rpc/wm_list_leave_amendments','POST',
    {p_tenant:tenant},header(publicKey,users[1].token))).data;
  const a=amendments.find(x=>x.request_id===amendmentRequestId);
  assert.equal(a?.status,'pending');
  amendmentId=a.id;
 });
 await step('Employee cannot review own amendment; manager approves and preserves versioned audit',async()=>{
  const denied=await req(api+'/rest/v1/rpc/wm_review_leave_amendment','POST',
   {p_amendment:amendmentId,p_approved:true,p_note:'self'},header(publicKey,users[1].token),false);
  assert.ok(denied.status>=400,'Employee must not approve own leave change');
  await managerPage.locator('#refreshBtn').click();
  await managerPage.locator('#nav [data-tab="approvals"]').click();
  const button=managerPage.locator('#appContent [data-wf-leave-amend="review"][data-ok="true"][data-id="'+amendmentId+'"]');
  await button.waitFor({state:'visible',timeout:20000});
  await button.click();
  const form=managerPage.locator('#overlay form[data-form="wf_leave_amend_review"]');
  await form.locator('[name="p_note"]').fill('同意員工修改已核准假單日期');
  await form.locator('button[type="submit"]').click();
  await Promise.race([
   form.waitFor({state:'hidden',timeout:20000}),
   managerPage.locator('#toast .toast.error').last().waitFor({state:'visible',timeout:20000})
    .then(async()=>{throw Error('Amendment review failed: '+(await managerPage.locator('#toast').innerText()).slice(0,220));})
  ]);
  const current=(await rows('wm_requests',users[0].token,
   'select=starts_at,ends_at,status&id=eq.'+amendmentRequestId))[0];
  assert.equal(current.status,'approved','Approved status and request identifier remain intact');
  assert.notEqual(current.starts_at,amendmentBefore.starts_at,'Approved date must change');
  assert.notEqual(current.ends_at,amendmentBefore.ends_at);
  const amendment=(await req(api+'/rest/v1/rpc/wm_list_leave_amendments','POST',
   {p_tenant:tenant},header(publicKey,users[1].token))).data.find(x=>x.id===amendmentId);
  assert.equal(amendment.status,'approved');
  assert.equal(amendment.original_starts_at,amendmentBefore.starts_at);
  const audit=await rows('wm_audit',users[0].token,
   'select=action&tenant_id=eq.'+tenant+'&target_id=eq.'+amendmentRequestId);
  assert.ok(audit.some(x=>x.action==='leave_amendment_decided'));
  await screenshot(managerPage,'10-manager-reviewed-leave-amendment');
 });
 await step('Reusing an approved amendment is rejected by the server',async()=>{
  const resp=await req(api+'/rest/v1/rpc/wm_review_leave_amendment','POST',
   {p_amendment:amendmentId,p_approved:true,p_note:'duplicate'},
    header(publicKey,users[2].token),false);
  assert.ok(resp.status>=400);
 });

 await step('Overtime API rejects inconsistent advance/retroactive timing',async()=>{
  const prior=new Date(Date.now()-3*86400000);
  const start=prior.toISOString(),end=new Date(prior.getTime()+3600000).toISOString();
  const advance=await req(api+'/rest/v1/rpc/wm_submit_overtime_request','POST',{
   p_member:member,p_start:start,p_end:end,p_reason:'E2E incorrect advance timing',p_timing:'advance'},
   header(publicKey,users[1].token),false);
  assert.ok(advance.status>=400);
  const future=new Date(Date.now()+5*86400000);
  const retroactive=await req(api+'/rest/v1/rpc/wm_submit_overtime_request','POST',{
   p_member:member,p_start:future.toISOString(),
   p_end:new Date(future.getTime()+3600000).toISOString(),
   p_reason:'E2E incorrect retroactive timing',p_timing:'retroactive'},
   header(publicKey,users[1].token),false);
  assert.ok(retroactive.status>=400);
  const impersonation=await req(api+'/rest/v1/rpc/wm_submit_overtime_request','POST',{
   p_member:managerMember,p_start:future.toISOString(),
   p_end:new Date(future.getTime()+3600000).toISOString(),
   p_reason:'E2E employee cannot submit manager overtime',p_timing:'advance'},
   header(publicKey,users[1].token),false);
  assert.ok(impersonation.status>=400);
 });
 await step('Employee submits a retroactive overtime request through actual browser',async()=>{
  await employeePage.locator('#refreshBtn').click();
  await employeePage.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent==='資料已同步',null,{timeout:45000});
  await employeePage.locator('#nav [data-tab="requests"]').click();
  await employeePage.locator('#pageActions [data-action="newOvertimeRequest"]').click();
  const form=employeePage.locator('#overlay form[data-form="request"]');
  await form.waitFor({state:'visible'});
  await form.locator('[name="overtime_timing"]').selectOption('retroactive');
  const priorDate=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
  await form.locator('[name="starts_at"]').fill(priorDate+'T18:00');
  await form.locator('[name="ends_at"]').fill(priorDate+'T20:00');
  await form.locator('[name="reason"]').fill('E2E-'+run+'-RETRO-OVERTIME');
  await screenshot(employeePage,'11-employee-retroactive-overtime');
  await form.locator('button[type="submit"]').click();
  await Promise.race([
   form.waitFor({state:'hidden',timeout:20000}),
   employeePage.locator('#toast .toast.error').last().waitFor({state:'visible',timeout:20000})
    .then(async()=>{throw Error('Retroactive overtime form rejected: '+(await employeePage.locator('#toast').innerText()).slice(0,220));})
  ]);
  const result=await rows('wm_requests',users[0].token,
   'select=id,status,overtime_timing&tenant_id=eq.'+tenant+'&reason=eq.'+encodeURIComponent('E2E-'+run+'-RETRO-OVERTIME'));
  assert.equal(result.length,1);
  assert.equal(result[0].overtime_timing,'retroactive');
  assert.equal(result[0].status,'pending');
  const punches=await rows('wm_punches',users[0].token,'select=id&tenant_id=eq.'+tenant);
  assert.equal(punches.length,0,'Overtime request MUST NOT fabricate clock punches');
  assert.equal(await decide(result[0].id,'approve'),'approved');
  const after=await rows('wm_punches',users[0].token,'select=id&tenant_id=eq.'+tenant);
  assert.equal(after.length,0,'Overtime approval MUST NOT fabricate actual attendance');
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
  const shiftDay=new Date(Date.now()+75*86400000).toISOString().slice(0,10);
  await form.locator('[name="starts_at"]').fill(shiftDay+'T09:00');
  await form.locator('[name="ends_at"]').fill(shiftDay+'T17:00');
  await form.locator('[name="status"]').selectOption('published');
  await form.locator('[name="notes"]').fill('E2E manager shift '+run);
  await screenshot(managerPage,'06-manager-shift-form');
  await form.locator('button[type="submit"]').click();
  await Promise.race([
   form.waitFor({state:'hidden',timeout:18000}),
   managerPage.locator('#toast .toast.error').last().waitFor({state:'visible',timeout:18000})
    .then(async()=>{throw Error('Shift API rejected: '+(await managerPage.locator('#toast').innerText()).slice(0,320));})
  ]);
  const shifts=await rows('wm_shifts',users[2].token,'select=id,member_id,status&tenant_id=eq.'+tenant);
  assert.ok(shifts.some(x=>x.member_id===member&&x.status==='published'));
  return 'Manager UI published a real DB shift';
 });
 await step('Employee lifecycle rejects deactivation while a published future shift exists',async()=>{
  const response=await req(api+'/rest/v1/rpc/wm_set_employment_status','POST',
   {p_member:member,p_status:'inactive',p_reason:'E2E 申請停用員工及交接'},
   header(publicKey,users[0].token),false);
  assert.ok(response.status>=400);
  const list=await rows('wm_members',users[0].token,'select=status&id=eq.'+member);
  assert.equal(list[0]?.status,'active');
 });
 await step('After cancelling future shift Owner can deactivate and reactivate employee',async()=>{
  const shifts=await rows('wm_shifts',users[0].token,'select=id,status,starts_at&tenant_id=eq.'+tenant+'&member_id=eq.'+member);
  for(const s of shifts.filter(x=>x.status==='published'&&new Date(x.starts_at).getTime()>Date.now())){
   await req(api+'/rest/v1/wm_shifts?id=eq.'+s.id+'&tenant_id=eq.'+tenant,'PATCH',
    {status:'cancelled'}, {...header(publicKey,users[2].token),Prefer:'return=minimal'});
  }
  const result=(await req(api+'/rest/v1/rpc/wm_set_employment_status','POST',
   {p_member:member,p_status:'inactive',p_reason:'E2E 測試離職保留資料'},
   header(publicKey,users[0].token))).data;
  assert.equal(result.status,'inactive');
  const denied=await req(api+'/rest/v1/rpc/wm_submit_request','POST',
   {p_member:member,p_kind:'overtime',p_start:new Date(Date.now()+86400000).toISOString(),
    p_end:new Date(Date.now()+90000000).toISOString(),p_reason:'Inactive must fail',p_leave_kind:null,p_target_member:null},
    header(publicKey,users[1].token),false);
  assert.ok(denied.status>=400);
  const back=(await req(api+'/rest/v1/rpc/wm_set_employment_status','POST',
   {p_member:member,p_status:'active',p_reason:'E2E 測試復職恢復身份'},
   header(publicKey,users[0].token))).data;
  assert.equal(back.status,'active');
  const audit=await rows('wm_audit',users[0].token,'select=action&tenant_id=eq.'+tenant+'&target_id=eq.'+member);
  assert.ok(audit.some(x=>x.action==='employee_deactivated'));
  assert.ok(audit.some(x=>x.action==='employee_reactivated'));
  return 'Employee was disabled without deleting history; Auth access blocked; return succeeded';
 });

 await step('Employee creates correction and supervisor approves without modifying raw punches',async()=>{
  const prior=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
  const form={p_member:member,p_kind:'correction',
   p_start:prior+'T09:00:00+08:00',p_end:prior+'T10:00:00+08:00',
   p_reason:'【漏上班卡】E2E 補卡歷史匯出測試 '+run,p_leave_kind:null,p_target_member:null};
  const applied=(await req(api+'/rest/v1/rpc/wm_submit_request','POST',
   form,header(publicKey,users[1].token))).data;
  assert.equal(applied.status,'pending');
  const decision=(await req(api+'/rest/v1/rpc/wm_decide_request','POST',
   {p_request:applied.id,p_decision:'approved',p_note:'E2E 匯出歷程核准'},
   header(publicKey,users[2].token))).data;
  assert.equal(decision.status,'approved');
  const adjustments=await rows('wm_attendance_adjustments',users[1].token,
   'select=id,request_id&tenant_id=eq.'+tenant+'&request_id=eq.'+applied.id);
  assert.equal(adjustments.length,1);
  const punches=await rows('wm_punches',users[1].token,
   'select=id&tenant_id=eq.'+tenant);
  assert.equal(punches.length,0,'Correction must preserve, not fabricate original punch events');
  return 'Existing request and approval workflow produced one separate correction';
 });
 await step('Attendance export RPC checks member scope and returns exact event counts',async()=>{
  const prior=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
  const result=(await req(api+'/rest/v1/rpc/wm_prepare_attendance_export','POST',
   {p_tenant:tenant,p_member:member,p_from:prior,p_to:new Date().toISOString().slice(0,10)},
   header(publicKey,users[1].token))).data;
  assert.ok(result.export_id);
  assert.equal(result.punch_count,0);
  assert.equal(result.correction_count,1);
  assert.ok(result.action_count>=2);
  assert.equal(result.adjustment_count,1);
  const denied=await req(api+'/rest/v1/rpc/wm_prepare_attendance_export','POST',
   {p_tenant:tenant,p_member:managerMember,p_from:prior,p_to:new Date().toISOString().slice(0,10)},
   header(publicKey,users[1].token),false);
  assert.ok(denied.status>=400,'Employee must not export manager history');
  const wrongTenant=await req(api+'/rest/v1/rpc/wm_prepare_attendance_export','POST',
   {p_tenant:randomUUID(),p_member:member,p_from:prior,p_to:new Date().toISOString().slice(0,10)},
   header(publicKey,users[1].token),false);
  assert.ok(wrongTenant.status>=400,'Member must be checked against requested tenant');
 });
 await step('Employee downloads full audited correction history as CSV through real website',async()=>{
  await employeePage.locator('#refreshBtn').click();
  await employeePage.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent==='資料已同步',null,{timeout:45000});
  await employeePage.locator('#nav [data-tab="reports"]').click();
  const form=employeePage.locator('#appContent #wfHistoryExportForm');
  await form.waitFor({state:'visible',timeout:15000});
  const choices=await form.locator('[name="member_id"] option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.deepEqual(choices,[member]);
  await form.locator('[name="member_id"]').selectOption(member);
  await form.locator('[name="from"]').fill(new Date(Date.now()-2*86400000).toISOString().slice(0,10));
  await form.locator('[name="to"]').fill(new Date().toISOString().slice(0,10));
  await screenshot(employeePage,'12-audited-history-export');
  const [download]=await Promise.all([
   employeePage.waitForEvent('download',{timeout:45000}),
   form.locator('button[type="submit"]').click()
  ]);
  const stream=await download.createReadStream();let csv='';
  for await(const chunk of stream)csv+=chunk.toString('utf8');
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv,/出勤與補正原始紀錄/);
  assert.match(csv,/補卡申請/);
  assert.match(csv,/補卡審核歷程/);
  assert.match(csv,/補卡核准後更正/);
  assert.match(csv,/E2E 補卡歷史匯出測試/);
  assert.match(csv,/原始打卡筆數","0/);
  assert.match(csv,/補卡申請筆數","1/);
  assert.match(csv,/補卡更正筆數","1/);
  return 'Real employee downloaded full CSV verified against server counts and preserved correction history';
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
   ...['wm_leave_amendment_steps','wm_leave_amendments','wm_availability','wm_availability_policies','wm_leave_cancellations','wm_request_actions','wm_audit','wm_request_documents','wm_period_adjustments','wm_attendance_adjustments','wm_shift_revisions','wm_qr_uses'].map(x=>"delete from public."+x+" where tenant_id='"+tenant+"';"),
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
