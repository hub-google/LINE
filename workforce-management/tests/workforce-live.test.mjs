import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const url=source.match(/const API='([^']+)'/)?.[1];
const key=source.match(/const KEY='([^']+)'/)?.[1];
assert.ok(url&&key&&key.startsWith('sb_publishable_'),'Only public test key is allowed');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/* Public snapshot calls are read-only: retry transient Supabase gateway 429/5xx
   or network timeout, but still fail when the backend remains unavailable.
   Never retry non-idempotent writes this way. */
async function liveFetch(input,options={}){
 let previous;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const result=await fetch(input,{...options,signal:AbortSignal.timeout(24000)});
   if((result.status===429||result.status>=500)&&attempt<2){
    await result.text();await delay(600*(attempt+1));continue;
   }
   return result;
  }catch(err){
   previous=err;
   if(attempt===2)throw err;
   await delay(600*(attempt+1));
  }
 }
 throw previous||new Error('Public test endpoint not reachable');
}

async function api(path,action='snapshot'){
 const response=await liveFetch(url+'/rest/v1/rpc/'+path,{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({p_action:action,p_data:{}}),signal:AbortSignal.timeout(13000)});
 assert.equal(response.status,200,path+' returned '+response.status+': '+(await response.text()).slice(0,220));
 return response.json();
}
test('live public Supabase demo - core snapshot',async()=>{
 const response=await liveFetch(url+'/rest/v1/rpc/wm_demo_api',{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({p_action:'snapshot',p_data:{}}),signal:AbortSignal.timeout(13000)});
 const text=await response.text();
 assert.equal(response.status,200,'wm_demo_api: '+text.slice(0,280));
 const result=JSON.parse(text);
 assert.ok(Array.isArray(result.members),'missing demo members');
 assert.ok(Array.isArray(result.branches),'missing demo branches');
 assert.ok(Array.isArray(result.shifts),'missing demo shifts');
});
test('live leave and attendance demo APIs are reachable without real identity',async()=>{
 const [policy,attendance]=await Promise.all(['wm_demo_leave_api','wm_demo_attendance_api'].map(fn=>
 liveFetch(url+'/rest/v1/rpc/'+fn,{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({p_action:'snapshot',p_data:{}}),signal:AbortSignal.timeout(13000)
 }).then(async r=>{const t=await r.text();assert.equal(r.status,200,fn+': '+t.slice(0,200));return JSON.parse(t);})
 ));
 assert.ok(Array.isArray(policy.leavePolicies));
 assert.equal(typeof policy.leaveBalances,'object');
 assert.ok(Array.isArray(attendance.attendanceCases));
});
test('live schedule and cross-store demo APIs are reachable',async()=>{
 const [schedule,stores]=await Promise.all(['wm_demo_schedule_api','wm_demo_branch_support'].map(fn=>
 liveFetch(url+'/rest/v1/rpc/'+fn,{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({p_action:'snapshot',p_data:{}}),signal:AbortSignal.timeout(13000)
 }).then(async r=>{const t=await r.text();assert.equal(r.status,200,fn+': '+t.slice(0,200));return JSON.parse(t);})
 ));
 assert.equal(typeof schedule,'object');assert.ok(Array.isArray(stores));
});
test('live LINE Workforce backend configuration returns no private token',async()=>{
 const r=await liveFetch(url+'/functions/v1/wm-line',{
  headers:{apikey:key},signal:AbortSignal.timeout(13000)});
 const body=await r.text();
 assert.equal(r.status,200,body.slice(0,300));
 const data=JSON.parse(body);
 assert.equal(typeof data.loginConfigured,'boolean');
 assert.equal(typeof data.messagingConfigured,'boolean');
 assert.equal(typeof data.mode,'string');
 assert.doesNotMatch(body,/sb_secret_|LINE_MESSAGING_ACCESS_TOKEN/);
});
