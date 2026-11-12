import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";
import {formatAuthError} from "../../app/auth-errors.js";

import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const supabaseUrl=SUPABASE_URL;
const publishableKey=SUPABASE_PUBLISHABLE_KEY;
const sb=createClient(supabaseUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
// Registration must not take over the platform administrator's existing browser session.
const signupSb=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function customerFacingError(error,operation="general"){
 return formatAuthError(error,operation,"密碼不符合目前登入服務設定，請重新輸入。");
}
// Supabase-hosted Auth enforces a six-character minimum. Queue Monster accepts
// shorter user-entered passwords by deriving a stable, Auth-compatible credential.
// This is ONLY a compatibility encoding; it does not add password entropy.
// Six-or-more-character existing passwords are left unchanged.
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
const $=id=>document.getElementById(id);
const returnToLogin=()=>{const url=new URL("./merchant-register.html?mode=login",location.href);if(invited)url.searchParams.set("staff_invite",invitedId);else url.searchParams.set("from","queue-monster");return url.href;};
const returnToReset=()=>new URL("./merchant-register.html?mode=login&intent=recovery",location.href).href;
const returnToSignup=()=>{const url=new URL(returnToLogin());url.searchParams.set("intent","complete-signup");return url.href;};
const needsInitialPassword=user=>user?.app_metadata?.queue_monster_invited===true && user?.app_metadata?.queue_monster_password_ready!==true;
const msg=(t,error=false)=>{$("message").textContent=t||"";$("message").className=t?"message"+(error?" error":""):""};
const invitedId=new URL(location.href).searchParams.get("staff_invite")||"";
const inviteIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invited=inviteIdPattern.test(invitedId);
const inviteHint=$("invitation-hint");
if(invited)inviteHint.textContent="你收到排隊怪獸的企業員工邀請。請使用收到邀請的電子信箱登入，或先註冊並完成信箱驗證。";

let busy=false,active="login",authUser=null,workspaceSlug="",pendingEmail="",lastEmailSentAt=0;
function renderSignupStep(){
 $("signup-form").classList.toggle("hidden",active!=="signup"||!!pendingEmail);
 $("verify-email-stage").classList.toggle("hidden",active!=="signup"||!pendingEmail);
 if(pendingEmail)$("verify-email-address").textContent=pendingEmail;
}
async function requestSignupEmail(email){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("請輸入有效的電子信箱");
 if(Date.now()-lastEmailSentAt<60000)throw Error("驗證信剛剛已寄出，請稍後再重新寄送");
 const {error}=await signupSb.auth.signInWithOtp({email,options:{
  shouldCreateUser:true,emailRedirectTo:returnToSignup(),
  data:{app:"queue-monster",queue_monster_password_pending:true}
 }});
 if(error)throw error;
 lastEmailSentAt=Date.now();
}
const setMode=(mode)=>{
 active=mode==="signup"?"signup":"login";
 pendingEmail="";
 showAuth(null);
 for(const m of ["login","signup"]){$("tab-"+m).setAttribute("aria-selected",String(active===m));}
 renderSignupStep();
 $("login-form").classList.toggle("hidden",active!=="login")
 const u=new URL(location.href);u.searchParams.set("mode",active);history.replaceState(null,"",u.pathname+u.search+u.hash);
 msg("");
};
$("tab-login").onclick=()=>{setMode("login");void prepare().catch(e=>msg(customerFacingError(e,"login"),true))};
$("tab-signup").onclick=()=>setMode("signup");
setMode(new URL(location.href).searchParams.get("mode"));
$("google-auth").onclick=()=>void execute(async()=>{
 const {data,error}=await sb.auth.signInWithOAuth({provider:"google",
  options:{redirectTo:returnToLogin(),skipBrowserRedirect:true,queryParams:{prompt:"select_account"}}});
 if(error)throw error;
 if(!data?.url)throw Error("Google 登入暫時無法使用，請改用 Email。");
 location.assign(data.url);
},"login");
$("resend-signup-email").onclick=()=>void execute(async()=>{
 if(!pendingEmail)throw Error("請先輸入電子信箱");
 await requestSignupEmail(pendingEmail);
 msg("已重新申請寄送驗證信，請查看收件匣與垃圾郵件匣。");
},"signup");
$("change-signup-email").onclick=()=>{pendingEmail="";renderSignupStep();msg("");$("signup-email").focus()};
async function execute(job,operation="general"){
 if(busy)return;busy=true;document.querySelectorAll("button").forEach(b=>b.disabled=true);msg("正在處理…");
 try{await job()}catch(error){msg(customerFacingError(error,operation==="general"?(active==="signup"?"signup":"login"):operation),true)}
 finally{busy=false;document.querySelectorAll("button").forEach(b=>b.disabled=false)}
}
async function rpc(name,args={}){const {data,error}=await sb.rpc(name,args);if(error)throw Error(error.message);return data}
function showAuth(user){
 authUser=user;$("auth-zone").classList.toggle("hidden",!!user);$("account-zone").classList.toggle("hidden",!user);
 if(user){$("account-email").textContent=user.email||"";$("account-name").textContent=user.user_metadata?.full_name||user.user_metadata?.name||user.email||"店家使用者";$("account-title").textContent="帳號已登入"}
}
async function prepare(){
 if(active==="signup"){showAuth(null);return}
 const {data,error}=await sb.auth.getUser();
 if(error||!data.user){showAuth(null);return}
 const user=data.user;
 const context=await rpc("so_my_context");
 if(context?.platform_admin===true){
  location.replace("./platform-login.html");return;
 }
 showAuth(user);
 $("account-title").textContent="已登入｜企業與員工權限";
 document.querySelector(".password-panel").classList.remove("hidden");
 const workspace=$("workspace");
 workspace.replaceChildren();
 const passwordPanel=document.querySelector(".password-panel");
 const firstSetup=needsInitialPassword(user);
 const intent=new URL(location.href).searchParams.get("intent");
 const recovering=intent==="recovery";
 const completingSignup=intent==="complete-signup"||user?.user_metadata?.queue_monster_password_pending===true;
 const title=passwordPanel.querySelector("h3"),help=passwordPanel.querySelector(".sub");
 if(recovering||firstSetup||completingSignup){
   $("account-title").textContent=recovering?"重設帳號密碼":completingSignup?"信箱已驗證｜完成註冊":"完成員工帳號啟用";
   title.textContent=recovering?"設定新密碼":completingSignup?"最後一步：設定登入密碼":"首次設定登入密碼";
   help.textContent=recovering?"請輸入新密碼並確認，完成後才能繼續。":
     completingSignup?"信箱已驗證，現在設定只有自己知道的密碼；如帳號先前已有密碼，將以這次設定為準。":
     "此帳號尚未完成密碼設定。請先設定密碼並再次輸入確認，完成後才能進入員工後台.";
   return;
 }
 title.textContent="變更登入密碼";
 help.textContent="需要變更密碼時，可在此設定新的登入密碼。";

 const note=(text)=>{const p=document.createElement("p");p.className="sub";p.textContent=text;workspace.append(p);};
 const addLink=(label,url,primary=false)=>{
  const a=document.createElement("a");a.href=url;a.textContent=label;
  if(primary)a.className="strong";
  workspace.append(a);return a;
 };
 const memberships=Array.isArray(context?.memberships)?context.memberships:[];
 const invitations=Array.isArray(context?.invitations)?context.invitations:[];
 const roleName={OWNER:"負責人",MANAGER:"管理者",STAFF:"員工",PLATFORM:"平台管理"};
 const pending=invitations.slice().sort((a,b)=>Number(b.id===invitedId)-Number(a.id===invitedId));
 if(pending.length){
  note("你有 "+pending.length+" 筆企業邀請。確認加入後，才會開放對應的員工權限。");
  for(const invite of pending){
   const row=document.createElement("div");
   row.className="workspace";
   const title=document.createElement("strong");
   title.textContent=invite.tenant+"｜"+(roleName[invite.role]||invite.role);
   const accept=document.createElement("button");
   accept.type="button";accept.className="primary";
   accept.textContent="接受企業邀請";
   accept.addEventListener("click",()=>void execute(async()=>{
    const result=await rpc("so_accept_invite",{p_invite_id:invite.id});
    if(!result?.accepted)throw Error("無法接受邀請，請重新確認登入帳號");
    location.assign("./?view=staff&merchant="+encodeURIComponent(invite.slug));
   }));
   row.append(title,accept);workspace.append(row);
  }
 }
 if(invited&&!pending.some(i=>i.id===invitedId)&&!memberships.length){
  note("目前登入的帳號沒有這筆待接受邀請。請確認受邀信箱是否相同；如已加入企業，可使用員工後台登入。");
 }
 if(memberships.length){
  note("你已加入以下店家，可以個別進入後台或退出不再服務的店家。");
  for(const member of memberships){
   const shop=document.createElement("section");
   shop.className="merchant-membership";
   const shopTitle=document.createElement("strong");
   shopTitle.className="merchant-membership-title";
   shopTitle.textContent=member.name||"未命名店家";
   const roleText=document.createElement("small");
   roleText.className="muted";
   roleText.textContent="身分："+(roleName[member.role]||member.role);
   const actions=document.createElement("div");
   actions.className="merchant-membership-actions";
   const enter=document.createElement("a");
   enter.href="./?view=staff&merchant="+encodeURIComponent(member.slug);
   enter.className="strong";
   enter.textContent="進入店家後台";
   actions.append(enter);
   const n=Number(member.member_count||0), managers=Number(member.manager_count||0);
   const isAdmin=["OWNER","MANAGER"].includes(member.role);
   const canLeave=n>1&&(!isAdmin||managers>1);
   if(canLeave){
    const leave=document.createElement("button");
    leave.type="button";leave.className="secondary-action";
    leave.textContent="退出店家";
    leave.addEventListener("click",()=>void execute(async()=>{
     if(!window.confirm("確定退出「"+member.name+"」嗎？\\n退出後立即失去該店管理權限，但不會刪除個人帳號或其他店家的權限。"))return;
     const result=await rpc("so_leave_tenant",{p_slug:member.slug});
     if(!result?.left)throw Error("未能退出店家，請重新整理後再試");
     await prepare();
     msg("已退出「"+member.name+"」，其他店家的權限不受影響。");
    }));
    actions.append(leave);
   }else{
    const hint=document.createElement("small");
    hint.className="muted merchant-membership-hint";
    hint.textContent=n<=1
      ?"你是最後一位成員，不能直接退出；請由管理者解散店家。"
      :"你是唯一管理者，請先到員工管理指定另一位管理者，再退出店家。";
    shop.append(hint);
   }
   if(isAdmin){
    const dissolve=document.createElement("button");
    dissolve.type="button";dissolve.className="secondary-action danger-action";
    dissolve.textContent="解散店家";
    dissolve.addEventListener("click",()=>void execute(async()=>{
     const typed=window.prompt("解散「"+member.name+"」會立即停止預約及叫號服務，並移除所有員工權限；歷史紀錄會保留。\\n請輸入完整店名確認：", "");
     if(typed===null)return;
     if(typed!==member.name)throw Error("店名不一致，已取消解散");
     if(!window.confirm("最後確認：確定永久解散「"+member.name+"」？這不是一般退出，解散後無法自行恢復。"))return;
     const result=await rpc("so_dissolve_tenant",{p_slug:member.slug,p_confirm_name:typed});
     if(!result?.dissolved)throw Error("解散店家失敗");
     await prepare();
     msg("已解散「"+member.name+"」，所有員工已移出，歷史紀錄保留。");
    }));
    actions.append(dissolve);
   }
   shop.prepend(shopTitle,roleText);
   shop.append(actions);
   workspace.append(shop);
  }
  return;
 }
 // Invited employees must never be enrolled as new merchant owners.
 if(pending.length||invited||context?.previous_member){
   if(!pending.length)note("你目前沒有加入任何店家。請由新店家的管理者重新寄送邀請。");
   return;
 }
 // The regular merchant signup flow still creates an empty new merchant.
 const result=await rpc("so_start_merchant");
 workspaceSlug=result.slug;
 addLink("進入店家後台","./?view=staff&merchant="+encodeURIComponent(workspaceSlug),true);
 addLink(result.onboarding_complete?"管理店家基本資料":"開始填寫空白店家資料",
  "./?view=staff&merchant="+encodeURIComponent(workspaceSlug)+"&tab=settings");
}
$("login-form").onsubmit=e=>{e.preventDefault();void execute(async()=>{
 const email=$("login-email").value.trim(),password=$("login-pass").value;
 const {data,error}=await sb.auth.signInWithPassword({email,password:await effectivePassword(email,password)});
 if(error)throw error;
 if(!data.user)throw Error("登入狀態無法確認");
 await prepare();msg("登入成功");
})};
$("signup-form").onsubmit=e=>{e.preventDefault();void execute(async()=>{
 const email=$("signup-email").value.trim().toLowerCase();
 await requestSignupEmail(email);
 pendingEmail=email;renderSignupStep();
 msg("請到信箱點擊驗證連結，驗證成功後才能設定密碼。");
},"signup")};
$("email-link-login").onclick=()=>void execute(async()=>{
 const email=$("login-email").value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("請先填寫有效的電子信箱");
 const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:new URL("./merchant-register.html?mode=login&from=queue-monster",location.href).href}});
 if(error)throw error;msg("已申請寄送登入連結，請到信箱完成身分驗證");
},"reset");
$("forgot-pass").onclick=()=>void execute(async()=>{
 const email=$("login-email").value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("請先填寫有效的電子信箱");
 const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:returnToReset()});
 if(error)throw error;msg("若信箱已有帳號，將收到密碼重設連結");
},"reset");
$("change-pass").onclick=()=>void execute(async()=>{
 const password=$("new-pass").value,confirm=$("confirm-new-pass").value;
 if(password.length<1)throw Error("請輸入新密碼");
 if(password!==confirm)throw Error("兩次輸入的密碼不相同");
 const effective=await effectivePassword(authUser?.email,password);
 const finishingSignup=authUser?.user_metadata?.queue_monster_password_pending===true||
   new URL(location.href).searchParams.get("intent")==="complete-signup";
  const update={password:effective};
  if(finishingSignup)update.data={queue_monster_password_pending:false};
  const {data:updated,error}=await sb.auth.updateUser(update);
 if(error)throw error;
 if(needsInitialPassword(updated.user||authUser)){
   const email=(updated.user||authUser)?.email;
   if(!email)throw Error("無法確認員工電子信箱");
   // Verify the newly saved password with Auth before a trusted server grants staff access.
   const verified=await sb.auth.signInWithPassword({email,password:effective});
   if(verified.error||verified.data.user?.id!==(updated.user||authUser)?.id)
     throw Error("密碼已更新，但尚無法確認登入；請使用新密碼重新登入後再完成啟用。");
   const response=await sb.functions.invoke("staff-complete-setup",{body:{password:effective}});
   if(response.error||response.data?.ready!==true)
     throw Error("密碼已儲存，但員工權限尚未啟用，請重新登入後再試一次。");
 }
 $("new-pass").value="";$("confirm-new-pass").value="";
 const u=new URL(location.href);u.searchParams.delete("intent");history.replaceState(null,"",u.pathname+u.search+u.hash);
 await prepare();msg("密碼設定成功，可以使用員工後台。");
},"reset");
$("switch-account").onclick=()=>setMode("login");
$("logout").onclick=()=>void execute(async()=>{
 const {error}=await sb.auth.signOut();if(error)throw error;workspaceSlug="";showAuth(null);msg("已登出");
});
void (async()=>{try{await prepare()}catch(e){msg(customerFacingError(e,"login"),true)}})();
