import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('let wfMiniInitPromise=null;');
const bindingStart=source.indexOf('async function connectWorkforceLine(){',start);
const bindingEnd=source.indexOf('\nif(wfMiniMode){',bindingStart);
assert.ok(start>0&&bindingStart>start&&bindingEnd>bindingStart,'WF MINI functions must be found');

const initFragment=source.slice(start,bindingStart);
const bindingFragment=source.slice(bindingStart,bindingEnd);
const environments={
 developing:{liffId:'2012649404-nz3TBQdG',configured:true},
 review:{liffId:'2012649405-ADWLM7h9',configured:true},
 published:{liffId:'2012649406-KzlLEZT6',configured:true},
};
const labels={developing:'開發測試',review:'送審測試',published:'正式發布'};

function makeInit(environment,overrides=null){
 const initCalls=[];
 const lineEndpoint=async()=>({miniEnvironments:overrides||environments});
 const loadLineSdk=async()=>({init:async options=>{initCalls.push(options);},isLoggedIn:()=>true});
 const make=new Function('wfMiniMode','wfMiniEnvironment','wfMiniEnvironmentNames',
  'lineEndpoint','loadLineSdk','
}

test('Mocked LINE SDK receives correct distinct LIFF ID for each environment',async()=>{
 for(const environment of Object.keys(environments)){
  const {initialize,initCalls}=makeInit(environment);
  const sdk=await initialize();
  assert.ok(sdk);
  assert.deepEqual(initCalls,[{liffId:environments[environment].liffId,withLoginOnExternalBrowser:false}]);
  await initialize();
  assert.equal(initCalls.length,1,'LIFF must only initialize once per load');
 }
});

test('Unknown LINE environment must fail closed',async()=>{
 const {initialize}=makeInit('evil');
 await assert.rejects(initialize(),/未知的 MINI App 環境/);
});

test('Missing channel configuration must not fall back to another LINE channel',async()=>{
 const {initialize}=makeInit('review',{developing:environments.developing});
 await assert.rejects(initialize(),/尚未設定工作怪獸/);
});

function makeConnect({mode='real',token='supabase-jwt',lineLoggedIn=true}={}){
 const app={mode,token,tenantId:'123e4567-e89b-12d3-a456-426614174000'};
 const calls=[],login=[],banners=[];
 const liff={isLoggedIn:()=>lineLoggedIn,getIDToken:()=>lineLoggedIn?'token-from-line':null,
  login:options=>{login.push(options);}};
 const lineEndpoint=async data=>{
  calls.push(data||{action:'get_config'});
  if(!data)return {miniEnvironments:environments};
  if(data.action==='bind')return {linked:true};
  throw new Error('unexpected endpoint call');
 };
 const make=new Function('app','wfMiniMode','wfMiniEnvironment','lineEndpoint',
  'initializeWFMini','loadLineSdk','location','banner','refreshLineStatus',
  bindingFragment+';return connectWorkforceLine;');
 const connect=make(app,true,'review',lineEndpoint,async()=>liff,async()=>liff,
  {href:'https://hub-google.github.io/LINE/workforce-mini/?line_env=review'},
  message=>banners.push(message),async()=>{calls.push({action:'refresh_status'});});
 return {connect,calls,login,banners};
}

test('Binding sends verified LINE ID token to real server with review channel environment',async()=>{
 const {connect,calls,banners}=makeConnect();
 await connect();
 const bind=calls.find(x=>x.action==='bind');
 assert.deepEqual(bind,{
  action:'bind',tenant_id:'123e4567-e89b-12d3-a456-426614174000',
  id_token:'token-from-line',channel_type:'mini',channel_env:'review',
 });
 assert.ok(banners.some(x=>x.includes('綁定完成')));
});

test('No Supabase login means LINE binding is never attempted',async()=>{
 const {connect,calls}=makeConnect({token:null});
 await assert.rejects(connect(),/請先登入企業帳號/);
 assert.equal(calls.length,0);
});

test('If LINE session is missing, redirect to LINE login instead of binding identity',async()=>{
 const {connect,calls,login}=makeConnect({lineLoggedIn:false});
 await connect();
 assert.equal(calls.filter(x=>x.action==='bind').length,0);
 assert.equal(login.length,1);
 assert.equal(login[0].redirectUri,'https://hub-google.github.io/LINE/workforce-mini/?line_env=review');
});
,'wfMiniOpenRequestedTab',
  initFragment+';return initializeWFMini;');
 // The post-initialization OA routing helper is covered in workforce-mini-oa-entry.test.mjs.
 return {initialize:make(true,environment,labels,lineEndpoint,loadLineSdk,()=>null,()=>{}),initCalls};
}

