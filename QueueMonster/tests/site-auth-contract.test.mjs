import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {existsSync,readFileSync as rawReadFile} from "node:fs";
import vm from "node:vm";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const code=read("saas/site-auth.js");
const style=read("saas/site-auth.css");
const index=read("saas/index.html");
const sql=read("supabase/migrations/20261105150000_site_header_line_identity.sql");
const workflow=read("../.github/workflows/line-saas-pages.yml");
const build=read("../.github/scripts/build-line-saas.mjs");

test("all pages share a real user identity with clickable login/logout",()=>{
 const pages=["index","home","directory","board","merchant-center","privacy","terms"];
 for(const page of pages){
  const html=read("saas/"+page+".html");
  assert.match(html,/id="site-auth-root"/,page+" missing account widget");
  assert.match(html,/href="\.\/site-auth\.css"/,page+" missing styling");
  assert.match(html,/src="\.\/site-auth\.js"/,page+" missing action code");
 }
 assert.match(style,/\.site-auth-slot/);
 assert.match(style,/\.site-auth-name/);
 assert.match(style,/\.site-auth-login/);
 assert.match(style,/@media\(max-width:420px\)/);
 assert.match(build,/copyFile\(path\.join\(src, "site-auth\.js"/);
 assert.match(build,/copyFile\(path\.join\(src, "public-config\.js"/);
 assert.match(workflow,/site-auth\.css site-auth\.js public-config\.js/);
 assert.match(build,/copyFile\(path\.join\(src, "site-auth\.css"/);
 assert.match(workflow,/site-auth-contract\.test\.mjs/);
 assert.match(workflow,/site-auth\.css site-auth\.js/);
 assert.match(workflow,/node --check QueueMonster\/saas\/site-auth\.js/);
 const res=spawnSync(process.execPath,["--check"],{input:code,encoding:"utf8"});
 assert.equal(res.status,0,res.stderr);
});

test("LINE logo comes directly from the user-supplied icon asset rather than a text badge",()=>{
 const file=read("saas/line-app-icon.svg");
 assert.match(file,/<image width="320" height="320" href="data:image\/png;base64,/);
 assert.ok(file.length>3000,"must embed the supplied app icon and not a fake text logo");
 assert.match(style,/\.site-auth-button\.site-auth-login::before/);
 assert.match(style,/line-app-icon\.svg/);
 assert.doesNotMatch(style,/\.site-auth-line-logo\{display:inline-grid/);
 assert.doesNotMatch(code,/el\("span","site-auth-line-logo","LINE"\)/);
 assert.match(code,/document\.createTextNode\("使用 LINE 登入"\)/);
 assert.match(build,/copyFile\(path\.join\(src, "line-app-icon\.svg"\)/);
 assert.match(workflow,/line-app-icon\.svg/);
});
test("only server-verified LINE account data is shown, not anonymous Supabase user",()=>{
 assert.match(sql,/l\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/l\.updated_at between \(now\(\) - interval '30 days'\)/);
 assert.match(sql,/l\.login_channel_id/);
 assert.match(sql,/revoke all on function public\.so_site_header_identity\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.so_site_header_identity\(\) to authenticated/);
 assert.match(code,/rpc\("so_site_header_identity"\)/);
 assert.match(code,/typeof response\.data\?\.display_name==="string"/);
 assert.match(code,/auth\.signOut\(\)/);
 assert.match(code,/location\.reload\(\)/);
 assert.match(code,/site_return/);
 assert.match(index,/function finishPublicHeaderLogin/);
 assert.match(index,/lineLinkStatus==="linked"&&finishPublicHeaderLogin\(\)/);
 assert.match(index,/incomingParam\("site_return"\)/);
 assert.match(index,/location\.replace\(destination\.pathname\+destination\.search\)/);
});
function createScenario({lineName="",customerSession=false,staffName="",staffProvider="email",url="https://hub-google.github.io/LINE/booking/directory.html?mode=game"}={}){
 const state={signedOut:null,navigated:null,reloaded:false};
 function node(tag){
  return {tag,className:"",textContent:"",children:[],title:"",disabled:false,handlers:{},
   setAttribute(name,value){this[name]=value},
   append(...items){this.children.push(...items)},
   appendChild(x){this.children.push(x);return x},
   replaceChildren(...items){this.children=items},
   addEventListener(event,fn){this.handlers[event]=fn}
  };
 }
 const rootNode=node("mount");
 const doc={getElementById(name){return name==="site-auth-root"?rootNode:null},
  createElement:node,createTextNode(text){const n=node("text");n.textContent=text;return n},
  addEventListener(){}};
 const current=new URL(url);
 const location={href:url,origin:current.origin,pathname:current.pathname,search:current.search,assign(target){state.navigated=target},reload(){state.reloaded=true}};
 const window={addEventListener(){}};
 const memory={};const sessionStorage={setItem(k,v){memory[k]=v},getItem(k){return memory[k]??null},removeItem(k){delete memory[k]}};
 const localStorage={removeItem(){}};
 function clientFor(type){
  const logged=type==="customer"?customerSession:Boolean(staffName);
  return {
   auth:{
    async getSession(){return {data:{session:logged?{access_token:"session",user:{id:type+"-id",is_anonymous:type==="customer",email:staffName,app_metadata:{provider:type==="customer"?"anonymous":staffProvider}}}:null},error:null}},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
    async signOut(){state.signedOut=type;return {error:null}}
   },
   async rpc(name){
    if(name==="so_site_header_identity")return {data:lineName?{display_name:lineName}:null,error:null};
    if(name==="so_my_context")return {data:{memberships:[]},error:null};
    return {data:null,error:{message:"Unknown RPC"}};
   }
  }
 }
 const clients=[clientFor("customer"),clientFor("operator")];
 let index=0;
 const createClient=()=>clients[index++];
 const sandbox={createClient,document:doc,window,location,localStorage,sessionStorage,URL,URLSearchParams,Date,Promise,console};
 const executable=code.replace('const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");','const createClient=globalThis.__siteAuthCreateClient;')
   .replace('const {SUPABASE_URL:SB_URL,SUPABASE_PUBLISHABLE_KEY:SB_KEY}=await import("./public-config.js");',
     'const SB_URL="https://test.supabase.co";const SB_KEY="test-publishable-key";');
 vm.runInNewContext(executable,{...sandbox,__siteAuthCreateClient:createClient},{filename:"site-auth.js",timeout:1500});
 return {rootNode,state,memory};
}
async function flush(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}
function controls(root){
 const list=[];
 function visit(node){
  for(const child of node?.children||[]){list.push(child);visit(child)}
 }
 visit(root);
 return list;
}
test("anonymous visitor sees functional LINE login and retains return destination",async()=>{
 const ui=createScenario({customerSession:true});
 await flush();
 const controlsList=controls(ui.rootNode);
 const login=controlsList.find(x=>x.tag==="button");
 assert.ok(login,"missing login button");
 assert.match(login.children.map(x=>x.textContent).join(""),/LINE 登入/);
 login.handlers.click();
 assert.ok(ui.state.navigated);
 const dest=new URL(ui.state.navigated);
 assert.equal(dest.pathname,"/LINE/booking/");
 assert.equal(dest.searchParams.get("view"),"customer");
 assert.equal(dest.searchParams.get("merchant"),null);
 assert.match(dest.searchParams.get("site_return")||"",/directory\.html\?mode=game/);
 assert.match(ui.memory["line-site-auth-return-v1"],/directory\.html\?mode=game/);
});
test("LINE login uses the selected merchant, not a built-in sample store",async()=>{
 const ui=createScenario({url:"https://hub-google.github.io/LINE/booking/directory.html?merchant=store-123&mode=search"});
 await flush();
 const login=controls(ui.rootNode).find(x=>x.tag==="button");
 assert.ok(login);
 login.handlers.click();
 const dest=new URL(ui.state.navigated);
 assert.equal(dest.searchParams.get("merchant"),"store-123");
 assert.equal(dest.searchParams.get("view"),"customer");
 assert.match(dest.searchParams.get("site_return")||"",/merchant=store-123/);
});
test("home and directory LINE logins do not require a merchant",async()=>{
 for(const url of ["https://hub-google.github.io/LINE/booking/home.html",
                   "https://hub-google.github.io/LINE/booking/directory.html?mode=search",
                   "https://hub-google.github.io/LINE/booking/directory.html?mode=mine"]){
  const ui=createScenario({url});
  await flush();
  const login=controls(ui.rootNode).find(x=>x.tag==="button");
  assert.ok(login);
  assert.match(login.children.map(x=>x.textContent).join(""),/使用 LINE 登入/);
  login.handlers.click();
  const dest=new URL(ui.state.navigated);
  assert.equal(dest.searchParams.get("view"),"customer");
  assert.equal(dest.searchParams.get("merchant"),null);
  assert.match(dest.searchParams.get("site_return")||"",/\.html/);
  assert.doesNotMatch(JSON.stringify(ui.rootNode),/請先選擇店家/);
 }
});
test("unscoped login keeps shop QR code context when present",async()=>{
 const ui=createScenario({url:"https://hub-google.github.io/LINE/booking/board.html?merchant=store-123"});
 await flush();
 const login=controls(ui.rootNode).find(x=>x.tag==="button");
 assert.ok(login);
 login.handlers.click();
 const dest=new URL(ui.state.navigated);
 assert.equal(dest.searchParams.get("merchant"),"store-123");
 assert.match(dest.searchParams.get("site_return")||"",/board\.html/);
});
test("verified LINE user appears by real display name and logout signs out active customer session",async()=>{
 const ui=createScenario({customerSession:true,lineName:"預約人王小姐"});
 await flush();
 const controlsList=controls(ui.rootNode);
 const label=controlsList.find(x=>x.className==="site-auth-name");
 assert.ok(label);
 assert.match(label.children.map(x=>x.textContent).join(""),/預約人王小姐/);
 const logout=controlsList.find(x=>x.tag==="button");
 assert.equal(logout.textContent,"登出");
 logout.handlers.click();
 await flush();
 assert.equal(ui.state.signedOut,"customer");
 assert.equal(ui.state.reloaded,true);
});
test("staff pages show actual operator identity and logout operator account",async()=>{
 const ui=createScenario({customerSession:true,lineName:"LINE顧客",staffName:"staff@example.test",url:"https://hub-google.github.io/LINE/booking/?view=staff"});
 await flush();
 const names=controls(ui.rootNode).find(x=>x.className==="site-auth-name");
 assert.match(names.children.map(x=>x.textContent).join(""),/staff@example\.test/);
 const logout=controls(ui.rootNode).find(x=>x.tag==="button"&&x.textContent==="登出");
 assert.ok(logout,"the separate logout button must remain available");
 logout.handlers.click();await flush();
 assert.equal(ui.state.signedOut,"operator");
});

test("Email-password users get the password action, Google and LINE accounts do not",async()=>{
 const email=createScenario({staffName:"email@example.test",staffProvider:"email",url:"https://hub-google.github.io/LINE/booking/?view=staff"});
 await flush();
 assert.ok(controls(email.rootNode).some(x=>x.textContent==="修改密碼"),"Email password menu action missing");
 assert.ok(controls(email.rootNode).some(x=>x.tag==="summary"),"Email account is not clickable");
 const google=createScenario({staffName:"google@example.test",staffProvider:"google",url:"https://hub-google.github.io/LINE/booking/?view=staff"});
 await flush();
 assert.equal(controls(google.rootNode).some(x=>x.textContent==="修改密碼"),false);
 assert.equal(controls(google.rootNode).some(x=>x.tag==="summary"),false);
 const line=createScenario({customerSession:true,lineName:"LINE 顧客"});
 await flush();
 assert.equal(controls(line.rootNode).some(x=>x.textContent==="修改密碼"),false);
 assert.equal(controls(line.rootNode).some(x=>x.tag==="summary"),false);
});

test("customer pages do not show an operator account from the same browser",async()=>{
 const ui=createScenario({customerSession:false,lineName:"",staffName:"manager@example.test",url:"https://hub-google.github.io/LINE/booking/directory.html?mode=search"});
 await flush();
 const list=controls(ui.rootNode);
 assert.equal(list.some(x=>x.className==="site-auth-name"),false);
 const login=list.find(x=>x.tag==="button");
 assert.match(login.children.map(x=>x.textContent).join(""),/LINE 登入/);
});
test("merchant portal never falls back to a LINE customer identity",async()=>{
 const ui=createScenario({customerSession:true,lineName:"一般顧客",url:"https://hub-google.github.io/LINE/booking/?view=staff&merchant=shop-123"});
 await flush();
 const list=controls(ui.rootNode);
 assert.equal(list.some(x=>x.className==="site-auth-name"),false);
 const login=list.find(x=>x.tag==="button");
 assert.equal(login.textContent,"店家登入");
 assert.equal(login.className,"site-auth-button","店家登入不可顯示 LINE 圖示");
 login.handlers.click();
 assert.equal(ui.state.navigated,"./merchant-register.html?mode=login");
});
test("headquarters page shows only headquarters sign-in when the operator lacks HQ role",async()=>{
 const ui=createScenario({staffName:"merchant@example.test",url:"https://hub-google.github.io/LINE/booking/?view=platform"});
 await flush();
 const list=controls(ui.rootNode);
 assert.equal(list.some(x=>x.className==="site-auth-name"),false);
 const login=list.find(x=>x.tag==="button");
 assert.equal(login.textContent,"總部登入");
 assert.equal(login.className,"site-auth-button","總部登入不可顯示 LINE 圖示");
 login.handlers.click();
 assert.equal(ui.state.navigated,"./platform-login.html");
});

test("platform LINE identity is verified independently from store selection",()=>{
 const edge=read("supabase/functions/line-bridge/index.ts");
 const migration=read("supabase/migrations/20261110113000_platform_customer_line_identity.sql");
 const session=read("saas/app/line-session.js");
 const entry=read("saas/app/customer-booking.js");
 const gate=read("saas/app/data-loading.js");
 const redirect=read("saas/assets/index/redirect.js");
 assert.match(edge,/payload\.action === "link-platform"/);
 assert.match(edge,/payload\.action === "resume-platform"/);
 assert.match(edge,/lineVerify\(idToken,accessToken,\{channelId:platformChannel\}\)/);
 assert.match(edge,/qm_platform_line_identities/);
 assert.match(edge,/identity\(req, db\)/);
 assert.match(edge,/reusablePlatformLineIdentity\(db,user\.id,expectedChannelId\)/);
 assert.match(edge,/isReusableLineIdentity\(platform,channelId\)/);
 assert.match(edge,/\.eq\("user_id",userId\)\.eq\("login_channel_id",channelId\)/);
 assert.match(edge,/if \(!ownOa/);
 assert.match(migration,/create table if not exists public\.so_platform_line_identities/);
 assert.match(migration,/revoke all on public\.so_platform_line_identities from public, anon, authenticated/);
 assert.match(migration,/alter table public\.so_platform_line_identities enable row level security/);
 assert.match(migration,/so_site_header_identity/);
 assert.match(migration,/so_my_merchant_activity/);
 assert.match(session,/action:"resume-platform"/);
 assert.match(session,/action:"link-platform"/);
 assert.match(session,/isSafeMerchant\(routeState\.slug\)\?"&merchant="/);
 assert.match(entry,/if\(!routeState\.slug\)/);
 assert.match(gate,/routeState\.view==="customer"&&!routeState\.slug/);
 assert.match(redirect,/"site_return"/);
 assert.doesNotMatch(code,/請先選擇店家，才能進行 LINE 登入/);
});


test("iPhone customer entry asks consent before starting external LINE login",()=>{
 const session=read("saas/app/line-session.js");
 const directoryJs=read("saas/assets/directory/main.js");
 const directoryHtml=read("saas/directory.html");
 const directoryCss=read("saas/assets/directory/page.css");
 assert.match(code,/start\.searchParams\.set\("site_login","1"\)/);
 assert.match(session,/new URLSearchParams\(location\.search\)\.get\("site_login"\)==="1"/);
 assert.match(session,/lineState\.lineLinkStatus="not-logged-in"/);
 assert.doesNotMatch(session,/if\(!window\.liff\.isInClient\(\)\)window\.liff\.login/);
 assert.match(directoryJs,/so_site_header_identity/);
 assert.match(directoryJs,/mineIdentityState="guest"/);
 assert.match(directoryJs,/p_category:match\[0\]/);
 assert.match(directoryHtml,/class="filter-details"/);
 assert.match(directoryCss,/\.filter-details>\.filter-summary/);
});


test("personal records show an identity pending state before network and resolve without LINE config for guests",()=>{
 const source=read("saas/assets/directory/main.js");
 const load=source.slice(source.indexOf("async function load(){"));
 assert.match(load,/if\(mode==="mine"\)\{\s*render\(\);/);
 assert.match(load,/const confPromise=fetch\(bridge/);
 assert.match(load,/mineIdentityState="guest"/);
 assert.match(load,/identityTimer=setTimeout/);
 assert.match(load,/if\(identityTimer!==null\)clearTimeout\(identityTimer\)/);
 const identityStart=load.indexOf('if(mode==="mine"){\n  render();');
 const fetchStart=load.indexOf('const confPromise=fetch(bridge');
 assert.ok(identityStart>=0 && identityStart<fetchStart,"pending UI must render before LINE bridge fetch");
});


test("privacy and terms pages share one legal CSS source",()=>{
 const privacy=rawReadFile(path.join(root,"saas/privacy.html"),"utf8");
 const terms=rawReadFile(path.join(root,"saas/terms.html"),"utf8");
 for(const page of [privacy,terms])
  assert.match(page,/assets\/privacy\/page\.css\?build=__LINE_SAAS_BUILD__/);
 assert.equal(existsSync(path.join(root,"saas/assets/terms/page.css")),false);
});


test("all frontends use one public Supabase URL and publishable-key definition",()=>{
 const config=read("saas/public-config.js");
 const basename="unapiwajmgqqtdkixaab.supabase.co";
 assert.match(config,/export const SUPABASE_URL=/);
 assert.match(config,/export const SUPABASE_PUBLISHABLE_KEY=/);
 assert.equal((config.match(new RegExp(basename,"g"))||[]).length,1);
 const modules=[
  "saas/site-auth.js",
  "saas/app/line-session.js",
  "saas/assets/directory/main.js",
  "saas/assets/board/main.js",
  "saas/assets/merchant-register/main.js",
  "saas/assets/platform-login/main.js",
 ];
 for(const file of modules){
  const source=read(file);
  assert.doesNotMatch(source,/unapiwajmgqqtdkixaab|sb_publishable_L09/,file+" still duplicates public config");
  assert.match(source,/public-config\.js/,file+" must use the shared configuration");
 }
});
