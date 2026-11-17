import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/wm-line/index.ts',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const setup=readFileSync(new URL('../MINI_APP_SETUP.md',import.meta.url),'utf8');

test('WF MINI is opt-in and uses the existing tenant-authenticated application',()=>{
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/new URLSearchParams\(location\.search\)\.get\('mini'\)==='1'/);
 assert.match(client,/if\(wfMiniMode&&!app\.token\)\{app\.mode='real'/);
 assert.match(client,/app\.mode=wfMiniMode\?'real':'demo'/);
 assert.match(html,/id="wfMiniBanner"[^>]*hidden/);
 assert.match(html,/id="wfMiniText"/);
 assert.match(html,/id="wfMiniOpen"/);
 assert.match(setup,/workforce\/\?mini=1/);
});
test('LINE internal channel identity follows Developing Review Published environment',()=>{
 for(const [name,id] of [['developing','2012649404-nz3TBQdG'],['review','2012649405-ADWLM7h9'],['published','2012649406-KzlLEZT6']]){
  assert.ok(edge.includes(name+':{channelId:"'+id.split('-')[0]+'",liffId:"'+id+'"}'),name);
  assert.ok(setup.includes(id),name+' documentation');
 }
 assert.match(client,/config\.miniEnvironments\?\.\[wfMiniEnvironment\]/);
 assert.match(client,/liff\.init\(\{liffId:selected\.liffId,withLoginOnExternalBrowser:false\}\)/);
 assert.match(client,/channel_env:wfMiniMode\?wfMiniEnvironment:null/);
 assert.match(client,/if\(!Object\.hasOwn\(wfMiniEnvironmentNames,wfMiniEnvironment\)\)throw/);
});
test('edge verifies LINE ID token against correct internal channel',()=>{
 assert.match(edge,/if\(type!=="login"&&type!=="mini"\)throw/);
 assert.match(edge,/type==="mini"\?miniChannel\(env\)\.channelId:LINE_LOGIN_ID/);
 assert.match(edge,/client_id:channelId/);
 assert.match(edge,/line\.aud!==channelId/);
 assert.match(edge,/const actor=await getUser\(req\)/);
 assert.match(edge,/const m=await member\(tenant,actor\)/);
 assert.match(edge,/line_sub:verified\.sub/);
 assert.match(edge,/login_channel_id:verified\.channelId/);
 assert.match(edge,/LINE_ACCOUNT_MISMATCH_UNBIND_FIRST/);
 assert.match(edge,/miniEnvironments/);
});
test('MINI authorization cannot grant company access without Supabase login',()=>{
 assert.match(client,/if\(app\.mode!=='real'\|\|!app\.token\)throw Error\('請先登入企業帳號'\)/);
 assert.match(edge,/NO_ACTIVE_MEMBERSHIP/);
 assert.match(edge,/DEMO_NOT_ELIGIBLE_FOR_LINE/);
 assert.doesNotMatch(client,/line_sub\s*:\s*liff\.getProfile/);
 assert.match(client,/getCurrentPosition/);
 assert.match(setup,/不免除定位授權/);
});