test('Mocked LINE SDK receives correct distinct LIFF ID for each environment',async()=>{
 for(const environment of Object.keys(environments)){
  const {initialize,initCalls}=makeInit(environment);
  const sdk=await initialize();
  assert.ok(sdk);
  assert.deepEqual(initCalls,[{liffId:environments[environment].liffId,withLoginOnExternalBrowser:false}]);
  await initialize();
  assert.equal(initCalls.length,1,'LIFF must only initialize once per load');
 }
});

test('Unknown LINE environment must fail closed',async()=>{
 const {initialize}=makeInit('evil');
 await assert.rejects(initialize(),/未知的 MINI App 環境/);
});

test('Missing channel configuration must not fall back to another LINE channel',async()=>{
 const {initialize}=makeInit('review',{developing:environments.developing});
 await assert.rejects(initialize(),/尚未設定工作怪獸/);
});

function makeConnect({mode='real',token='supabase-jwt',lineLoggedIn=true}={}){
 const app={mode,token,tenantId:'123e4567-e89b-12d3-a456-426614174000'};
 const calls=[],login=[],banners=[];
 const liff={isLoggedIn:()=>lineLoggedIn,getIDToken:()=>lineLoggedIn?'token-from-line':null,
  login:options=>{login.push(options);}};
 const lineEndpoint=async data=>{
  calls.push(data||{action:'get_config'});
  if(!data)return {miniEnvironments:environments};
  if(data.action==='bind')return {linked:true};
  throw new Error('unexpected endpoint call');
 };
 const make=new Function('app','wfMiniMode','wfMiniEnvironment','lineEndpoint',
  'initializeWFMini','loadLineSdk','location','banner','refreshLineStatus',
  bindingFragment+';return connectWorkforceLine;');
 const connect=make(app,true,'review',lineEndpoint,async()=>liff,async()=>liff,
  {href:'https://hub-google.github.io/LINE/workforce-mini/?line_env=review'},
  message=>banners.push(message),async()=>{calls.push({action:'refresh_status'});});
 return {connect,calls,login,banners};
}

test('Binding sends verified LINE ID token to real server with review channel environment',async()=>{
 const {connect,calls,banners}=makeConnect();
 await connect();
 const bind=calls.find(x=>x.action==='bind');
 assert.deepEqual(bind,{
  action:'bind',tenant_id:'123e4567-e89b-12d3-a456-426614174000',
  id_token:'token-from-line',channel_type:'mini',channel_env:'review',
 });
 assert.ok(banners.some(x=>x.includes('綁定完成')));
});

test('No Supabase login means LINE binding is never attempted',async()=>{
 const {connect,calls}=makeConnect({token:null});
 await assert.rejects(connect(),/請先登入企業帳號/);
 assert.equal(calls.length,0);
});

test('If LINE session is missing, redirect to LINE login instead of binding identity',async()=>{
 const {connect,calls,login}=makeConnect({lineLoggedIn:false});
 await connect();
 assert.equal(calls.filter(x=>x.action==='bind').length,0);
 assert.equal(login.length,1);
 assert.equal(login[0].redirectUri,'https://hub-google.github.io/LINE/workforce-mini/?line_env=review');
});
