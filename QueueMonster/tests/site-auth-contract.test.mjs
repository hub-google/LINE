import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
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
 const pages=["index","home","directory","board","poster","merchant-center","privacy","terms"];
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
 assert.match(build,/copyFile\(path\.join\(src, "site-auth\.css"/);
 assert.match(workflow,/site-auth-contract\.test\.mjs/);
 assert.match(workflow,/site-auth\.css site-auth\.js/);
 assert.match(workflow,/node --check QueueMonster\/saas\/site-auth\.js/);
 const res=spawnSync(process.execPath,["--check"],{input:code,encoding:"utf8"});
 assert.equal(res.status,0,res.stderr);
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
function createScenario({lineName="",customerSession=false,staffName="",url="https://hub-google.github.io/LINE/booking/directory.html?mode=game"}={}){
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
    async getSession(){return {data:{session:logged?{access_token:"session",user:{is_anonymous:type==="customer",email:staffName}}:null},error:null}},
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
 const executable=code.replace('const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");','const createClient=globalThis.__siteAuthCreateClient;');
 vm.runInNewContext(executable,{...sandbox,__siteAuthCreateClient:createClient},{filename:"site-auth.js",timeout:1500});
 return {rootNode,state,memory};
}
async function flush(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}
function controls(root){return root.children.flatMap(x=>x.children)}
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
 const logout=controls(ui.rootNode).find(x=>x.tag==="button");
 logout.handlers.click();await flush();
 assert.equal(ui.state.signedOut,"operator");
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
 assert.match(edge,/so_platform_line_identities/);
 assert.match(edge,/identity\(req, db\)/);
 assert.match(edge,/verified\?\.login_channel_id===expectedChannelId/);
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
