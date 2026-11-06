 (async()=>{
 const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
"use strict";
const mount=document.getElementById("site-auth-root");
if(!mount)return;
const SB_URL="https://unapiwajmgqqtdkixaab.supabase.co";
const SB_KEY="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
const RETURN_KEY="line-site-auth-return-v1";
const CUSTOMER_KEY="line-saas-customer-session-v2";
const BIND_SHOP="greenfield-salon"; // Existing active headquarters LINE LIFF entry.
const current=new URL(location.href);
const customer=createClient(SB_URL,SB_KEY,{
 auth:{storageKey:CUSTOMER_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
const operator=createClient(SB_URL,SB_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
let currentIdentity=null,busy=false;
function el(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
}
function draw(status,message){
 mount.replaceChildren();
 const holder=el("div","site-auth-inner");
 if(status==="pending"){
  const caption=el("span","site-auth-name","正在確認登入狀態");
  caption.setAttribute("role","status");holder.append(caption);
 }else if(status==="linked"){
  const name=el("span","site-auth-name");
  const avatar=el("span","site-auth-avatar","L");
  const label=el("span","site-auth-label",currentIdentity?.displayName||"LINE 使用者");
  name.title=currentIdentity?.displayName||"LINE 使用者";
  name.append(avatar,label);
  const logout=el("button","site-auth-button","登出");
  logout.type="button";logout.disabled=busy;logout.addEventListener("click",()=>{void logOut()});
  holder.append(name,logout);
 }else{
  const login=el("button","site-auth-button site-auth-login");
  login.type="button";login.disabled=busy;
  login.append(el("span","site-auth-line-logo","LINE"),document.createTextNode("使用 LINE 登入"));
  login.addEventListener("click",startLineLogin);
  holder.append(login);
 }
 if(message){const hint=el("div","site-auth-feedback",message);hint.setAttribute("role","alert");holder.append(hint);}
 mount.append(holder);
}
function isReturnAllowed(candidate){
 if(typeof candidate!=="string"||!candidate||candidate.length>600)return false;
 // Return only to one of this product's same-origin public pages.
 if(!/^(?:home|directory|board|poster|merchant-center|merchant-register|privacy|terms)\.html(?:\?[^#]*)?$/.test(candidate))return false;
 try{
  const u=new URL(candidate,location.origin+location.pathname.replace(/[^/]*$/,""));
  return u.origin===location.origin && /^\/LINE\/(?:booking|saas)\/(?:home|directory|board|poster|merchant-center|merchant-register|privacy|terms)\.html$/.test(u.pathname);
 }catch(_){return false}
}
function currentReturn(){
 let name=location.pathname.split("/").pop()||"home.html";
 if(!/^(?:home|directory|board|poster|merchant-center|merchant-register|privacy|terms)\.html$/.test(name))name="home.html";
 const qs=new URLSearchParams(location.search);
 // Never persist OAuth credentials, secret tokens or callback state.
 for(const k of [...qs.keys()])if(/token|code|state|liff|secret|key/i.test(k))qs.delete(k);
 const result=name+(qs.toString()?"?"+qs.toString():"");
 return isReturnAllowed(result)?result:"home.html";
}
function startLineLogin(){
 if(busy)return;
 busy=true;
 draw("guest");
 const returnTo=currentReturn();
 try{sessionStorage.setItem(RETURN_KEY,JSON.stringify({target:returnTo,at:Date.now()}))}catch(_){}
 const start=new URL("./",location.href);
 start.searchParams.set("view","customer");
 start.searchParams.set("merchant",BIND_SHOP);
 start.searchParams.set("tab","home");
 start.searchParams.set("site_return",returnTo);
 location.assign(start.href);
}
async function getIdentity(){
 const preferOperator=/^(?:staff|platform)$/.test(new URLSearchParams(location.search).get("view")||"")||
   /\/merchant-register\.html$/.test(location.pathname);
 const [customerResult,operatorResult]=await Promise.all([
   customer.auth.getSession(),operator.auth.getSession()
 ]);
 const customerSession=customerResult?.data?.session;
 const operatorSession=operatorResult?.data?.session;
 let lineIdentity=null,operatorIdentity=null;
 if(customerSession?.access_token){
  const response=await customer.rpc("so_site_header_identity");
  if(!response.error && typeof response.data?.display_name==="string"&&response.data.display_name.trim()){
   lineIdentity={type:"customer",displayName:response.data.display_name.trim(),client:customer};
  }
 }
 const staffUser=operatorSession?.user;
 if(staffUser&&!staffUser.is_anonymous){
  operatorIdentity={type:"operator",displayName:staffUser.email||"商家使用者",client:operator};
 }else if(staffUser?.is_anonymous){
  const context=await operator.rpc("so_my_context");
  if(!context.error && context.data?.memberships?.some(x=>x.slug?.startsWith("qa-")))
   operatorIdentity={type:"operator",displayName:"門市管理員",client:operator};
 }
 return preferOperator?(operatorIdentity||lineIdentity):(lineIdentity||operatorIdentity);
}
async function refresh(){
 if(busy)return;
 draw("pending");
 try{
  currentIdentity=await getIdentity();
  draw(currentIdentity?"linked":"guest");
 }catch(_error){
  currentIdentity=null;draw("guest","暫時無法確認登入狀態，請重新整理。");
 }
}
async function logOut(){
 if(busy||!currentIdentity)return;
 busy=true;draw("linked");
 try{
  const result=await currentIdentity.client.auth.signOut();
  if(result.error)throw result.error;
  if(currentIdentity.type==="operator"){try{localStorage.removeItem("line_saas_real_qa_v1")}catch(_){}}
  try{sessionStorage.removeItem(RETURN_KEY)}catch(_){}
  currentIdentity=null;
  busy=false;
  // Refresh existing booking forms so their protected actions no longer show
  // data cached from the previous signed-in Supabase account.
  location.reload();
 }catch(error){
  busy=false;draw("linked","登出失敗，請稍後重試。");
 }
}
window.addEventListener("line-site-auth-changed",()=>{void refresh()});
customer.auth.onAuthStateChange(()=>{setTimeout(()=>{void refresh()},0)});
operator.auth.onAuthStateChange(()=>{setTimeout(()=>{void refresh()},0)});
window.addEventListener("focus",()=>{if(!document.hidden)void refresh()});
window.addEventListener("pageshow",()=>{void refresh()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh()});
void refresh();
})();
