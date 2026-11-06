// Actual Chromium and Supabase Auth acceptance of separate company tenants,
// company owner/HR/manager/team lead/employee roles and their reporting tree.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {ORG_QA_COMPANY,ORG_QA_COMPANY_B,ORG_QA_USERS} from './org-qa-accounts.mjs';

const ref='unapiwajmgqqtdkixaab',api='https://'+ref+'.supabase.co';
const site='https://hub-google.github.io/LINE/workforce/';
const publishable='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy';
const run='ORG-E2E-'+randomBytes(4).toString('hex');
const folder=new URL('../org-qa-artifacts/',import.meta.url);
await mkdir(folder,{recursive:true});
const report={run,site,started_at:new Date().toISOString(),tests:[],cleanup:[],counts:{}};
const auth={};
let browser,ownerPage,leadPage,staffPage,managerPage,externalPage,companyA,companyB,ids={},service,invitedUser,invitedMember;
const index=Object.fromEntries(ORG_QA_USERS.map(x=>[x.id,x]));
function bearer(token){return {apikey:publishable,Authorization:'Bearer '+token};}
async function http(url,{method='GET',headers={},body,ok=true}={}){
 const res=await fetch(url,{method,headers:{...headers,...(body!==undefined?{'Content-Type':'application/json'}:{})},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const t=await res.text();let data;try{data=t?JSON.parse(t):null;}catch{data=t;}
 if(ok&&!res.ok)throw Error(method+' '+url.split('?')[0].replace(/^https:\/\/[^/]+/,'')+' HTTP '+res.status+' '+String(data?.message||data?.code||'').slice(0,150));
 return {status:res.status,ok:res.ok,data};
}
async function rget(table,token,q){
 return (await http(api+'/rest/v1/'+table+'?'+q,{headers:bearer(token)})).data;
}
async function rpc(name,token,payload,ok=true){
 return await http(api+'/rest/v1/rpc/'+name,{method:'POST',headers:bearer(token),body:payload,ok});
}
async function check(label,fn){
 try{
  const value=await fn();
  const entry={name:label,status:'PASS',detail:String(value||'')};
  report.tests.push(entry);console.log('PASS '+label+' '+entry.detail.slice(0,140));
  return value;
 }catch(error){
  report.tests.push({name:label,status:'FAIL',error:String(error.message||error)});
  console.error('FAIL '+label+' '+String(error.message||error));
  throw error;
 }
}
async function snap(page,name){await page.screenshot({path:new URL(name+'.png',folder).pathname,fullPage:true});}
async function session(who){
 const u=index[who];assert.ok(u);
 const res=await http(api+'/auth/v1/token?grant_type=password',{method:'POST',
  headers:{apikey:publishable},body:{email:u.email,password:u.password}});
 assert.ok(res.data?.access_token);
 auth[who]=res.data.access_token;
 return res.data.access_token;
}
async function loginUI(who,viewport={width:1366,height:885}){
 const ctx=await browser.newContext({viewport});
 const page=await ctx.newPage();page.on('dialog',d=>d.accept());
 await page.goto(site,{waitUntil:'domcontentloaded',timeout:35000});
 await page.locator('#switchReal').click();
 const form=page.locator('#overlay form[data-form="auth"]');
 await form.waitFor({state:'visible'});
 await form.locator('[name="email"]').fill(index[who].email);
 await form.locator('[name="password"]').fill(index[who].password);
 await form.locator('button[type="submit"]').click();
 await page.waitForFunction(name=>
  document.querySelector('#connectionLabel')?.textContent==='資料已同步'&&
  document.querySelector('#modePill')?.classList.contains('real-pill')&&
  document.querySelector('#wfIdentity')?.textContent?.includes(name),
  index[who].name,{timeout:35000});
 await page.locator('#nav [data-tab="org"]').click();
 await page.locator('#appContent .org-hero').waitFor({state:'visible'});
 await page.waitForLoadState('networkidle',{timeout:20000});
 return page;
}
async function visibleTo(who){
 const data=await rget('wm_members',auth[who],
  'select=id,display_name,user_id,role,reports_to,job_title&tenant_id=eq.'+(who==='external'?companyB:companyA));
 return data.map(x=>x.display_name).sort();
}
function names(ids){return ids.map(id=>index[id].name).sort();}
async function requestFrom(who,kind,leaveKind,date){
 const page=who==='staffA'?staffPage:await loginUI(who);
 await page.locator('#nav [data-tab="requests"]').click();
 const action=kind==='leave'?'newLeaveRequest':'newOvertimeRequest';
 await page.locator('#pageActions [data-action="'+action+'"]').click();
 const form=page.locator('#overlay form[data-form="request"]');
 await form.waitFor({state:'visible'});
 const entries=await form.locator('[name="member_id"] option').evaluateAll(xs=>xs.map(x=>x.value));
 assert.deepEqual(entries,[ids[who]],'Employee can submit only their own request');
 if(kind==='leave')await form.locator('[name="leave_kind"]').selectOption(leaveKind);
 await form.locator('[name="starts_at"]').fill(date+(kind==='leave'?'T09:00':'T18:00'));
 await form.locator('[name="ends_at"]').fill(date+(kind==='leave'?'T18:00':'T20:00'));
 const reason=run+' '+who+' '+kind;
 await form.locator('[name="reason"]').fill(reason);
 await snap(page,'06-'+who+'-application-filled');
 await form.locator('button[type="submit"]').click();
 await form.waitFor({state:'hidden',timeout:25000});
 let pending;
 for(let i=0;i<25;i++){
  pending=(await rget('wm_requests',auth.owner,'select=id,member_id,status,reason&reason=eq.'+encodeURIComponent(reason)))[0];
  if(pending)break;
  await page.waitForTimeout(250);
 }
 assert.equal(pending?.status,'pending');
 return pending;
}
async function reviewerClick(page,id,kind){
 await page.locator('#refreshBtn').click();
 await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent==='資料已同步',null,{timeout:25000});
 await page.locator('#nav [data-tab="approvals"]').click();
 const button=page.locator('#appContent [data-action="'+kind+'"][data-id="'+id+'"]');
 await button.waitFor({state:'visible',timeout:18000});
 await snap(page,'07-supervisor-'+kind+'-before');
 await button.click();
 const expected=kind==='approve'?'approved':'rejected';
 for(let i=0;i<25;i++){
  const row=(await rget('wm_requests',auth.owner,'select=id,status&id=eq.'+id))[0];
  if(row?.status===expected)return;
  await page.waitForTimeout(300);
 }
 throw Error('Manager decision did not persist');
}
async function memberId(id){
 const tenant=index[id].tenant==='B'?companyB:companyA;
 const rows=await rget('wm_members',auth.owner,'select=id&tenant_id=eq.'+tenant+'&user_id=eq.'+(await loginUserId(id)));
 return rows[0]?.id;
}
async function loginUserId(id){
 const data=await http(api+'/auth/v1/user',{headers:bearer(auth[id])});
 return data.data.id;
}
try{
 await check('QA accounts use genuine distinct Supabase Auth sessions',async()=>{
  for(const u of ORG_QA_USERS)await session(u.id);
  assert.equal(new Set(Object.values(auth)).size,ORG_QA_USERS.length);
  return ORG_QA_USERS.length+' unique JWTs';
 });
 await check('Both enterprise tenants are present and isolated',async()=>{
  const a=await rget('wm_tenants',auth.owner,'select=id,name&name=eq.'+encodeURIComponent(ORG_QA_COMPANY));
  const b=await rget('wm_tenants',auth.external,'select=id,name&name=eq.'+encodeURIComponent(ORG_QA_COMPANY_B));
  assert.equal(a.length,1);assert.equal(b.length,1);companyA=a[0].id;companyB=b[0].id;
  assert.notEqual(companyA,companyB);
  const other=await rget('wm_tenants',auth.external,'select=id&name=eq.'+encodeURIComponent(ORG_QA_COMPANY));
  assert.deepEqual(other,[]);
  return '2 companies; cross-tenant read denied';
 });
 await check('Reports-to IDs are persisted and match the expected organizational chain',async()=>{
  const all=await rget('wm_members',auth.owner,'select=id,user_id,display_name,role,reports_to,job_title,tenant_id&tenant_id=eq.'+companyA);
  const byName=new Map(all.map(x=>[x.display_name,x]));
  for(const u of ORG_QA_USERS.filter(x=>x.tenant==='A')){
   const m=byName.get(u.name);assert.ok(m,'Missing member '+u.name);
   assert.equal(m.role,u.role);assert.equal(m.job_title,u.title);
   ids[u.id]=m.id;
   if(u.parent)assert.equal(m.reports_to,byName.get(index[u.parent].name)?.id,u.name+' has wrong parent');
  }
  ids.external=(await rget('wm_members',auth.external,'select=id&tenant_id=eq.'+companyB))[0].id;
  return 'Owner → manager → lead → staff; sibling department isolated';
 });
 await check('Owner can see entire company workforce',async()=>{
  assert.deepEqual(await visibleTo('owner'),names(['owner','hr','manager','lead','staffA','staffB','otherManager','otherStaff']));
 });
 await check('HR can see entire company workforce',async()=>{
  assert.deepEqual(await visibleTo('hr'),names(['owner','hr','manager','lead','staffA','staffB','otherManager','otherStaff']));
 });
 await check('Department manager sees only self and descendants',async()=>{
  assert.deepEqual(await visibleTo('manager'),names(['manager','lead','staffA','staffB']));
 });
 await check('Team lead sees only self and direct reports',async()=>{
  assert.deepEqual(await visibleTo('lead'),names(['lead','staffA']));
 });
 await check('Employee A can only see their own membership',async()=>{
  assert.deepEqual(await visibleTo('staffA'),names(['staffA']));
 });
 await check('Employee B can only see their own membership',async()=>{
  assert.deepEqual(await visibleTo('staffB'),names(['staffB']));
 });
 await check('Other department manager and staff are scope isolated',async()=>{
  assert.deepEqual(await visibleTo('otherManager'),names(['otherManager','otherStaff']));
  assert.deepEqual(await visibleTo('otherStaff'),names(['otherStaff']));
 });
 await check('Other company owner cannot view star-company memberships',async()=>{
  assert.deepEqual(await rget('wm_members',auth.external,'select=id&tenant_id=eq.'+companyA),[]);
  assert.deepEqual(await visibleTo('external'),names(['external']));
 });
 browser=await chromium.launch({headless:true});
 await check('Owner browser shows polished organization tree and editing controls',async()=>{
  ownerPage=await loginUI('owner');
  await ownerPage.locator('.org-person').getByText(index.staffA.name,{exact:true}).first().waitFor();
  assert.ok((await ownerPage.locator('.org-person').count())>=8);
  assert.ok(await ownerPage.locator('[data-org="invite"]').count()>0);
  await snap(ownerPage,'01-owner-org-desktop');
 });
 await check('HR browser sees organization management tools',async()=>{
  const page=await loginUI('hr');
  assert.ok(await page.locator('[data-org="invite"]').count()>0);
  await snap(page,'02-hr-org-desktop');await page.context().close();
 });
 await check('Manager browser sees department scope, not peer department',async()=>{
  managerPage=await loginUI('manager');
  assert.ok(await managerPage.getByText(index.lead.name,{exact:true}).count()>0);
  assert.equal(await managerPage.getByText(index.otherStaff.name,{exact:true}).count(),0);
  assert.equal(await managerPage.locator('[data-org="invite"]').count(),0);
  await snap(managerPage,'03-manager-scope-desktop');
 });
 await check('Team leader browser sees direct employee only',async()=>{
  leadPage=await loginUI('lead');
  assert.equal(await leadPage.getByText(index.staffB.name,{exact:true}).count(),0);
  await snap(leadPage,'04-lead-scope-desktop');
 });
 await check('Employee browser sees only self, no management controls',async()=>{
  staffPage=await loginUI('staffA');
  assert.equal(await staffPage.locator('[data-org="invite"]').count(),0);
  assert.equal(await staffPage.getByText(index.lead.name,{exact:true}).count(),0);
  await snap(staffPage,'05-employee-scope-desktop');
 });
 await check('Other tenant owner browser shows only its own tenant',async()=>{
  externalPage=await loginUI('external');
  assert.equal(await externalPage.getByText(index.owner.name,{exact:true}).count(),0);
  await snap(externalPage,'08-other-company-desktop');
 });
 const first=await check('Employee submits leave through its own real browser session',async()=>{
  const value=await requestFrom('staffA','leave','annual','2027-03-11');
  return value.id;
 });
 await check('Wrong department manager cannot approve an unrelated employee',async()=>{
  const result=await rpc('wm_decide_request',auth.otherManager,
   {p_request:first,p_decision:'approved',p_note:'should be denied'},false);
  assert.ok(result.status>=400,'Unauthorized manager approval was accepted');
  const current=(await rget('wm_requests',auth.owner,'select=id,status&id=eq.'+first))[0];
  assert.equal(current.status,'pending');
  return 'Server refused '+result.status;
 });
 await check('Actual team lead approves direct subordinate leave and employee sees result',async()=>{
  await reviewerClick(leadPage,first,'approve');
  await staffPage.locator('#refreshBtn').click();
  await staffPage.locator('#nav [data-tab="requests"]').click();
  await staffPage.locator('#appContent .chip.approved').first().waitFor({state:'visible',timeout:25000});
  await snap(staffPage,'09-employee-leave-approved');
 });
 const second=await check('Second employee submits overtime under department manager',async()=>{
  const row=await requestFrom('staffB','overtime',null,'2027-03-12');
  return row.id;
 });
 await check('Team lead cannot approve an employee outside its reporting chain',async()=>{
  const r=await rpc('wm_decide_request',auth.lead,
   {p_request:second,p_decision:'approved',p_note:'unauthorized'},false);
  assert.ok(r.status>=400);
  const result=(await rget('wm_requests',auth.owner,'select=status&id=eq.'+second))[0];
  assert.equal(result.status,'pending');
 });
 await check('Department manager approves own subordinate overtime',async()=>{
  await reviewerClick(managerPage,second,'approve');
  assert.equal((await rget('wm_requests',auth.owner,'select=status&id=eq.'+second))[0].status,'approved');
  await snap(managerPage,'10-manager-overtime-approved');
 });
 await check('Employee cannot modify hierarchy via organization management RPC',async()=>{
  const r=await rpc('wm_org_set_member',auth.staffA,
   {p_member:ids.staffA,p_role:'manager',p_reports_to:ids.owner,
    p_job_title:'Unauthorized',p_department:null},false);
  assert.ok(r.status>=400);
  assert.equal((await rget('wm_members',auth.owner,'select=role&id=eq.'+ids.staffA))[0].role,'employee');
 });
 await check('Owner cannot assign cyclical manager reporting hierarchy',async()=>{
  const r=await rpc('wm_org_set_member',auth.owner,
   {p_member:ids.manager,p_role:'manager',p_reports_to:ids.lead,
    p_job_title:'營運部經理',p_department:null},false);
  assert.ok(r.status>=400);
  assert.equal((await rget('wm_members',auth.owner,'select=reports_to&id=eq.'+ids.manager))[0].reports_to,ids.owner);
 });
 await check('Owner UI updates employee supervisor and RLS changes immediately',async()=>{
  await ownerPage.locator('[data-org="edit"][data-id="'+ids.staffB+'"]').first().click();
  const form=ownerPage.locator('#overlay form[data-form="wf_org_edit"]');
  await form.waitFor({state:'visible'});
  await form.locator('[name="p_reports_to"]').selectOption(ids.lead);
  await snap(ownerPage,'11-owner-edit-reporting-line');
  await form.locator('button[type="submit"]').click();
  for(let n=0;n<25;n++){
   const row=(await rget('wm_members',auth.owner,'select=reports_to&id=eq.'+ids.staffB))[0];
   if(row?.reports_to===ids.lead)break;
   if(n===24)throw Error('UI reporting-line change did not persist');
   await ownerPage.waitForTimeout(300);
  }
  assert.ok((await rget('wm_members',auth.lead,'select=id&id=eq.'+ids.staffB)).length===1);
  await snap(ownerPage,'12-owner-org-after-change');
  return 'Employee B became visible to team lead';
 });
 await check('Restore original hierarchy with authorized owner RPC',async()=>{
  const dept=(await rget('wm_departments',auth.owner,'select=id&tenant_id=eq.'+companyA+'&name=eq.'+encodeURIComponent('營運部')))[0]?.id;
  await rpc('wm_org_set_member',auth.owner,
   {p_member:ids.staffB,p_role:'employee',p_reports_to:ids.manager,
    p_job_title:index.staffB.title,p_department:dept});
  assert.deepEqual(await visibleTo('lead'),names(['lead','staffA']));
 });
 await check('Employee cannot access another company or invite staff into it',async()=>{
  assert.deepEqual(await rget('wm_members',auth.staffA,'select=id&tenant_id=eq.'+companyB),[]);
  const r=await rpc('wm_org_invite',auth.staffA,{p_tenant:companyA,
   p_email:'test-'+run.toLowerCase()+'@example.com',p_name:'Unauthorized',p_role:'employee',
   p_reports_to:ids.staffA,p_job_title:'',p_branch:null,p_department:null},false);
  assert.ok(r.status>=400);
 });
 await check('Owner invitation UI creates a single-use email-bound activation link',async()=>{
  const branch=(await rget('wm_branches',auth.owner,'select=id&tenant_id=eq.'+companyA))[0]?.id;
  await ownerPage.locator('[data-org="invite"]').first().click();
  const form=ownerPage.locator('#overlay form[data-form="wf_org_invite"]');
  await form.waitFor({state:'visible'});
  const email='wforg.qa.invited.'+run.slice(-8).toLowerCase()+'@example.com';
  invitedUser={email,password:'WfQA!Invite-'+run.slice(-8)+'X9'};
  await form.locator('[name="p_email"]').fill(email);
  await form.locator('[name="p_name"]').fill('測試受邀員工');
  await form.locator('[name="p_role"]').selectOption('employee');
  await form.locator('[name="p_job_title"]').fill('邀請流程測試');
  await form.locator('[name="p_reports_to"]').selectOption(ids.lead);
  await form.locator('[name="p_branch"]').selectOption(branch);
  await snap(ownerPage,'13-owner-invite-form');
  await form.locator('button[type="submit"]').click();
  const field=ownerPage.locator('#orgInviteLink');
  await field.waitFor({state:'visible'});
  const link=await field.inputValue(),token=new URL(link).searchParams.get('invite');
  assert.match(token,/^[0-9a-f]{48}$/);
  invitedUser.token=token;invitedUser.url=link;
  // Token must never appear in artifacts/screenshots.
  await field.evaluate(el=>{el.value='邀請連結已安全遮蔽';});
  await snap(ownerPage,'14-owner-invite-created-redacted');
 });
 await check('Invitation rejects wrong signed-in email',async()=>{
  const r=await rpc('wm_org_accept_invite',auth.staffA,{p_token:invitedUser.token},false);
  assert.ok(r.status>=400);
 });
 await check('New invited employee binds its Auth identity through the public website',async()=>{
  const pat=process.env.SUPABASE_ACCESS_TOKEN;assert.ok(pat);
  const mg=await http('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',
   {headers:{authorization:'Bearer '+pat}});
  const keys=Array.isArray(mg.data)?mg.data:mg.data?.keys||[];
  const key=keys.find(x=>x.name==='service_role'||x.role==='service_role');
  service=key?.api_key||key?.apiKey||key?.key;assert.ok(service);
  const created=await http(api+'/auth/v1/admin/users',{method:'POST',
   headers:{apikey:service,authorization:'Bearer '+service},
   body:{email:invitedUser.email,password:invitedUser.password,email_confirm:true,app_metadata:{workforce_qa:true}}});
  invitedUser.id=created.data.id;
  const ctx=await browser.newContext({viewport:{width:1270,height:830}});
  const page=await ctx.newPage();
  await page.goto(invitedUser.url,{waitUntil:'domcontentloaded'});
  const form=page.locator('#overlay form[data-form="auth"]');
  await form.waitFor({state:'visible',timeout:20000});
  await form.locator('[name="email"]').fill(invitedUser.email);
  await form.locator('[name="password"]').fill(invitedUser.password);
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent==='資料已同步'&&document.querySelector('#wfIdentity')?.textContent?.includes('測試受邀員工'),null,{timeout:35000});
  assert.ok(!page.url().includes('invite='));
  const token=(await http(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishable},
   body:{email:invitedUser.email,password:invitedUser.password}})).data.access_token;
  const found=await rget('wm_members',token,'select=id,tenant_id,role&tenant_id=eq.'+companyA+'&user_id=eq.'+invitedUser.id);
  assert.equal(found.length,1);invitedMember=found[0].id;
  assert.equal(found[0].role,'employee');
  await page.locator('#nav [data-tab="org"]').click();
  await page.locator('.org-hero').waitFor();
  await snap(page,'15-invited-employee-onboarded');
  const reused=await rpc('wm_org_accept_invite',token,{p_token:invitedUser.token},false);
  assert.ok(reused.status>=400,'Invite should be single-use');
  await ctx.close();
 });
 await check('Mobile 390px supervisor interface is usable',async()=>{
  const page=await loginUI('manager',{width:390,height:844});
  const hero=await page.locator('.org-hero').boundingBox();
  assert.ok(hero&&hero.width<=400&&hero.x>=0,'Org page overflows mobile viewport');
  await snap(page,'16-mobile-manager-organization');
  await page.context().close();
 });
}catch(error){report.error=String(error.message||error);process.exitCode=1;
 if(ownerPage)try{await snap(ownerPage,'FAILED-owner-state');}catch{}
 if(staffPage)try{await snap(staffPage,'FAILED-employee-state');}catch{}
}finally{
 if(invitedMember&&service){
  const serviceHeader={apikey:service,Authorization:'Bearer '+service};
  for(const [table,filter] of [
   ['wm_org_invites','member_id=eq.'+invitedMember],
   ['wm_org_role_audit','member_id=eq.'+invitedMember],
   ['wm_members','id=eq.'+invitedMember]
  ]){
   try{const response=await http(api+'/rest/v1/'+table+'?'+filter,
    {method:'DELETE',headers:{...serviceHeader,Prefer:'return=minimal'}});
    report.cleanup.push({table,status:'PASS'});}
   catch(e){report.cleanup.push({table,status:'FAIL',error:String(e.message)});process.exitCode=1;}
  }
 }
 if(invitedUser?.id&&service){
  try{await http(api+'/auth/v1/admin/users/'+invitedUser.id,
   {method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service}});
   report.cleanup.push({table:'auth_test_invitee',status:'PASS'});
  }catch(e){report.cleanup.push({table:'auth_test_invitee',status:'FAIL'});process.exitCode=1;}
 }
 await browser?.close();
 report.completed_at=new Date().toISOString();
 report.counts={passed:report.tests.filter(x=>x.status==='PASS').length,
  failed:report.tests.filter(x=>x.status==='FAIL').length,total:report.tests.length};
 await writeFile(new URL('hierarchy-e2e-results.json',folder),JSON.stringify(report,null,2));
 console.log('E2E SUMMARY '+JSON.stringify(report.counts));
}
