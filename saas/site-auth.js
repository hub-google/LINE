 (async()=>{
 const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
"use strict";
const mount=document.getElementById("site-auth-root");
if(!mount)return;
const {SUPABASE_URL:SB_URL,SUPABASE_PUBLISHABLE_KEY:SB_KEY}=await import("./public-config.js");
const RETURN_KEY="line-site-auth-return-v1";
const CUSTOMER_KEY="line-saas-customer-session-v2";
const current=new URL(location.href);
const customer=createClient(SB_URL,SB_KEY,{
 auth:{storageKey:CUSTOMER_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
const operator=createClient(SB_URL,SB_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
// Keep this short-password compatibility transform identical to merchant-register/main.js.
// The hosted Supabase Auth minimum is six characters; this is not a strengthener.
async function effectivePassword(email,plaintext){
 if(typeof plaintext!=="string"||!plaintext.length)throw Error("請輸入密碼");
 if(plaintext.length>=6)return plaintext;
 const normalized=(email||"").trim().toLowerCase();
 if(!normalized)throw Error("找不到帳號的電子信箱");
 if(!globalThis.crypto?.subtle)throw Error("瀏覽器無法安全處理密碼，請使用新版瀏覽器");
 const bytes=new TextEncoder().encode("queue-monster-short-password-v1\\0"+normalized+"\\0"+plaintext);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return "qm1-"+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

let currentIdentity=null,busy=false;
function portalMode(){
 const page=location.pathname.split("/").pop()||"";
 const view=new URLSearchParams(location.search).get("view");
 if(view==="platform")return "headquarters";
 if(view==="staff"||["merchant-register.html"].includes(page))return "merchant";
 return "customer";
}
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
  const profile=el("details","site-auth-profile");
  const name=el("summary","site-auth-name");
  const avatarText=currentIdentity?.type==="customer"?"L":currentIdentity?.provider==="google"?"G":"信";
  const avatar=el("span","site-auth-avatar",avatarText);
  const label=el("span","site-auth-label",currentIdentity?.displayName||"LINE 使用者");
  name.title=currentIdentity?.displayName||"LINE 使用者";
  name.setAttribute("aria-label","開啟帳號選單："+(currentIdentity?.displayName||"LINE 使用者"));
  name.append(avatar,label);
  const menu=el("div","site-auth-menu");
  menu.append(el("div","site-auth-menu-heading","帳號設定"));
  menu.append(el("div","site-auth-menu-email",currentIdentity?.displayName||"LINE 使用者"));
  const change=el("button","site-auth-menu-item",
   currentIdentity?.needsPasswordSetup?"設定登入密碼":"修改密碼");
  change.type="button";change.disabled=busy;
  change.addEventListener("click",()=>{profile.open=false;showPasswordDialog()});
  menu.append(change);
  profile.append(name,menu);
  const logout=el("button","site-auth-button","登出");
  logout.type="button";logout.disabled=busy;logout.addEventListener("click",()=>{void logOut()});
  if(currentIdentity?.canChangePassword){
   holder.append(profile,logout);
  }else{
   // Google and LINE accounts have no Queue Monster password to change.
   const plain=el("span","site-auth-name");
   plain.title=currentIdentity?.displayName||"已登入";
   const icon=el("span","site-auth-avatar",avatarText);
   const text=el("span","site-auth-label",currentIdentity?.displayName||"已登入");
   plain.append(icon,text);
   holder.append(plain,logout);
  }
 }else{
  const mode=portalMode();
  const login=el("button",mode==="customer"?"site-auth-button site-auth-login":"site-auth-button");
  login.type="button";login.disabled=busy;
  if(mode==="customer"){
   login.append(document.createTextNode("使用 LINE 登入"));
   login.addEventListener("click",startLineLogin);
  }else{
   login.textContent=mode==="headquarters"?"總部登入":"店家登入";
   login.addEventListener("click",()=>location.assign(mode==="headquarters"?"./platform-login.html":"./merchant-register.html?mode=login"));
  }
  holder.append(login);
 }
 if(message){const hint=el("div","site-auth-feedback",message);hint.setAttribute("role","alert");holder.append(hint);}
 mount.append(holder);
}
// Account menu is shared by marketing, customer, staff and headquarters headers.
document.addEventListener("pointerdown",event=>{
 const open=mount.querySelector(".site-auth-profile[open]");
 if(open&&!open.contains(event.target))open.open=false;
});
document.addEventListener("keydown",event=>{
 if(event.key!=="Escape")return;
 const open=mount.querySelector(".site-auth-profile[open]");
 if(open){open.open=false;open.querySelector("summary")?.focus();}
});

function showPasswordDialog(){
 if(busy||currentIdentity?.type!=="operator"||!currentIdentity?.canChangePassword)return;
 document.querySelector(".site-auth-password-backdrop")?.remove();
 const originalFocus=document.activeElement;
 const backdrop=el("div","site-auth-password-backdrop");
 const dialog=el("section","site-auth-password-dialog");
 dialog.setAttribute("role","dialog");
 dialog.setAttribute("aria-modal","true");
 dialog.setAttribute("aria-labelledby","site-auth-password-title");
 const head=el("div","site-auth-password-head");
 const title=el("h2","site-auth-password-title",currentIdentity?.needsPasswordSetup?"設定登入密碼":"修改密碼");
 title.id="site-auth-password-title";
 const dismiss=el("button","site-auth-password-close","×");
 dismiss.type="button";dismiss.setAttribute("aria-label","關閉修改密碼");
 head.append(title,dismiss);
 const note=el("p","site-auth-password-hint","請輸入新密碼並再次確認，最少輸入 1 個字元。");
 const form=el("form","site-auth-password-form");
 function addField(labelText,autocomplete){
  const label=el("label","site-auth-password-field");
  const text=el("span","",labelText);
  const input=el("input","site-auth-password-input");
  input.type="password";input.required=true;input.minLength=1;
  input.autocomplete=autocomplete;
  label.append(text,input);form.append(label);
  return input;
 }
 const password=addField("新密碼","new-password");
 const confirmation=addField("確認新密碼","new-password");
 const feedback=el("p","site-auth-password-feedback");
 feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
 const actions=el("div","site-auth-password-actions");
 const cancel=el("button","site-auth-password-secondary","取消");
 cancel.type="button";
 const save=el("button","site-auth-password-primary","儲存新密碼");
 save.type="submit";
 actions.append(cancel,save);form.append(feedback,actions);
 dialog.append(head,note,form);backdrop.append(dialog);
 document.body.append(backdrop);
 function close(){
  if(cancel.disabled)return;
  backdrop.remove();
  document.removeEventListener("keydown",onKey);
  if(originalFocus?.isConnected)originalFocus.focus();
 }
 function onKey(event){
  if(event.key==="Escape"){event.preventDefault();close();return}
  if(event.key!=="Tab")return;
  const focusables=[...dialog.querySelectorAll("button:not([disabled]),input:not([disabled])")];
  if(!focusables.length)return;
  if(event.shiftKey&&document.activeElement===focusables[0]){
   event.preventDefault();focusables[focusables.length-1].focus();
  }else if(!event.shiftKey&&document.activeElement===focusables[focusables.length-1]){
   event.preventDefault();focusables[0].focus();
  }
 }
 document.addEventListener("keydown",onKey);
 dismiss.addEventListener("click",close);
 cancel.addEventListener("click",close);
 backdrop.addEventListener("pointerdown",event=>{if(event.target===backdrop)close()});
 form.addEventListener("submit",event=>{event.preventDefault();void(async()=>{
  feedback.classList.remove("error","success");
  if(password.value.length<1){feedback.textContent="請輸入新密碼。";feedback.classList.add("error");return}
  if(password.value!==confirmation.value){feedback.textContent="兩次輸入的密碼不一致。";feedback.classList.add("error");return}
  save.disabled=true;cancel.disabled=true;dismiss.disabled=true;
  feedback.textContent="正在驗證帳號並更新密碼…";
  try{
   // Always revalidate the session before applying a sensitive account change.
   const verified=await operator.auth.getUser();
   if(verified.error||!verified.data?.user||verified.data.user.id!==currentIdentity?.userId)
    throw Error("登入狀態已失效，請重新登入後再試。");
   const liveProvider=verified.data.user.app_metadata?.provider;
   const hasEmailProvider=liveProvider==="email" ||
    (!liveProvider && verified.data.user.identities?.some(item=>item.provider==="email")===true);
   if(!hasEmailProvider)throw Error("此帳號以 Google 或 LINE 登入，沒有需要修改的平台密碼。");
   const effective=await effectivePassword(verified.data.user.email,password.value);
   const changes={password:effective};
   if(verified.data.user.user_metadata?.queue_monster_password_pending===true)
    changes.data={queue_monster_password_pending:false};
   const result=await operator.auth.updateUser(changes);
   if(result.error)throw result.error;
   password.value="";confirmation.value="";
   feedback.classList.add("success");
   feedback.textContent="密碼已更新成功。下次登入請使用新密碼。";
   save.textContent="已更新";save.disabled=true;
   cancel.textContent="完成";cancel.disabled=false;dismiss.disabled=false;
  }catch(error){
   const detail=String(error?.message||"");
   feedback.classList.add("error");
   feedback.textContent=/reauth|nonce|authentication/i.test(detail)
    ?"請先完成安全驗證。如無法更新，可從登入頁使用「忘記密碼」重設。"
    :(/password/i.test(detail)?"密碼修改失敗，請稍後重試或使用「忘記密碼」重新設定。":"修改密碼失敗："+(detail||"請稍後重試。"));
   save.disabled=false;cancel.disabled=false;dismiss.disabled=false;
  }
 })()});
 password.focus();
}
function isReturnAllowed(candidate){
 if(typeof candidate!=="string"||!candidate||candidate.length>600)return false;
 // Return only to one of this product's same-origin public pages.
 if(!/^(?:home|for-merchants|for-customers|demo|directory|board|merchant-center|merchant-register|privacy|terms)\.html(?:\?[^#]*)?$/.test(candidate))return false;
 try{
  const u=new URL(candidate,location.origin+location.pathname.replace(/[^/]*$/,""));
  return u.origin===location.origin && /^\/LINE\/(?:booking|saas)\/(?:home|for-merchants|for-customers|demo|directory|board|merchant-center|merchant-register|privacy|terms)\.html$/.test(u.pathname);
 }catch(_){return false}
}
function currentReturn(){
 let name=location.pathname.split("/").pop()||"home.html";
 if(!/^(?:home|for-merchants|for-customers|demo|directory|board|merchant-center|merchant-register|privacy|terms)\.html$/.test(name))name="home.html";
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
 const selectedMerchant=new URLSearchParams(location.search).get("merchant")||"";
 const start=new URL("./",location.href);
 start.searchParams.set("view","customer");
 // The platform LINE account does not need a merchant selection.
 // Keep merchant context only when a real QR-code/store URL supplied it.
 if(/^[a-z0-9][a-z0-9-]{2,39}$/.test(selectedMerchant))
   start.searchParams.set("merchant",selectedMerchant);
 start.searchParams.set("tab","home");
 // Only an explicit header click starts OAuth automatically on the destination page.
 start.searchParams.set("site_login","1");
 start.searchParams.set("site_return",returnTo);
 location.assign(start.href);
}
async function getIdentity(){
 const mode=portalMode();
 const preferOperator=mode!=="customer";
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
  // Supabase Auth exposes the account's provider in app_metadata.
  // The Google OAuth provider does not create a Queue Monster password.
  const provider=staffUser.app_metadata?.provider;
  const emailAccount=provider==="email" ||
   (!provider && staffUser.identities?.some(item=>item.provider==="email")===true);
  operatorIdentity={
   type:"operator",displayName:staffUser.email||"商家使用者",provider:emailAccount?"email":provider||"google",
   userId:staffUser.id,client:operator,
   canChangePassword:emailAccount,
   needsPasswordSetup:emailAccount && staffUser.user_metadata?.queue_monster_password_pending===true
  };
 }
 if(!preferOperator)return lineIdentity;
 if(!operatorIdentity)return null;
 if(mode==="headquarters"){
  const role=await operator.rpc("so_my_context");
  if(role.error||role.data?.platform_admin!==true)return null;
 }
 return operatorIdentity;
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
