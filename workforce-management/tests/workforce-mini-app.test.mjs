import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=url=>readFileSync(new URL(url,import.meta.url),'utf8');
const client=src('../app.js');
const edge=src('../supabase/functions/wm-line/index.ts');
const website=src('../index.html');
const mini=src('../mini/index.html');
const miniCss=src('../mini/mini.css');
const setup=src('../MINI_APP_SETUP.md');
const workflow=src('../../.github/workflows/line-workforce-pages.yml');

test('Original /workforce/ remains standard website, MINI has separate static entry and style',()=>{
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/workforce-mini/);
 assert.match(client,/location\.pathname/);
 assert.doesNotMatch(client,/get\('mini'\)==='1'/);
 assert.doesNotMatch(website,/id="wfMiniBanner"/);
 assert.match(website,/<title>Work 工作怪獸/);
 assert.match(mini,/<title>工作怪獸/);
 assert.match(mini,/id="wfMiniBanner"/);
 assert.match(mini,/id="wfMiniText"/);
 assert.match(mini,/id="wfMiniOpen"/);
 assert.match(mini,/\.\/mini\.css/);
 assert.ok(miniCss.includes('Not loaded by /workforce/'));
 assert.match(workflow,/workforce-management\/mini\/index\.html/);
 assert.match(workflow,/git -C "\$pubdir" add -- workforce\/ workforce-mini\//);
 assert.match(workflow,/workforce-management\/app\.js workforce-management\/swap-sync\.js workforce-management\/style\.css "\$pubdir\/workforce-mini\/"/);
 assert.match(setup,/\/LINE\/workforce-mini\//);
});
test('Cloudflare Work /mini/ is recognized as MINI and chooses Published, while GitHub Pages stays Developing',()=>{
 const start=client.indexOf('const wfMiniMode=');
 const end=client.indexOf('const wfMiniMenuTabs=',start);
 assert.ok(start>=0&&end>start);
 const select=new Function('location',client.slice(start,end)+';return {mode:wfMiniMode,env:wfMiniEnvironment};');
 for(const [url,mode,env] of [
  ['https://work.monsterport.com/',false,'published'],
  ['https://work.monsterport.com/mini/',true,'published'],
  ['https://work.monsterport.com/mini/index.html',true,'published'],
  ['https://work.monsterport.com/mini/?line_env=review',true,'review'],
  ['https://hub-google.github.io/LINE/workforce/',false,'developing'],
  ['https://hub-google.github.io/LINE/workforce-mini/',true,'developing'],
  ['https://hub-google.github.io/LINE/workforce-mini/?line_env=published',true,'published'],
 ]){
  const location=new URL(url);
  assert.deepEqual(select(location),{mode,env},url);
 }
});

test('Optional private-device login survives a new WebView while shared-device login does not',()=>{
 const start=client.indexOf("const WF_AUTH_KEY=");
 const end=client.indexOf("// The LINE MINI App",start);
 assert.ok(start>0&&end>start);
 const script=client.slice(start,end);
 const local=new Map(),session=new Map();
 const storage=map=>({
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value)),
  removeItem:key=>map.delete(key),
 });
 let now=Date.now();
 class MockDate extends Date {static now(){return now;}}
 const auth=new Function('sessionStorage','localStorage','Date',script+
  ';return {read:wfReadAuth,save:wfSaveAuth,clear:wfClearAuth};')(
    storage(session),storage(local),MockDate);
 const state={token:'old-jwt',refresh_token:'refresh-one',user:{id:'employee-uuid'}};
 auth.save(state,false);
 session.clear();
 assert.equal(auth.read(),null,'shared-device sessions must not persist');
 auth.save(state,true);
 session.clear();
 assert.deepEqual(auth.read(),state,'private-device session should recover');
 const rotated={...state,token:'new-jwt',refresh_token:'refresh-two'};
 auth.save(rotated,true);
 session.clear();
 assert.deepEqual(auth.read(),rotated,'rotated refresh token must replace stale token');
 now+=8*86400000;
 session.clear();
 assert.equal(auth.read(),null,'remember-me access must expire');
 auth.save(rotated,true);
 auth.clear();
 assert.equal(auth.read(),null,'explicit logout must erase both stores');
 assert.match(client,/name="remember" value="yes"/);
 assert.match(client,/wfClearAuth\(\);if\(previous\)/);
});

test('Password recovery goes to the correct Work origin and never enables public MINI demo',()=>{
 assert.match(client,/location\.pathname\.startsWith\('\/LINE\/workforce-mini'\)\?'\/LINE\/workforce\/'\:'\/'/);
 assert.match(client,/app\.mode=wfMiniMode\?'real':'demo';app\.tenantId=wfMiniMode\?'':DEMO_ID/);
});

test('MINI uses the same Supabase tenancy, separate LINE context, no public demo by default',()=>{
 assert.match(client,/if\(wfMiniMode&&!app\.token\)\{app\.mode='real'/);
 assert.match(client,/app\.mode=wfMiniMode\?'real':'demo'/);
 assert.match(client,/wfMiniMode\?'':'<button class="btn" data-action="demoMode"/);
 assert.match(client,/channel_env:wfMiniMode\?wfMiniEnvironment:null/);
 assert.match(client,/const selectedId=wfMiniMode\?config\.miniEnvironments/);
 assert.match(client,/liff\.init\(\{liffId:selected\.liffId,withLoginOnExternalBrowser:false\}\)/);
});
test('Each environment uses correct LIFF ID with server-side LINE audience verification',()=>{
 for(const [env,id] of [['developing','2012649404-nz3TBQdG'],['review','2012649405-ADWLM7h9'],['published','2012649406-KzlLEZT6']]){
  assert.ok(edge.includes(env+':{channelId:"'+id.split('-')[0]+'",liffId:"'+id+'"}'));
  assert.ok(setup.includes(id));
 }
 for(const expression of [/type==="mini"\?miniChannel\(env\)\.channelId:LINE_LOGIN_ID/,/client_id:channelId/,/line\.aud!==channelId/,/const actor=await getUser\(req\)/,/const m=await member\(tenant,actor\)/,/LINE_ACCOUNT_MISMATCH_UNBIND_FIRST/])assert.match(edge,expression);
 assert.match(client,/if\(!Object\.hasOwn\(wfMiniEnvironmentNames,wfMiniEnvironment\)\)throw/);
});
test('Original authorization and GPS are preserved, with no fake LINE user injection',()=>{
 assert.match(client,/if\(app\.mode!=='real'\|\|!app\.token\)throw Error\('請先登入企業帳號'\)/);
 assert.match(client,/wm_clock/);
 assert.match(client,/getCurrentPosition/);
 assert.match(edge,/NO_ACTIVE_MEMBERSHIP/);
 assert.match(edge,/DEMO_NOT_ELIGIBLE_FOR_LINE/);
 assert.doesNotMatch(client,/line_sub\s*:\s*liff\.getProfile/);
 assert.match(setup,/不免除定位授權/);
});
