/** Run LINE.js, AntiScam API and bridge on this device only, for a five-hour pilot. */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalSettings, storeLineToken } from './configure.mjs';
const execAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BRIDGE = join(ROOT, 'bridge');
const children=[];
let stopping=false;
function start(label,entry,cwd,envFile){
  const args=envFile ? [`--env-file=${envFile}`,entry] : [entry];
  const p=spawn(process.execPath,args,{cwd,stdio:'inherit',windowsHide:false});
  p.on('exit',(code,signal)=>{
    if(!stopping){console.error(`${label} stopped unexpectedly (code=${code}, signal=${signal}). Disabling pilot.`);void stop(1);}
  });
  children.push(p);
  return p;
}
async function stop(exitCode=0){
  if(stopping)return;
  stopping=true;
  console.log('Stopping local AntiScam pilot.');
  for (const child of [...children].reverse()) if(child.exitCode===null && !child.killed) child.kill();
  // No credential upload, no GitHub runner, no cloud session persistence.
  setTimeout(()=>process.exit(exitCode),1500).unref();
}
process.on('SIGINT',()=>void stop());
process.on('SIGTERM',()=>void stop());
async function ready(url,timeout=45000){
  const end=Date.now()+timeout;
  while(Date.now()<end && !stopping){
    try{const res=await fetch(url,{signal:AbortSignal.timeout(1200)});if(res.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,650));
  }
  throw Error(`Service did not become ready: ${url}`);
}
async function bootstrapCommunity(chatId,password){
  const base='http://127.0.0.1:3000';
  const login=await fetch(`${base}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
  if(!login.ok)throw Error('AntiScam local admin login failed');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  if(!cookie)throw Error('AntiScam session cookie missing');
  const list=await fetch(`${base}/api/communities`,{headers:{cookie}});
  if(!list.ok)throw Error('Cannot read local communities');
  const data=await list.json();
  if(!data.communities?.some(c=>c.id===chatId)){
    const res=await fetch(`${base}/api/communities`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'OpenChat 本機實機測試',id:chatId})});
    if(!res.ok)throw Error(`Failed to create local monitor community (${res.status})`);
  }
  const current=await fetch(`${base}/api/communities`,{headers:{cookie}});
  const all=(await current.json()).communities||[];
  const c=all.find(c=>c.id===chatId);
  if(c?.mode!=='monitor'||c?.automation_approved) {
    const res=await fetch(`${base}/api/communities/${chatId}`,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({mode:'monitor'})});
    if(!res.ok)throw Error(`Failed to enforce monitor mode (${res.status})`);
  }
}
try{
  const {api,bridge,upstream}=await loadLocalSettings();
  if(!/^[m][A-Za-z0-9]{10,64}$/.test(bridge.OPENCHAT_CHAT_IDS??''))throw Error('Please configure an OpenChat m... channel ID first.');
  if(api.DRY_RUN!=='true'||bridge.OPENCHAT_LIVE_VERIFIED!=='false'||bridge.OPENCHAT_ACTIONS_ENABLED!=='false')throw Error('Safety check failed: the local pilot must start in monitor-only / dry-run mode.');
  if(!api.ADMIN_PASSWORD || !api.WEBHOOK_SECRET || !bridge.OPENCHAT_BRIDGE_TOKEN)throw Error('Local secrets not configured. Run 01-install-and-login.ps1 first.');
  start('LINE.js','dist/main.js',upstream);
  await ready('http://127.0.0.1:3789/');
  if(!bridge.LINEJS_API_TOKEN){
    console.log('Creating local LINE.js bot API token (kept on this computer).');
    const result=await execAsync(process.execPath,['scripts/cli.mjs','token','--yes'],{cwd:upstream,timeout:20000,encoding:'utf8',maxBuffer:16384});
    await storeLineToken(result.stdout.trim());
  }
  start('AntiScam API','src/server.js',ROOT,join(ROOT,'.env'));
  await ready('http://127.0.0.1:3000/health');
  await bootstrapCommunity(bridge.OPENCHAT_CHAT_IDS,api.ADMIN_PASSWORD);
  start('OpenChat bridge','runner.js',BRIDGE,join(BRIDGE,'.env'));
  await ready('http://127.0.0.1:3010/health');
  console.log('\n=== LOCAL MONITOR ACTIVE ===');
  console.log('AntiScam dashboard: http://127.0.0.1:3000');
  console.log('LINE.js local login: http://127.0.0.1:3789');
  console.log(`OpenChat room: ${bridge.OPENCHAT_CHAT_IDS}`);
  console.log('Monitoring only. Deleting messages and removing members are DISABLED.');
  console.log('Local file data and session remain on this PC. Do not upload .env or session.json.');
  console.log('The pilot will stop after five hours or when this window is closed / Ctrl+C.');
  setTimeout(()=>void stop(),5*60*60*1000);
}catch(e){console.error(`Cannot start local pilot: ${e.message}`);await stop(1);process.exitCode=1;}
