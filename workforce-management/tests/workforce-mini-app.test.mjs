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
 assert.match(website,/<title>LINE Workforce/);
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
