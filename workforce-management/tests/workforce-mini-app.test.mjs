import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/wm-line/index.ts',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const setup=readFileSync(new URL('../MINI_APP_SETUP.md',import.meta.url),'utf8');

test('WF MINI App uses same static app but a distinct opt-in endpoint',()=>{
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/new URLSearchParams\(location\.search\)\.get\('mini'\)==='1'/);
 assert.match(client,/if\(wfMiniMode&&!app\.token\)\{app\.mode='real'/);
 assert.match(client,/app\.mode=wfMiniMode\?'real':'demo'/);
 assert.match(html,/id="wfMiniBanner"[^>]*hidden/);
 assert.match(html,/id="wfMiniText"/);
 assert.match(html,/id="wfMiniOpen"/);
 assert.match(setup,/workforce\/\?mini=1/);
});

test('MINI initializer uses separate LIFF ID and no forged fallback',()=>{
 assert.match(client,/if\(!config\.miniLiffId\|\|!config\.miniConfigured\)throw Error/);
 assert.match(client,/liff\.init\(\{liffId:config\.miniLiffId,withLoginOnExternalBrowser:false\}\)/);
 assert.match(client,/const selectedId=wfMiniMode\?config\.miniLiffId:config\.liffId/);
 assert.match(client,/channel_type:wfMiniMode\?'mini':'login'/);
 assert.match(client,/if\(app\.mode!=='real'\|\|!app\.token\)throw Error\('請先登入企業帳號'\)/);
 assert.doesNotMatch(client,/line_sub\s*:\s*liff\.getProfile/);
});

test('edge checks active tenant Supabase user and correct LINE token audience',()=>{
 assert.match(edge,/const MINI_APP_CHANNEL_ID=Deno\.env\.get\("LINE_MINI_APP_CHANNEL_ID"\)/);
 assert.match(edge,/const MINI_APP_LIFF_ID=Deno\.env\.get\("LINE_MINI_APP_LIFF_ID"\)/);
 assert.match(edge,/if\(type!=="login"&&type!=="mini"\)throw/);
 assert.match(edge,/client_id:channelId/);
 assert.match(edge,/line\.aud!==channelId/);
 assert.match(edge,/const actor=await getUser\(req\)/);
 assert.match(edge,/const m=await member\(tenant,actor\)/);
 assert.match(edge,/line_sub:verified\.sub/);
 assert.match(edge,/login_channel_id:verified\.channelId/);
 assert.match(edge,/miniConfigured:!!MINI_APP_CHANNEL_ID&&!!MINI_APP_LIFF_ID/);
});

test('MINI launch does not change geolocation validation or public demo isolation',()=>{
 assert.match(client,/wm_clock/);
 assert.match(client,/getCurrentPosition/);
 assert.match(client,/const DEMO_ID='98d3505c-cbe6-46ed-a95a-13672e6d98f4'/);
 assert.match(setup,/不免除定位授權/);
});
