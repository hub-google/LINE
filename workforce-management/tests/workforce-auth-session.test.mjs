import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const from=code.indexOf('async function call(');
const to=code.indexOf('async function demo(',from);
assert.ok(from>0&&to>from,'Supabase client and refresh logic must be present');
const authClient=code.slice(from,to);

function makeClient({refreshFails=false}={}){
 const app={token:'expired-token',user:{id:'employee'}};
 const saved={token:'expired-token',user:app.user,refresh_token:'valid-refresh'};
 let refreshCalls=0,requestCalls=0;
 const fetch=async(url,options)=>{
  if(url.includes('grant_type=refresh_token')){
   refreshCalls++;
   await Promise.resolve();
   return {ok:!refreshFails,status:refreshFails?401:200,
    json:async()=>refreshFails?{error:'invalid_grant'}:{
      access_token:'fresh-token',refresh_token:'rotated-refresh',user:app.user}};
  }
  requestCalls++;
  const valid=options?.headers?.Authorization==='Bearer fresh-token';
  return {ok:valid,status:valid?200:401,
   text:async()=>JSON.stringify(valid?{ok:true}:{message:'JWT expired'})};
 };
 const make=new Function('fetch','API','KEY','app','wfReadAuth','wfSaveAuth','wfRememberedAuth',
  authClient+';return {call,renewSession};');
 let stored={...saved},persistent=false;
 const api=make(fetch,'https://example.supabase.co','anon',app,
  ()=>stored,(s,remember)=>{stored=s;persistent=remember;},
  ()=>persistent?stored:null);
 return {...api,app,get refreshCalls(){return refreshCalls;},
  get requestCalls(){return requestCalls;},get stored(){return stored;}};
}

test('30 simultaneous expired API requests use exactly one rotating refresh token',async()=>{
 const client=makeClient();
 const results=await Promise.all(Array.from({length:30},(_,i)=>
  client.call('/rest/v1/wm_members?test='+i,'GET',null,'expired-token')));
 assert.equal(results.length,30);
 assert.ok(results.every(x=>x.ok));
 assert.equal(client.refreshCalls,1);
 assert.equal(client.app.token,'fresh-token');
 assert.equal(client.stored.refresh_token,'rotated-refresh');
});

test('A late 401 carrying the old token retries the updated token without a second refresh',async()=>{
 const client=makeClient();
 await client.call('/rest/v1/wm_members','GET',null,'expired-token');
 assert.equal(client.refreshCalls,1);
 await client.call('/rest/v1/wm_shifts','GET',null,'expired-token');
 assert.equal(client.refreshCalls,1);
});

test('Rejected refresh does not leave a permanently pending refresh promise',async()=>{
 const client=makeClient({refreshFails:true});
 await assert.rejects(client.renewSession(),/登入有效期已結束/);
 await assert.rejects(client.renewSession(),/登入有效期已結束/);
 assert.equal(client.refreshCalls,2);
});

test('Opening login always resets stale registration selection',()=>{
 const begin=code.indexOf('function showAuth(){');
 const end=code.indexOf('function showTenant(){',begin);
 assert.ok(begin>0&&end>begin);
 const elements=Object.fromEntries(['loginTab','registerTab','authSubmit'].map(id=>[
  id,{id,classList:{toggle(){}},textContent:'',onclick:null}]));
 const create=new Function('$','openModal',code.slice(begin,end)+
  ';return {showAuth,authTab,getMode:()=>register};');
 const ui=create(id=>elements[id],()=>{});
 ui.authTab(true);
 assert.equal(ui.getMode(),true);
 ui.showAuth();
 assert.equal(ui.getMode(),false);
 assert.equal(elements.authSubmit.textContent,'登入');
});

test('Work frontends remain static and Cloudflare has no Worker entrypoint',()=>{
 const build=readFileSync(new URL('../cf-pages-build.mjs',import.meta.url),'utf8');
 const website=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const mini=readFileSync(new URL('../mini/index.html',import.meta.url),'utf8');
 assert.match(build,/Built static Work site/);
 assert.doesNotMatch(build,/wrangler deploy|_worker\\.js|functions\\//);
 assert.match(website,/app\\.js/);
 assert.match(mini,/app\\.js/);
 assert.match(code,/\/functions\/v1\/wm-line/); // Supabase backend, not Cloudflare Worker.
});
