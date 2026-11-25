import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// This route is ONLY entered from an email recovery link. Do not use the
// merchant's existing persistent session or run merchant onboarding RPCs.
const callbackUrl=new URL(location.href);
const fragment=new URLSearchParams(callbackUrl.hash.replace(/^#/,""));
const query=callbackUrl.searchParams;
const hasRecoveryToken=fragment.get("type")==="recovery"&&
  fragment.has("access_token")&&fragment.has("refresh_token");
const hasRecoveryCode=query.get("intent")==="recovery"&&query.has("code");
const callbackFailure=fragment.get("error_code")||query.get("error_code")||
  fragment.get("error")||query.get("error")||"";
const $=id=>document.getElementById(id);
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{detectSessionInUrl:true,persistSession:false,autoRefreshToken:false}
});
let busy=false;
let verified=false;
let recoverySeen=false;
client.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY"&&session?.access_token)recoverySeen=true;
});
function scrubCallback(){
  // Prevent sensitive session tokens or single-use codes from lingering in
  // history after they have been processed. Never log or display them.
  const clean=new URL(location.href);
  clean.hash="";
  clean.searchParams.delete("code");
  clean.searchParams.delete("error");
  clean.searchParams.delete("error_code");
  clean.searchParams.delete("error_description");
  history.replaceState(null,"",clean.pathname+clean.search);
}
function show(step){
  $("reset-loading").hidden=step!=="loading";
  $("reset-form").hidden=step!=="form";
  $("reset-invalid").hidden=step!=="invalid";
  $("reset-success").hidden=step!=="success";
}
function showInvalid(reason){
  $("invalid-reason").textContent=reason||"這個重設連結無效或已過期，請重新申請。";
  show("invalid");
}
function message(err){
  if(err?.code==="weak_password"||/at least|weak.password|too.short|password.should/i.test(err?.message||""))
    return "密碼強度不足，請改用較長或更複雜的密碼。";
  if(/same.password|different from|same as/i.test(err?.message||""))
    return "新密碼不能與原密碼相同，請重新輸入。";
  if(/session|jwt|expired|token|unauthoriz/i.test(err?.message||""))
    return "驗證已過期，請重新申請密碼重設連結。";
  return "密碼更新失敗，請確認網路連線後再試一次。";
}
async function verify(){
  show("loading");
  if(callbackFailure){
    scrubCallback();
    showInvalid("重設連結已過期或被使用過，請重新申請。");
    return;
  }
  if(!hasRecoveryToken&&!hasRecoveryCode){
    scrubCallback();
    showInvalid("請從最新的密碼重設信點擊連結進入，不要直接開啟這個頁面。");
    return;
  }
  try{
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.access_token)throw Error("invalid_recovery_session");
    const {data:identity,error:identityError}=await client.auth.getUser();
    if(identityError||!identity?.user?.id)throw Error("invalid_recovery_user");
    // URL contains the one-time recovery proof, AND Supabase verified the session.
    verified=true;
    scrubCallback();
    show("form");
    $("new-password").focus();
  }catch{
    scrubCallback();
    showInvalid("連結驗證失敗或已過期，請返回登入頁重新申請。");
  }
}
$("reset-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!verified||busy)return;
  const password=$("new-password").value;
  const confirmation=$("confirm-password").value;
  const error=$("reset-error");
  error.hidden=true;error.textContent="";
  if(password.length<8){error.textContent="新密碼至少需要 8 個字元。";error.hidden=false;return;}
  if(password!==confirmation){error.textContent="兩次輸入的密碼不一致。";error.hidden=false;return;}
  busy=true;
  $("reset-submit").disabled=true;
  $("reset-submit").textContent="正在儲存…";
  try{
    const {error:changeError}=await client.auth.updateUser({password});
    if(changeError)throw changeError;
    $("new-password").value="";
    $("confirm-password").value="";
    verified=false;
    try{await client.auth.signOut({scope:"local"});}catch{ /* Password was already updated. */ }
    show("success");
  }catch(err){error.textContent=message(err);error.hidden=false;}
  finally{
    busy=false;
    $("reset-submit").disabled=false;
    $("reset-submit").textContent="確認設定新密碼";
  }
});
void verify();
