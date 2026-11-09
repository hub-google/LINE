
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
 if(/weak_password|password.should|password.must|password.is.too.short|password.*at.least|password.*characters/i.test(detail))return "密碼強度不足，請使用至少 8 個字元的密碼。";
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
const $=id=>document.getElementById(id);
const returnToLogin=()=>new URL("./merchant-register.html?mode=login",location.href).href;
const msg=(t,error=false)=>{$("message").textContent=t||"";$("message").className=t?"message"+(error?" error":""):""};
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
 if(user){$("account-email").textContent=user.email||"";$("account-name").textContent=user.user_metadata?.username||"店家使用者";$("account-title").textContent="帳號已登入"}
}
async function prepare(){
 // The explicit signup route always displays the signup form, even for an admin session.
 if(active==="signup"){showAuth(null);return}
 const {data,error}=await sb.auth.getUser();
 if(error||!data.user){showAuth(null);return}
 const user=data.user;showAuth(user);
 const isPlatform=await rpc("so_claim_verified_platform_owner").catch(()=>false);
 if(isPlatform){
  $("account-title").textContent="平台總管理員已登入";
  document.querySelector(".password-panel").classList.add("hidden");
  workspaceSlug="";$("workspace").innerHTML='<a class="strong" href="./?view=platform">進入平台總管理後台</a>';
  $("missing-username").classList.add("hidden");return;
 }
 $("account-title").textContent="店家帳號已登入";
 document.querySelector(".password-panel").classList.remove("hidden");
 let username=(user.user_metadata?.username||"").trim();
 const input=$("finish-username").value.trim();if(input)username=input;
 if(!username){$("missing-username").classList.remove("hidden");$("workspace").innerHTML='<p class="muted">請先設定帳號名稱。</p>';return}
 const result=await rpc("so_start_merchant",{p_username:username});
 workspaceSlug=result.slug;
 $("missing-username").classList.add("hidden");
 const url="./?view=staff&merchant="+encodeURIComponent(workspaceSlug);
 $("workspace").replaceChildren();
 const primary=document.createElement("a");primary.className="strong";primary.href=url;primary.textContent="進入店家後台";
 const settings=document.createElement("a");settings.href=url+"&tab=settings";settings.textContent=result.onboarding_complete?"管理店家基本資料":"開始填寫空白店家資料";
 $("workspace").append(primary,settings);
}
$("login-form").onsubmit=e=>{e.preventDefault();void execute(async()=>{
 const email=$("login-email").value.trim(),password=$("login-pass").value;
 if(password.length===1){
  const response=await fetch("https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/qm-admin-login",{
   method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy"},
   body:JSON.stringify({email,pin:password})
  });
  const result=await response.json();
  if(!response.ok)throw Error(customerFacingError(result.error||"管理員登入失敗","login"));
  const {error}=await sb.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});
  if(error)throw error;
 }else{
  const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;
  if(!data.user)throw Error("登入狀態無法確認");
 }
 await prepare();msg("登入成功");
})};
$("signup-form").onsubmit=e=>{e.preventDefault();void execute(async()=>{
 const username=$("username").value.trim().toLowerCase(),email=$("signup-email").value.trim().toLowerCase();
 const password=$("signup-pass").value,confirm=$("signup-confirm").value;
 if(!/^[a-z][a-z0-9_-]{2,29}$/.test(username))throw Error("帳號需 3 至 30 字，英文開頭，可使用數字、底線及連字號");
 if(password.length<8)throw Error("密碼至少需要 8 字元");
 if(password!==confirm)throw Error("兩次輸入的密碼不相同");
 const {data,error}=await signupSb.auth.signUp({email,password,options:{data:{username},emailRedirectTo:returnToLogin()}});
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
 const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:returnToLogin()}});
 if(error)throw error;msg("已申請寄送登入連結，請到信箱完成身分驗證");
},"reset");
$("forgot-pass").onclick=()=>void execute(async()=>{
 const email=$("login-email").value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("請先填寫有效的電子信箱");
 const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:returnToLogin()});
 if(error)throw error;msg("若信箱已有帳號，將收到密碼重設連結");
},"reset");
$("change-pass").onclick=()=>void execute(async()=>{
 const password=$("new-pass").value,confirm=$("confirm-new-pass").value;
 if(password.length<8)throw Error("新密碼至少需要 8 字元");
 if(password!==confirm)throw Error("兩次輸入的密碼不相同");
 const {error}=await sb.auth.updateUser({password});
 if(error)throw error;$("new-pass").value="";$("confirm-new-pass").value="";msg("新密碼已儲存，可用於下次登入");
},"reset");
$("finish-account").onclick=()=>void execute(async()=>{
 const username=$("finish-username").value.trim();
 if(!/^[a-z][a-z0-9_-]{2,29}$/i.test(username))throw Error("請填寫有效的帳號名稱");
 await prepare();msg("帳號設定已完成");
});
$("switch-account").onclick=()=>setMode("login");
$("logout").onclick=()=>void execute(async()=>{
 const {error}=await sb.auth.signOut();if(error)throw error;workspaceSlug="";showAuth(null);msg("已登出");
});
void (async()=>{try{await prepare()}catch(e){msg(customerFacingError(e,"login"),true)}})();
