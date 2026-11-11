import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const $=id=>document.getElementById(id);
const showMessage=(text,error=false)=>{
 const node=$("hq-message");
 node.textContent=text;
 node.className=text?"message"+(error?" error":""):"hidden";
};
let busy=false;
const setBusy=busyState=>{
 busy=busyState;
 $("hq-login-form").querySelectorAll("button,input").forEach(el=>el.disabled=busyState);
 $("hq-other-account").disabled=busyState;
};
async function isAuthorized(){
 // The server owns authorization; a visible page or an email field never grants permissions.
 const {data,error}=await sb.rpc("so_my_context");
 if(error)throw error;
 if(data?.platform_admin===true)return true;
 // Existing verified platform owner may need to initialize the server-side role.
 // The RPC itself strictly checks the authenticated identity and verified email.
 const claim=await sb.rpc("so_claim_verified_platform_owner");
 if(claim.error||claim.data!==true)return false;
 const verified=await sb.rpc("so_my_context");
 return !verified.error&&verified.data?.platform_admin===true;
}
async function goToHeadquarters(){
 if(!await isAuthorized())return false;
 location.replace("./?view=platform");
 return true;
}
async function restore(){
 const {data}=await sb.auth.getUser();
 if(!data?.user)return;
 try{
  if(await goToHeadquarters())return;
  showMessage("目前登入的帳號沒有總部管理權限。請改用總部帳號登入。",true);
  $("hq-account-action").classList.remove("hidden");
 }catch{
  showMessage("無法確認管理權限，請檢查網路後重試。",true);
 }
}
$("hq-login-form").addEventListener("submit",async event=>{
 event.preventDefault();
 if(busy)return;
 setBusy(true);showMessage("正在驗證帳號…");
 try{
  const email=$("hq-email").value.trim().toLowerCase();
  const password=$("hq-password").value;
  if(password.length===1){
   const response=await fetch(SUPABASE_URL+"/functions/v1/qm-admin-login",{
    method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({email,pin:password})
   });
   if(!response.ok)throw Error("無法登入總部，請確認帳號及密碼。");
   const session=await response.json();
   const result=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
   if(result.error)throw result.error;
  }else{
   const result=await sb.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
  }
  if(!await goToHeadquarters()){
   await sb.auth.signOut();
   $("hq-password").value="";
   throw Error("此帳號沒有總部管理權限。");
  }
 }catch(error){
  const known=error instanceof Error?error.message:"";
  const message=/沒有總部管理權限/.test(known)?known:
   /network|failed.to.fetch|timeout|連線/i.test(known)?"網路連線異常，請稍後重試。":
   "無法登入總部，請確認帳號及密碼。";
  showMessage(message,true);
 }finally{setBusy(false)}
});
$("hq-other-account").addEventListener("click",async()=>{
 if(busy)return;
 setBusy(true);
 try{
  const result=await sb.auth.signOut();
  if(result.error)throw result.error;
  $("hq-account-action").classList.add("hidden");
  $("hq-email").value="";
  $("hq-password").value="";
  showMessage("");
 }catch{
  showMessage("切換帳號失敗，請重新整理頁面後再試。",true);
 }finally{setBusy(false)}
});
void restore();
