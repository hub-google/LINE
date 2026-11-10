
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const supabaseUrl="https://unapiwajmgqqtdkixaab.supabase.co";
const publishableKey="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
const sb=createClient(supabaseUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
// Registration must not take over the platform administrator's existing browser session.
const signupSb=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function customerFacingError(error,operation="general"){
 const raw=typeof error==="string"?error:typeof error?.message==="string"?error.message:typeof error?.error==="string"?error.error:"";
 const code=typeof error?.code==="string"?error.code:typeof error?.error_code==="string"?error.error_code:"";
 const detail=(code+" "+raw).toLowerCase();
 if(/invalid.login.credentials|invalid_credentials|invalid.grant|invalid.pin|invalid.password|incorrect.password|wrong.password|email.or.password/i.test(detail))return "電子信箱或密碼不正確，請重新輸入。";
 if(/email.not.confirmed|email_not_confirmed|email.unverified/i.test(detail))return "電子信箱尚未完成驗證，請先到信箱確認後再登入。";
 if(/user.already.registered|user_already_exists|email_exists|already.registered/i.test(detail))return "這個電子信箱已經註冊，請直接登入或使用忘記密碼。";
 if(/weak_password|password.should|password.must|password.is.too.short|password.*at.least|password.*characters/i.test(detail))return "密碼不符合目前登入服務設定，請重新輸入。";
 if(/same_password|new.password.should.be.different/i.test(detail))return "新密碼不可與原本密碼相同，請重新設定。";
 if(/over.*rate.limit|rate.limit|too.many.requests|security.purposes|try.again.after|too.many.attempts|admin.locked|locked.until/i.test(detail))return "操作太頻繁，請稍後再試。";
 if(/otp.expired|token.expired|refresh.token|session.not.found|invalid.jwt|jwt.expired|auth.session.missing/i.test(detail))return "登入驗證已過期，請重新登入。";
 if(/failed.to.fetch|network.error|networkerror|network.request.failed|load.failed|connection.*failed|fetch.failed|timeout|timed.out|network.unavailable/i.test(detail))return "網路連線異常，請檢查網路後再試一次。";
 if(/email.address.invalid|invalid.email|valid.email|email.*format/i.test(detail))return "電子信箱格式不正確，請重新確認。";
 if(/signup.disabled|signups.not.allowed|signups.*disabled/i.test(detail))return "目前暫時無法註冊，請稍後再試。";
 if(/[\u3400-\u9fff]/.test(raw)&&!/\b(?:error|failed|exception|sqlstate|jwt|pgrst\d+|authapierror|internal.server.error|undefined|null)\b/i.test(raw)&&!/[a-z][a-z0-9]*_[a-z0-9_]+/i.test(raw))return raw;
 if(operation==="login")return "登入失敗，請檢查電子信箱與密碼後重試。";
 if(operation==="signup")return "目前無法完成註冊，請稍後再試。";
 if(operation==="reset")return "暫時無法處理電子郵件或密碼設定，請稍後再試。";
 if(operation==="line")return "LINE 身分驗證暫時無法完成，請重新登入。";
 return "系統暫時無法完成操作，請稍後再試。";
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
const needsInitialPassword=user=>user?.app_metadata?.queue_monster_invited===true && user?.app_metadata?.queue_monster_password_ready!==true;
const msg=(t,error=false)=>{$("message").textContent=t||"";$("message").className=t?"message"+(error?" error":""):""};
const invitedId=new URL(location.href).searchParams.get("staff_invite")||"";
const inviteIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invited=inviteIdPattern.test(invitedId);
const inviteHint=$("invitation-hint");
if(invited)inviteHint.textContent="你收到排隊怪獸的企業員工邀請。請使用收到邀請的電子信箱登入，或先註冊並完成信箱驗證。";

let busy=false,active="login",authUser=null,workspaceSlug="";
const setMode=(mode)=>{
 active=mode==="signup"?"signup":"login";
 showAuth(null);
 for(const m of ["login","signup"]){$("tab-"+m).setAttribute("aria-selected",String(active===m));$(""+m+"-form").classList.toggle("hidden",active!==m)}
 const u=new URL(location.href);u.searchParams.set("mode",active);history.replaceState(null,"",u.pathname+u.search+u.hash);
 msg("");
};
$("tab-login").onclick=()=>{setMode("login");void prepare().catch(e=>msg(customerFacingError(e,"login"),true))};
$("tab-signup").onclick=()=>setMode("signup");
setMode(new URL(location.href).searchParams.get("mode"));
async function execute(job,operation="general"){
 if(busy)return;busy=true;document.querySelectorAll("button").forEach(b=>b.disabled=true);msg("正在處理…");
 try{await job()}catch(error){msg(customerFacingError(error,operation==="general"?(active==="signup"?"signup":"login"):operation),true)}
 finally{busy=false;document.querySelectorAll("button").forEach(b=>b.disabled=false)}
}
async function rpc(name,args={}){const {data,error}=await sb.rpc(name,args);if(error)throw Error(error.message);return data}
function showAuth(user){
 authUser=user;$("auth-zone").classList.toggle("hidden",!!user);$("account-zone").classList.toggle("hidden",!user);
 if(user){$("account-email").textContent=user.email||"";$("account-name").textContent=user.email||"店家使用者";$("account-title").textContent="帳號已登入"}
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
 const recovering=new URL(location.href).searchParams.get("intent")==="recovery";
 const title=passwordPanel.querySelector("h3"),help=passwordPanel.querySelector(".sub");
 if(recovering||firstSetup){
   $("account-title").textContent=recovering?"重設帳號密碼":"完成員工帳號啟用";
   title.textContent=recovering?"設定新密碼":"首次設定登入密碼";
   help.textContent=recovering?"請輸入新密碼並確認，完成後才能繼續。":
     "此帳號尚未完成密碼設定。請先設定密碼並再次輸入確認，完成後才能進入員工後台。";
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
  note("你已加入以下企業，可直接進入對應的員工後台：");
  for(const member of memberships){
   addLink(member.name+"（"+(roleName[member.role]||member.role)+"）－進入後台",
    "./?view=staff&merchant="+encodeURIComponent(member.slug),true);
  }
  return;
 }
 // Invited employees must never be enrolled as new merchant owners.
 if(pending.length||invited)return;
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
 const password=$("signup-pass").value,confirm=$("signup-confirm").value;
 if(password.length<1)throw Error("請輸入密碼");
 if(password!==confirm)throw Error("兩次輸入的密碼不相同");
 const {data,error}=await signupSb.auth.signUp({email,password:await effectivePassword(email,password),options:{emailRedirectTo:returnToLogin(),data:{app:"queue-monster"}}});
 if(error)throw error;
 if(data.session){
  const {error:sessionError}=await sb.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  if(sessionError)throw sessionError;
  setMode("login");await prepare();msg("帳號已建立，請完成店家資料");
 }
 else{setMode("login");$("login-email").value=email;msg("註冊已送出，請先到信箱完成驗證，再回來登入")}
})};
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
 const {data:updated,error}=await sb.auth.updateUser({password:effective});
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
