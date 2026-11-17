import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appCode=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=appCode.indexOf('app.lineConfig=null;\napp.lineDelivery=null;');
const end=appCode.indexOf('const priorLineRender=render;',start);
assert.ok(start>0&&end>start,'LINE functions must be present');
const functions=appCode.slice(start,end);

function harness({roleValue='owner',expiredOnce=false}={}){
 const app={mode:'real',token:expiredOnce?'old-jwt':'current-jwt',tenantId:'tenant-one',
  user:{id:'employee-one'},tab:'overview',lineState:null,lineConfig:null};
 let refreshes=0,metricsCalls=0,requests=[];
 const fetch=async(url,opts)=>{
  requests.push({url,opts});
  if(expiredOnce&&opts.headers.Authorization==='Bearer old-jwt')
   return {status:401,ok:false,json:async()=>({error:'AUTH_REQUIRED'})};
  return {status:200,ok:true,json:async()=>opts.method==='GET'?
   {miniEnvironments:{published:{configured:true}},messagingConfigured:true}:
   {linked:true,verifiedAt:'2026-11-17'}};
 };
 const renew=async()=>{refreshes++;app.token='current-jwt';return app.token;};
 const call=async(path,method,body,token)=>{
  assert.equal(path,'/rest/v1/rpc/wm_line_delivery_status');
  assert.deepEqual(body,{p_tenant:'tenant-one'});
  assert.equal(token,'current-jwt');
  metricsCalls++;
  return {linked:2,pending:3,sent:5,skipped:1};
 };
 const create=new Function('app','API','KEY','fetch','wfAuthGeneration',
  'renewSession','call','role','render',functions+';return {lineEndpoint,refreshLineStatus};');
 const api=create(app,'https://supabase.example','public-key',fetch,0,renew,call,()=>roleValue,()=>{});
 return {api,app,get metricsCalls(){return metricsCalls;},
  get refreshes(){return refreshes;},get requests(){return requests;}};
}

test('LINE gateway retries exactly once after a Supabase JWT expires',async()=>{
 const h=harness({expiredOnce:true});
 const result=await h.api.lineEndpoint({action:'status',tenant_id:'tenant-one'});
 assert.equal(result.linked,true);
 assert.equal(h.refreshes,1);
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].opts.headers.Authorization,'Bearer current-jwt');
});

test('Owner status page reads real SQL delivery counts instead of guessing delivery',async()=>{
 const h=harness();
 await h.api.refreshLineStatus();
 assert.equal(h.metricsCalls,1);
 assert.deepEqual(h.app.lineDelivery,{linked:2,pending:3,sent:5,skipped:1});
 assert.equal(h.app.lineState.linked,true);
 assert.match(appCode,/LINE API 已接受/);
 assert.match(appCode,/實際送達與額度依 LINE 平台記錄/);
});

test('Employees cannot call management LINE delivery statistics RPC',async()=>{
 const h=harness({roleValue:'employee'});
 await h.api.refreshLineStatus();
 assert.equal(h.metricsCalls,0);
 assert.equal(h.app.lineDelivery,null);
});

test('LINE binding status ignores results for an obsolete tenant',async()=>{
 const h=harness();
 h.app.tenantId='tenant-two';
 await h.api.refreshLineStatus();
 assert.equal(h.metricsCalls,1);
 assert.equal(h.app.lineState.linked,true);
});
