/**
 * Isolated, real Supabase Auth E2E: two freshly-created confirmed users.
 * Only runs in GitHub Actions with its encrypted SUPABASE_ACCESS_TOKEN.
 * Service-role API key, credentials and session JWTs stay in runner memory.
 * All disposable users and tenant data are deleted in finally.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const project='unapiwajmgqqtdkixaab';
const api='https://'+project+'.supabase.co';
const management='https://api.supabase.com/v1/projects/'+project;
const website='https://hub-google.github.io/LINE/workforce/';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('Missing encrypted SUPABASE_ACCESS_TOKEN GitHub Actions secret');
const out=new URL('../auth-e2e-artifacts/',import.meta.url);
await mkdir(out,{recursive:true});
const report={scope:'REAL AUTH: separately signed-in owner and employee, disposable tenant',started_at:new Date().toISOString(),checks:[],cleanup:[]};
const nonce=randomBytes(6).toString('hex');
const ids={users:[],tenant:null,owner:null,employee:null,branch:null,member:null};
const email=role=>'wf-auth-qa-'+role+'-'+nonce+'@example.com';
const pass=()=>randomBytes(30).toString('base64url')+'aA!7';
const owner={email:email('owner'),password:pass()};
const employee={email:email('staff'),password:pass()};
let adminKey,publishKey,browser,ownerPage,employeePage;

async function request(url,{method='GET',headers={},body,ok=true}={}){
 const response=await fetch(url,{method,headers:{
  ...(body!==undefined?{'content-type':'application/json'}:{}),...headers},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const text=await response.text();let json;
 try{json=text?JSON.parse(text):null;}catch{json={message:'non-JSON response'};}
 if(ok&&!response.ok)throw Error(method+' '+new URL(url).pathname+' HTTP '+response.status+' '+String(json?.code||json?.message||'').slice(0,100));
 return {status:response.status,ok:response.ok,data:json};
}
function apiHeaders(key,bearer=key){
 return {apikey:key,Authorization:'Bearer '+bearer};
}
async function managementSQL(sql){
 const r=await request(management+'/database/query',{
  method:'POST',headers:{Authorization:'Bearer '+token},body:{query:sql}});
 return r.data;
}
async function check(name,fn){
 try{const detail=await fn();report.checks.push({name,result:'PASS',detail:detail||''});console.log('PASS '+name);}
 catch(error){report.checks.push({name,result:'FAIL',error:String(error?.message||error)});console.error('FAIL '+name,String(error?.message||error));throw error;}
}
async function snap(page,name){await page.screenshot({path:new URL(name+'.png',out).pathname,fullPage:false});}
async function signinBrowser(person){
 const context=await browser.newContext({viewport:{width:1300,height:870}});
 const page=await context.newPage();
 page.on('dialog',d=>d.accept());
 await page.goto(website,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#switchReal').click();
 const form=page.locator('#overlay form[data-form="auth"]');
 await form.locator('[name="email"]').fill(person.email);
 await form.locator('[name="password"]').fill(person.password);
 await form.locator('button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#modePill')?.textContent?.includes('企業')&&document.querySelector('#connectionLabel')?.textContent==='資料已同步',null,{timeout:30000});
 return page;
}
async function listRest(table,bearer,query='select=*'){
 const r=await request(api+'/rest/v1/'+table+'?'+query,{headers:apiHeaders(publishKey,bearer)});
 return r.data;
}
async function staffSubmit(reason,date){
 await employeePage.locator('#nav [data-tab="requests"]').click();
 await employeePage.locator('#pageActions [data-action="newOvertimeRequest"]').click();
 const form=employeePage.locator('#overlay form[data-form="request"]');
 await form.waitFor({state:'visible'});
 const options=await form.locator('[name="member_id"] option').evaluateAll(xs=>xs.map(n=>n.value));
 assert.deepEqual(options,[ids.member],'Employee form must not allow impersonation');
 await form.locator('[name="starts_at"]').fill(date+'T18:00');
 await form.locator('[name="ends_at"]').fill(date+'T20:00');
 await form.locator('[name="reason"]').fill(reason);
 await snap(employeePage,'employee-before-submit-'+reason.slice(-1));
 await form.locator('button[type="submit"]').click();
 await form.waitFor({state:'hidden',timeout:20000});
 let row;
 for(let n=0;n<20;n++){
  row=(await listRest('wm_requests',ids.ownerToken,'select=*&tenant_id=eq.'+ids.tenant+'&reason=eq.'+encodeURIComponent(reason)))[0];
  if(row)break;
  await employeePage.waitForTimeout(350);
 }
 assert.equal(row?.status,'pending','Employee UI submission did not create pending DB row');
 return row;
}
async function ownerDecision(row,kind){
 await ownerPage.locator('#refreshBtn').click();
 await ownerPage.locator('#nav [data-tab="approvals"]').click();
 const btn=ownerPage.locator('#appContent [data-action="'+kind+'"][data-id="'+row.id+'"]');
 await btn.waitFor({state:'visible'});
 await snap(ownerPage,'owner-before-'+kind);
 await btn.click();
 const status=kind==='reject'?'rejected':'approved';
 for(let n=0;n<20;n++){
  const found=(await listRest('wm_requests',ids.ownerToken,'select=id,status&tenant_id=eq.'+ids.tenant+'&id=eq.'+row.id))[0];
  if(found?.status===status){await snap(ownerPage,'owner-after-'+kind);return status;}
  await ownerPage.waitForTimeout(350);
 }
 throw Error('Owner decision did not persist as '+status);
}
try{
 await check('Existing encrypted management authorization resolves service-role key',async()=>{
  const result=await request(management+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+token}});
  const entries=Array.isArray(result.data)?result.data:result.data?.keys||[];
  const role=entries.find(x=>x.name==='service_role'||x.role==='service_role');
  adminKey=role?.api_key||role?.apiKey||role?.key;
  assert.ok(typeof adminKey==='string'&&adminKey.length>24,'service_role key unavailable');
  const pub=entries.find(x=>x.name==='anon'||x.role==='anon'||x.name==='default_publishable');
  publishKey=pub?.api_key||pub?.apiKey||pub?.key;
  if(!publishKey||!publishKey.startsWith('sb_publishable_')){
   publishKey='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy';
  }
  return 'Access restricted to protected CI runner; credential values never logged';
 });
 for(const [role,user] of [['owner',owner],['employee',employee]]){
  await check('Create confirmed real Supabase Auth '+role,async()=>{
   const res=await request(api+'/auth/v1/admin/users',{
    method:'POST',headers:apiHeaders(adminKey),body:{
     email:user.email,password:user.password,email_confirm:true,
     app_metadata:{workforce_qa:true}}});
   assert.ok(res.data?.id,'missing Auth user UUID');
   ids.users.push(res.data.id);ids[role]=res.data.id;
   return 'Confirmed Auth UUID created';
  });
 }
 await check('Both users receive separate real sign-in sessions',async()=>{
  for(const [label,user] of [['owner',owner],['employee',employee]]){
   const login=await request(api+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:publishKey},body:{
     email:user.email,password:user.password}});
   assert.equal(login.data?.user?.id,ids[label]);
   assert.ok(login.data?.access_token);
   ids[label+'Token']=login.data.access_token;
  }
  assert.notEqual(ids.ownerToken,ids.employeeToken);
  return 'Different Auth UUIDs and access tokens';
 });
 await check('Owner creates a real non-demo tenant using Auth RLS',async()=>{
  const res=await request(api+'/rest/v1/wm_tenants',{
   method:'POST',headers:{...apiHeaders(publishKey,ids.ownerToken),Prefer:'return=representation'},
   body:{name:'WORKFORCE_QA_'+nonce,created_by:ids.owner}});
  ids.tenant=res.data?.[0]?.id;
  assert.ok(ids.tenant);
  const branches=await listRest('wm_branches',ids.ownerToken,'select=id&tenant_id=eq.'+ids.tenant);
  ids.branch=branches[0]?.id;
  const owners=await listRest('wm_members',ids.ownerToken,'select=id,role,user_id&tenant_id=eq.'+ids.tenant);
  assert.ok(ids.branch&&owners.some(x=>x.role==='owner'&&x.user_id===ids.owner));
  return 'Private tenant, branch and owner member created by trigger';
 });
 await check('Owner adds employee bound to independent Auth user',async()=>{
  const r=await request(api+'/rest/v1/wm_members',{
   method:'POST',headers:{...apiHeaders(publishKey,ids.ownerToken),Prefer:'return=representation'},
   body:{tenant_id:ids.tenant,branch_id:ids.branch,user_id:ids.employee,
    display_name:'驗收員工',employee_code:'QA-EMP',role:'employee'}});
  ids.member=r.data?.[0]?.id;
  assert.ok(ids.member);
  const tenants=await listRest('wm_tenants',ids.employeeToken,'select=id&is_demo=eq.false');
  assert.ok(tenants.some(t=>t.id===ids.tenant),'Employee cannot read their private tenant');
  return 'Employee membership and tenant RLS confirmed';
 });
 browser=await chromium.launch({headless:true});
 await check('Both accounts login using deployed browser forms',async()=>{
  ownerPage=await signinBrowser(owner);employeePage=await signinBrowser(employee);
  await snap(ownerPage,'01-owner-real-login');await snap(employeePage,'02-employee-real-login');
  assert.equal(await employeePage.locator('#modePill').textContent()!==null,true);
  return 'Two separate isolated browser contexts, not the DEMO mode';
 });
 await check('Employee cannot see owner membership or manager approvals controls',async()=>{
  const rows=await listRest('wm_members',ids.employeeToken,'select=id,role&tenant_id=eq.'+ids.tenant);
  assert.ok(rows.length>=1&&rows.every(x=>x.id===ids.member),'Employee read policy exposes other members');
  await employeePage.locator('#nav [data-tab="approvals"]').click();
  assert.equal(await employeePage.locator('#appContent [data-action="approve"]').count(),0);
  await snap(employeePage,'03-employee-no-approval-rights');
  return 'Role UI and member RLS isolated';
 });
 await check('Employee cannot submit a request using another member UUID',async()=>{
  const managerMember=(await listRest('wm_members',ids.ownerToken,'select=id&tenant_id=eq.'+ids.tenant+'&role=eq.owner'))[0].id;
  const res=await request(api+'/rest/v1/rpc/wm_submit_request',{
   method:'POST',headers:apiHeaders(publishKey,ids.employeeToken),ok:false,
   body:{p_member:managerMember,p_kind:'overtime',
    p_start:'2026-12-21T18:00:00+08:00',p_end:'2026-12-21T20:00:00+08:00',p_reason:'unauthorized attempt',p_leave_kind:null,p_target_member:null}});
  assert.ok(res.status>=400,'Impersonation was accepted');
  return 'HTTP '+res.status;
 });
 const today=new Date(Date.now()+25*86400000).toISOString().slice(0,10);
 let req;
 await check('Employee UI sends overtime request, DB records pending',async()=>{
  req=await staffSubmit('REAL-AUTH-E2E-REJECT-'+nonce,today);
  return 'Pending request stored under employee Auth identity';
 });
 await check('Employee directly calling supervisor approval is rejected',async()=>{
  const response=await request(api+'/rest/v1/rpc/wm_decide_request',{
   method:'POST',headers:apiHeaders(publishKey,ids.employeeToken),
   body:{p_request:req.id,p_decision:'approved',p_note:'attempt'},ok:false});
  assert.ok(response.status>=400,'RLS bypass: employee was allowed to approve');
  const still=(await listRest('wm_requests',ids.ownerToken,'select=id,status&id=eq.'+req.id))[0];
  assert.equal(still.status,'pending');
  return 'Permission denied without changing request';
 });
 await check('Manager UI clicks reject, employee sees rejection after refresh',async()=>{
  assert.equal(await ownerDecision(req,'reject'),'rejected');
  await employeePage.locator('#refreshBtn').click();
  await employeePage.locator('#nav [data-tab="requests"]').click();
  assert.match(await employeePage.locator('#appContent').innerText(),/已駁回/);
  await snap(employeePage,'04-employee-views-rejection');
  return 'Rejected in DB and visible in independent employee session';
 });
 await check('Employee UI submits second request, manager clicks approve',async()=>{
  const next=await staffSubmit('REAL-AUTH-E2E-APPROVE-'+nonce,today.slice(0,8)+String(Number(today.slice(8))+1).padStart(2,'0'));
  assert.equal(await ownerDecision(next,'approve'),'approved');
  await employeePage.locator('#refreshBtn').click();
  await employeePage.locator('#nav [data-tab="requests"]').click();
  assert.match(await employeePage.locator('#appContent').innerText(),/已核准/);
  await snap(employeePage,'05-employee-views-approval');
  return 'Approved end-to-end';
 });
 await check('Employee denied authenticated shift creation by RLS',async()=>{
  const r=await request(api+'/rest/v1/wm_shifts',{
   method:'POST',headers:{...apiHeaders(publishKey,ids.employeeToken),Prefer:'return=representation'},ok:false,
   body:{tenant_id:ids.tenant,member_id:ids.member,branch_id:ids.branch,
    starts_at:'2027-01-20T01:00:00Z',ends_at:'2027-01-20T09:00:00Z',
    status:'published',created_by:ids.employee}});
  assert.ok(r.status>=400,'Employee created a shift without manager rights');
  return 'HTTP '+r.status;
 });
}catch(error){
 report.error=String(error?.message||error);
 process.exitCode=1;
 if(ownerPage)try{await snap(ownerPage,'FAIL-owner-state');}catch{}
 if(employeePage)try{await snap(employeePage,'FAIL-employee-state');}catch{}
}finally{
 await browser?.close();
 if(ids.tenant){
  try{
   const id=ids.tenant,tag='WORKFORCE_QA_'+nonce;
   const sql=[
    'begin;',
    ...['wm_request_actions','wm_audit','wm_request_documents','wm_period_adjustments',
      'wm_attendance_adjustments','wm_shift_revisions','wm_qr_uses'].map(t=>
       "delete from public."+t+" where tenant_id='"+id+"';"),
    "delete from public.wm_requests where tenant_id='"+id+"';",
    "delete from public.wm_punches where tenant_id='"+id+"';",
    "delete from public.wm_shifts where tenant_id='"+id+"';",
    "delete from public.wm_tenants where id='"+id+"' and name='"+tag+"';",
    'commit;'
   ].join('\n');
   await managementSQL(sql);
   report.cleanup.push({kind:'tenant',status:'PASS'});
  }catch(e){
   report.cleanup.push({kind:'tenant',status:'FAIL',reason:String(e?.message||e)});
   process.exitCode=1;
  }
 }
 for(const id of ids.users){
  try{
   await request(api+'/auth/v1/admin/users/'+id,{method:'DELETE',headers:apiHeaders(adminKey)});
   report.cleanup.push({kind:'auth_user',status:'PASS'});
  }catch(e){
   report.cleanup.push({kind:'auth_user',status:'FAIL',reason:String(e?.message||e)});
   process.exitCode=1;
  }
 }
 report.finished_at=new Date().toISOString();
 await writeFile(new URL('auth-e2e-report.json',out),JSON.stringify(report,null,2));
}
