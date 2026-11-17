import {cp,readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import os from "node:os";

const ids={developing:"2012649101-EFX2gymX",review:"2012649102-rNb39YpL",published:"2012649103-s6KPdX4H"};
const environments=Object.keys(ids);
const repo=path.resolve(".");
const source=path.join(repo,"QueueMonster/saas");
const output=path.resolve(process.argv[2]||"queue-mini-dist");
const temp=await import("node:fs/promises").then(fs=>fs.mkdtemp(path.join(os.tmpdir(),"qm-mini-")));
function requireReplace(text,needle,replacement,label){
  if(!text.includes(needle))throw Error("MINI build contract changed: "+label);
  return text.replace(needle,replacement);
}
async function patch(file,fn){
  const old=await readFile(file,"utf8");
  const value=fn(old);
  if(value===old)throw Error("MINI source patch did not change: "+file);
  await writeFile(file,value,"utf8");
}
const sha=(process.env.GITHUB_SHA||"").trim();
if(!/^[0-9a-f]{40}$/i.test(sha))throw Error("GITHUB_SHA must be set");
const originalBuilder=await readFile(".github/scripts/build-line-saas.mjs","utf8");
const preparedBuilder=requireReplace(originalBuilder,
  'const src = path.resolve("QueueMonster/saas");',
  'const src = path.resolve(process.env.QM_MINI_STAGED_SOURCE);',"builder source");
const tempBuilder=path.join(repo,".github/scripts/.qm-mini-generated-builder.mjs");
await mkdir(output,{recursive:true});
await writeFile(tempBuilder,preparedBuilder,"utf8");
try{
 for(const env of environments){
  const id=ids[env];
  const staged=path.join(temp,"src-"+env),target=path.join(output,env);
  await cp(source,staged,{recursive:true});
  await patch(path.join(staged,"index.html"),html=>{
    html=requireReplace(html,
      '<script src="./assets/index/redirect.js?build=__LINE_SAAS_BUILD__"></script>',
      '<!-- LINE MINI App: no marketing redirect before LIFF initialization -->',"index redirect");
    return requireReplace(html,"</head>",
      '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="./qm-mini.css"></head>',"mini styles")
     .replace("</body>","<script defer src=\"./qm-mini-nav.js\"></script></body>");
  });
  for(const name of ["directory.html","my-records.html"]){
    await patch(path.join(staged,name),html=>requireReplace(html,"</head>",
      '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="./qm-mini.css"></head>',name+" styles")
      .replace("</body>","<script src=\"https://static.line-scdn.net/liff/edge/2/sdk.js\" defer></script><script defer src=\"./qm-mini-nav.js\"></script></body>"));
  }
  await patch(path.join(staged,"app/line-session.js"),text=>{
    // LIFF IDs are public, fixed values. Do not call an Edge Function every
    // time a customer opens a shop merely to retrieve a known public LIFF ID.
    const configStart=text.indexOf("export async function bridgeConfig(){");
    const configEnd=text.indexOf("export function customerUrl(",configStart);
    if(configStart<0||configEnd<0)throw Error("MINI bridge markers changed");
    text=text.slice(0,configStart)+
      'export async function bridgeConfig(){ const merchant=isSafeMerchant(routeState.slug)?routeState.slug:"";'+
      ' if(lineState.lineConfig!==null&&lineState.lineConfigSlug===merchant)return lineState.lineConfig;'+
      ' lineState.lineConfig={liffId:"'+id+'",loginReady:true,messagingReady:false,miniApp:true};'+
      ' lineState.lineConfigSlug=merchant;return lineState.lineConfig;}\n\n'+
      text.slice(configEnd);
    text=requireReplace(text,'lineState.LINE_BRIDGE_URL=lineState.SB_URL+"/functions/v1/line-bridge";',
      'lineState.LINE_BRIDGE_URL=lineState.SB_URL+"/functions/v1/line-bridge";\nlineState.MINI_BRIDGE_URL=lineState.SB_URL+"/functions/v1/qm-mini-session";',"mini bridge");
    const begin=text.indexOf("export async function resumeVerifiedLineSession()");
    const end=text.indexOf("export function authRecoveryKey()",begin);
    if(begin<0||end<0)throw Error("mini resume markers changed");
    let resume=text.slice(begin,end);
    resume=requireReplace(resume,'fetch(lineState.LINE_BRIDGE_URL,{','fetch(lineState.MINI_BRIDGE_URL,{',"mini resume url");
    resume=requireReplace(resume,
      '{action:"resume",slug:routeState.slug}:{action:"resume-platform"}',
      '{action:"resume",slug:routeState.slug,env:"'+env+'"}:{action:"resume-platform",env:"'+env+'"}',"mini resume payload");
    text=text.slice(0,begin)+resume+text.slice(end);
    const linkStart=text.indexOf("const link=async()=>{");
    const linkEnd=text.indexOf("let {res,result}=await link();",linkStart);
    if(linkStart<0||linkEnd<0)throw Error("mini link markers changed");
    let link=text.slice(linkStart,linkEnd);
    link=requireReplace(link,'fetch(lineState.LINE_BRIDGE_URL,{','fetch(lineState.MINI_BRIDGE_URL,{',"mini link url");
    link=requireReplace(link,
      '{action:"link",slug:routeState.slug,idToken,accessToken}:{action:"link-platform",idToken,accessToken}',
      '{action:"link",slug:routeState.slug,idToken,accessToken,env:"'+env+'"}:{action:"link-platform",idToken,accessToken,env:"'+env+'"}',"mini link payload");
    text=text.slice(0,linkStart)+link+text.slice(linkEnd);
    text=text.replaceAll('"https://liff.line.me/"','"https://miniapp.line.me/"');
    // Separate Supabase auth identities prevent MINI links from overwriting
    // existing web LIFF login_channel_id on the same GitHub Pages origin.
    text=requireReplace(text,'"line-saas-customer-session-v2"',
      '"queue-mini-customer-session-v1-'+env+'"',"mini independent session key");
    return text;
  });
  await patch(path.join(staged,"site-auth.js"),text=>{
    text=requireReplace(text,'"so_site_header_identity"','"so_mini_header_identity"',"mini identity header");
    return requireReplace(text,'"line-saas-customer-session-v2"',
      '"queue-mini-customer-session-v1-'+env+'"',"mini header independent auth");
  });
  await patch(path.join(staged,"shared-customer-links.js"),text=>
    requireReplace(text,'"https://liff.line.me/"','"https://miniapp.line.me/"',"mini deep links"));
  await patch(path.join(staged,"assets/directory/main.js"),text=>{
    text=requireReplace(text,
      'const bridge=SB_URL+"/functions/v1/line-bridge?action=config";',
      'const bridge=SB_URL+"/functions/v1/qm-mini-session?action=config&env='+env+'";',"mini directory config");
    text=requireReplace(text,'"so_site_header_identity"','"so_mini_header_identity"',"mini directory identity");
    // Directory store browsing is static; it never needs to query an Edge
    // Function solely for an already-known environment LIFF ID.
    text=requireReplace(text,
      'const confPromise=fetch(bridge,{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}));',
      'const confPromise=Promise.resolve({liffId:"'+id+'",loginReady:true});',"mini static directory config");
    text=requireReplace(text,'"line-saas-customer-session-v2"',
      '"queue-mini-customer-session-v1-'+env+'"',"mini directory independent auth");
    text=text.replaceAll('"so_my_platform_records_page"','"so_mini_platform_records_page"');
    const begin=text.indexOf("// Resolve a merchant's own LIFF app");
    const end=text.indexOf('async function load(){',begin);
    if(begin<0||end<0)throw Error("mini store click markers changed");
    text=text.slice(0,begin)+
      ' // All shop links remain inside this MINI App; never switch to a merchant LIFF.\n'+text.slice(end);
    return text;
  });
  const cmd=spawnSync(process.execPath,[tempBuilder,target],{
    cwd:repo,env:{...process.env,QM_MINI_STAGED_SOURCE:staged},encoding:"utf8"
  });
  if(cmd.status!==0)throw Error("MINI "+env+" build failed: "+String(cmd.stderr||cmd.stdout).slice(-4000));
  await cp(path.join(repo,"QueueMonster/miniapp/qm-mini.css"),path.join(target,"qm-mini.css"));
  await cp(path.join(repo,"QueueMonster/miniapp/qm-mini-nav.js"),path.join(target,"qm-mini-nav.js"));
  await writeFile(path.join(target,"mini-env.json"),JSON.stringify({environment:env,channelId:id.split("-")[0],liffId:id,build:sha},null,2)+"\n");
  console.log("MINI "+env+" => "+target);
 }
 await writeFile(path.join(output,"index.html"),
   '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=./developing/"><title>排隊怪獸 MINI App</title></head><body><a href="./developing/">開啟 Developing</a></body></html>');
}finally{
 await rm(tempBuilder,{force:true});
 await rm(temp,{recursive:true,force:true});
}
