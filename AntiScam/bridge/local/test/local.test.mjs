import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'antiscam-local-'));
  try {
    const root=join(dir,'AntiScam');
    const local=join(root,'bridge','local');
    const upstream=join(root,'bridge','.runtime','anti-scam-helper');
    await mkdir(local,{recursive:true});
    await mkdir(upstream,{recursive:true});
    await writeFile(join(upstream,'package.json'),'{}');
    await writeFile(join(upstream,'config.example.yaml'),JSON.stringify({ server:{host:'127.0.0.1',port:3789}, chat:{}, update:{}, api:{ enabled:false, moderation:false } }));
    await mkdir(join(upstream,'node_modules','yaml'),{recursive:true});
    await writeFile(join(upstream,'node_modules','yaml','package.json'),JSON.stringify({main:'index.cjs'}));
    await writeFile(join(upstream,'node_modules','yaml','index.cjs'),'exports.parse=JSON.parse;exports.stringify=x=>JSON.stringify(x,null,2);');
    await writeFile(join(local,'configure.mjs'),await readFile(new URL('../configure.mjs',import.meta.url)));
    const helper=await import(pathToFileURL(join(local,'configure.mjs')).href);
    return await fn({helper,root});
  } finally {await rm(dir,{recursive:true,force:true});}
}

test('local setup generates private secrets, localhost-only access, dry-run and AI off',async()=>fixture(async({helper,root})=>{
  await helper.initialize();
  const s=await helper.loadLocalSettings();
  assert.match(s.api.DATA_ENCRYPTION_KEY,/^[a-f0-9]{64}$/);
  assert.match(s.api.ADMIN_PASSWORD,/^[a-f0-9]{48}$/);
  assert.equal(s.api.HOST,'127.0.0.1');
  assert.equal(s.api.DRY_RUN,'true');
  assert.equal(s.api.AI_ENABLED,'false');
  assert.equal(s.api.STORAGE_DRIVER,'local');
  assert.equal(s.bridge.OPENCHAT_ACTIONS_ENABLED,'false');
  assert.equal(s.bridge.OPENCHAT_LIVE_VERIFIED,'false');
  assert.equal(s.bridge.WEBHOOK_SECRET,s.api.WEBHOOK_SECRET);
  assert.equal(s.bridge.OPENCHAT_BRIDGE_TOKEN,s.api.OPENCHAT_BRIDGE_TOKEN);
  await assert.rejects(()=>helper.configureChat('https://line.me/ti/g2/abc'),/actual m... ID/);
}));

test('local setup reuses its secrets and resets unsafe live flags',async()=>fixture(async({helper,root})=>{
  await helper.initialize();
  const first=await helper.loadLocalSettings();
  const p=join(root,'bridge','.env');
  let s=await readFile(p,'utf8');
  s=s.replace('OPENCHAT_ACTIONS_ENABLED=false','OPENCHAT_ACTIONS_ENABLED=true');
  await writeFile(p,s);
  await helper.initialize();
  const second=await helper.loadLocalSettings();
  assert.equal(second.bridge.OPENCHAT_ACTIONS_ENABLED,'false');
  assert.equal(second.api.ADMIN_PASSWORD,first.api.ADMIN_PASSWORD);
  assert.equal(second.api.WEBHOOK_SECRET,first.api.WEBHOOK_SECRET);
}));
