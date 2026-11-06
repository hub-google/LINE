// Idempotent REAL Supabase Auth provisioning for a fictional, isolated QA company.
// Runs ONLY on GitHub Actions with SUPABASE_ACCESS_TOKEN encrypted secret.
// Never logs JWT, service_role API key or session credentials.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {ORG_QA_COMPANY,ORG_QA_COMPANY_B,ORG_QA_USERS} from './org-qa-accounts.mjs';
const project='unapiwajmgqqtdkixaab',api='https://'+project+'.supabase.co',
 management='https://api.supabase.com/v1/projects/'+project;
const pat=process.env.SUPABASE_ACCESS_TOKEN;
if(!pat)throw Error('Secure SUPABASE_ACCESS_TOKEN secret is required');
const dir=new URL('../org-qa-artifacts/',import.meta.url);
await mkdir(dir,{recursive:true});
async function fetchJson(url,{method='GET',headers={},body}={}){
 const r=await fetch(url,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{data=text;}
 if(!r.ok)throw Error(method+' '+url.split('?')[0].replace(/https:\/\/[^/]+/,'')+' '+r.status+': '+String(data?.message||data?.code||text).slice(0,220));
 return data;
}
const apiKeys=await fetchJson(management+'/api-keys?reveal=true',{headers:{authorization:'Bearer '+pat}});
const keys=Array.isArray(apiKeys)?apiKeys:apiKeys.keys||[];
const keyItem=keys.find(x=>x.name==='service_role'||x.role==='service_role');
const service=keyItem?.api_key||keyItem?.apiKey||keyItem?.key;
assert.ok(service,'No privileged project key found');
const auth={apikey:service,authorization:'Bearer '+service};
async function rest(table,params=''){
 return await fetchJson(api+'/rest/v1/'+table+(params?'?'+params:''),{headers:auth});
}
async function create(table,body){
 return await fetchJson(api+'/rest/v1/'+table,{method:'POST',headers:{...auth,Prefer:'return=representation'},body});
}
async function update(table,filters,body){
 return await fetchJson(api+'/rest/v1/'+table+'?'+filters,{method:'PATCH',headers:{...auth,Prefer:'return=representation'},body});
}
const usersRaw=await fetchJson(api+'/auth/v1/admin/users?page=1&per_page=1000',{headers:auth});
const existing=usersRaw.users||[];
const users={};
for(const item of ORG_QA_USERS){
 let u=existing.find(x=>x.email?.toLowerCase()===item.email.toLowerCase());
 if(u){
   u=await fetchJson(api+'/auth/v1/admin/users/'+u.id,
    {method:'PUT',headers:auth,body:{password:item.password,email_confirm:true}});
 }else{
   u=await fetchJson(api+'/auth/v1/admin/users',{method:'POST',headers:auth,
     body:{email:item.email,password:item.password,email_confirm:true,
      app_metadata:{workforce_qa:true}}});
 }
 assert.ok(u.id,'Unable to provision user '+item.id);
 users[item.id]=u.id;
 console.log('QA Auth ready: '+item.id);
}
async function company(name,ownerId){
 let t=(await rest('wm_tenants','select=id,name&name=eq.'+encodeURIComponent(name)))[0];
 if(!t){
  t=(await create('wm_tenants',{name,created_by:ownerId}))[0];
 }
 assert.ok(t?.id);
 const b=(await rest('wm_branches','select=id,name&tenant_id=eq.'+t.id+'&order=created_at.asc'))[0];
 assert.ok(b?.id,'Missing company branch');
 return {id:t.id,branch:b.id};
}
const a=await company(ORG_QA_COMPANY,users.owner);
const b=await company(ORG_QA_COMPANY_B,users.external);
const departmentIds={};
for(const name of ['營運部','客服部']){
 let d=(await rest('wm_departments','select=id,name&tenant_id=eq.'+a.id+'&name=eq.'+encodeURIComponent(name)))[0];
 if(!d)d=(await create('wm_departments',{tenant_id:a.id,branch_id:a.branch,name}))[0];
 departmentIds[name]=d.id;
}
const members={};
for(const item of ORG_QA_USERS){
 const tenant=item.tenant==='B'?b:a;
 const existingMember=(await rest('wm_members','select=id,user_id,role,employee_code&tenant_id=eq.'+tenant.id+'&user_id=eq.'+users[item.id]))[0];
 const payload={display_name:item.name,employee_code:item.code,role:item.role,
  branch_id:tenant.branch,job_title:item.title};
 if(item.department)payload.department_id=departmentIds[item.department];
 if(existingMember){
  members[item.id]=(await update('wm_members','id=eq.'+existingMember.id+'&tenant_id=eq.'+tenant.id,payload))[0]?.id;
 }else if(item.role==='owner'){
  const boot=(await rest('wm_members','select=id,user_id,role&tenant_id=eq.'+tenant.id+'&role=eq.owner'))[0];
  assert.ok(boot);
  members[item.id]=(await update('wm_members','id=eq.'+boot.id+'&tenant_id=eq.'+tenant.id,
   {...payload,user_id:users[item.id]}))[0]?.id;
 }else{
  members[item.id]=(await create('wm_members',{tenant_id:tenant.id,user_id:users[item.id],...payload}))[0]?.id;
 }
 assert.ok(members[item.id]);
}
for(const item of ORG_QA_USERS){
 if(!item.parent)continue;
 const tenant=item.tenant==='B'?b:a;
 const current=(await rest('wm_members','select=reports_to&id=eq.'+members[item.id]))[0];
 if(current.reports_to!==members[item.parent]){
  await update('wm_members','id=eq.'+members[item.id]+'&tenant_id=eq.'+tenant.id,
   {reports_to:members[item.parent]});
 }
}
for(const [key,who,kind,leave,start,end,reason] of [
 ['sampleA','staffA','leave','annual','2026-12-15T09:00:00+08:00','2026-12-15T18:00:00+08:00','QA 範例：張一凡請假待組長審核'],
 ['sampleB','staffB','overtime',null,'2026-12-16T18:00:00+08:00','2026-12-16T20:00:00+08:00','QA 範例：李小晴加班待經理審核'],
 ['sampleOther','otherStaff','leave','personal','2026-12-17T09:00:00+08:00','2026-12-17T18:00:00+08:00','QA 範例：吳客服請假待客服主管審核']]){
 if((await rest('wm_requests','select=id&tenant_id=eq.'+a.id+'&reason=eq.'+encodeURIComponent(reason))).length)continue;
 await create('wm_requests',{tenant_id:a.id,member_id:members[who],kind,leave_kind:leave,
   starts_at:start,ends_at:end,reason});
}
const stats={company_a:a.id,company_b:b.id,total_accounts:ORG_QA_USERS.length,
 member_count:(await rest('wm_members','select=id&tenant_id=eq.'+a.id)).length,
 pending_requests:(await rest('wm_requests','select=id&tenant_id=eq.'+a.id+'&status=eq.pending')).length,
 roles:ORG_QA_USERS.map(x=>({id:x.id,role:x.role,tenant:x.tenant,employee_code:x.code}))};
await writeFile(new URL('seed-result.json',dir),JSON.stringify(stats,null,2));
console.log('QA companies ready:',stats.total_accounts,'accounts and',stats.member_count,'members. No credentials printed.');
