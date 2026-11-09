import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SB_URL="https://unapiwajmgqqtdkixaab.supabase.co";
const SB_KEY="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
// Keep customer and merchant sign-in sessions separate.
const routeBeforeAuth=new URLSearchParams(location.search);
const initialViews=routeBeforeAuth.getAll("view");
const initialView=initialViews[initialViews.length-1]||"customer";
const authOptions={persistSession:true,autoRefreshToken:true,detectSessionInUrl:false};
if(initialView==="customer")authOptions.storageKey="line-saas-customer-session-v2";
const supa=createClient(SB_URL,SB_KEY,{auth:authOptions});
const LINE_BRIDGE_URL=SB_URL+"/functions/v1/line-bridge";
let lineConfig=null,lineConfigSlug="",lineLinkStatus="not-ready",lineLinkAttempted=false,lineFriendStatus=null,lineDisplayName="",lineConnectError="";
let lineOaRecipient="UNKNOWN",lineFriendCheck="UNAVAILABLE",lineOaAddFriendUrl="",lineProviderMismatch=false;
async function bridgeConfig(){
  const merchant=isSafeMerchant(slug)?slug:"";
  if(lineConfig!==null&&lineConfigSlug===merchant)return lineConfig;
  try{
    const res=await fetch(LINE_BRIDGE_URL+"?action=config&merchant="+encodeURIComponent(merchant),{cache:"no-store"});
    if(res.ok){lineConfig=await res.json();lineConfigSlug=merchant;}
  }catch(e){console.warn("LINE 設定尚不可用");}
  return lineConfig||{};
}
function customerUrl(merchant){
 const canonical=location.origin+bookingPath+"?view=customer&merchant="+encodeURIComponent(merchant);
 // Other shops may use a different LINE provider. Never reuse this shop's LIFF ID.
 if(merchant!==slug)return canonical;
 const id=lineConfig?.liffId;
 return id?"https://liff.line.me/"+encodeURIComponent(id)+"/?view=customer&merchant="+encodeURIComponent(merchant):canonical;
}
function lineLoginUrl(){
  const siteReturn=incomingParam("site_return");
  return "https://liff.line.me/"+encodeURIComponent(lineConfig?.liffId||"")+"/?view=customer&merchant="+encodeURIComponent(slug)+(customerTab?"&tab="+encodeURIComponent(customerTab):"")+(siteReturn?"&site_return="+encodeURIComponent(siteReturn):"")+
    (manageKind&&manageItem?"&manage="+encodeURIComponent(manageKind)+"&item="+encodeURIComponent(manageItem)+"&mode="+encodeURIComponent(manageMode):"")+
    (customerTab==="progress"&&progressTicketId?"&ticket="+encodeURIComponent(progressTicketId):"");
}
// Never pass LINE's one-time authorization code, PKCE state, or cache-busting
// parameters into a subsequent OAuth redirect.
function cleanLineRedirectUri(){
 const url=new URL(location.origin+location.pathname);
 url.searchParams.set("view",view);
 if(isSafeMerchant(slug))url.searchParams.set("merchant",slug);
 if(view==="customer"){
  if(customerTab)url.searchParams.set("tab",customerTab);
  const siteReturn=incomingParam("site_return");
  if(siteReturn)url.searchParams.set("site_return",siteReturn);
  if(customerTab==="progress"&&progressTicketId)url.searchParams.set("ticket",progressTicketId);
  if(manageKind&&manageItem){
   url.searchParams.set("manage",manageKind);
   url.searchParams.set("item",manageItem);
   url.searchParams.set("mode",manageMode);
  }
 }
 return url.href;
}
// Return to the original public page only after a real LINE token has been
// verified and bound on the server. This is never a generic open redirect.
function finishPublicHeaderLogin(){
  const key="line-site-auth-return-v1";
  let stored=null;
  try{stored=JSON.parse(sessionStorage.getItem(key)||"null")}catch(_){}
  const recent=stored&&Number(stored.at)>0&&Date.now()-Number(stored.at)<15*60*1000;
  const target=incomingParam("site_return")||(recent?stored.target:"");
  if(typeof target!=="string"||target.length>600||
     !/^(?:home|directory|board|poster|merchant-center|merchant-register|privacy|terms)\.html(?:\?[^#]*)?$/.test(target))return false;
  const destination=new URL(target,location.origin+bookingPath);
  if(destination.origin!==location.origin||
     !/^\/LINE\/(?:booking|saas)\/(?:home|directory|board|poster|merchant-center|merchant-register|privacy|terms)\.html$/.test(destination.pathname))return false;
  try{sessionStorage.removeItem(key)}catch(_){}
  location.replace(destination.pathname+destination.search);
  return true;
}
function acceptVerifiedLineIdentity(result){
 if(!result?.linked||!result.displayName)throw Error("LINE 身分驗證未完成");
 lineDisplayName=result.displayName;
 lineLinkStatus="linked";
 window.dispatchEvent(new Event("line-site-auth-changed"));
 sessionStorage.removeItem(authRecoveryKey());
 lineFriendStatus=result.isFollowing===true?true:result.isFollowing===false?false:null;
 lineOaRecipient=["REACHABLE","NOT_REACHABLE","UNKNOWN"].includes(result.recipientReachability)?result.recipientReachability:"UNKNOWN";
 lineFriendCheck=String(result.friendCheckStatus||"UNAVAILABLE");
 lineOaAddFriendUrl=typeof result.oaAddFriendUrl==="string"&&
  /^https:\/\/line\.me\/R\/ti\/p\/@[a-zA-Z0-9_.-]{2,100}$/.test(result.oaAddFriendUrl)?result.oaAddFriendUrl:"";
 lineProviderMismatch=result.providerMismatchSuspected===true;
}
async function resumeVerifiedLineSession(){
 if(view!=="customer"||!session?.access_token)return false;
 try{
  const res=await fetch(LINE_BRIDGE_URL,{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},
   body:JSON.stringify({action:"resume",slug})
  });
  if(!res.ok)return false;
  const result=await res.json();
  if(!result.linked||!result.displayName)return false;
  acceptVerifiedLineIdentity(result);
  // Stale LINE OAuth callback parameters must never be replayed.
  refreshLiffRoute();
  const clean=new URL(cleanLineRedirectUri());
  if(location.pathname+location.search!==clean.pathname+clean.search)
   history.replaceState(null,"",clean.pathname+clean.search+location.hash);
  return true;
 }catch(e){
  console.warn("Existing LINE session could not be resumed; attempting LIFF");
  return false;
 }
}
function authRecoveryKey(){return "line-saas-reauth-v2:"+slug}
function recoverLineLogin(manual=false){
 const key=authRecoveryKey(),last=Number(sessionStorage.getItem(key)||0);
 if(!manual&&last>0&&Date.now()-last<120000){
  lineLinkStatus="failed";
  lineConnectError="LINE 登入驗證未完成，請按「重新登入 LINE」再試一次。";
  return false;
 }
 sessionStorage.setItem(key,String(Date.now()));
 lineLinkStatus="connecting";
 lineConnectError="資料更新中，請稍後";
 let inClient=false;
 try{inClient=window.liff?.isInClient?.()===true}catch(e){}
 if(inClient||!window.liff){
  location.replace(lineLoginUrl());
  return true;
 }
 try{
  // Only explicitly restart LINE auth when a fresh session cannot be
  // recovered. Do not sign out returning customers on each page load.
  if(window.liff.isLoggedIn?.())window.liff.logout();
  window.liff.login({redirectUri:cleanLineRedirectUri()});
 }catch(e){
  location.replace(lineLoginUrl());
 }
 return true;
}
async function connectLineSession(force=false){
  if(view!=="customer"||!session?.access_token)return;
  if(force)lineLinkAttempted=false;
  if(lineLinkAttempted)return;
  const config=await bridgeConfig();
  if(!config.liffId){lineLinkStatus="not-ready";lineConnectError="目前無法使用 LINE 登入，請聯絡店家協助。";return;}
  lineLinkAttempted=true;
  lineLinkStatus="connecting";
  lineConnectError="";
  try {
    // External browsers resume immediately without waiting for an SDK download.
    // The LINE in-app browser silently re-verifies the active user to avoid
    // accepting a cached session from a different LINE account.
    const likelyLineApp=/\bLine\/[0-9.]+/i.test(navigator.userAgent||"");
    // LINE callback URLs must finish liff.init() before normalization.
    const callbackParams=new URLSearchParams(location.search);
    const pendingLiffCallback=["liff.state","code","state","access_token"]
      .some(key=>callbackParams.has(key));
    if(!force&&!likelyLineApp&&!pendingLiffCallback&&await resumeVerifiedLineSession())return;
    if(!window.liff){
      for(let attempt=0;attempt<40&&!window.liff;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
    }
    let inLineClient=false;
    try{inLineClient=window.liff?.isInClient?.()===true}catch(e){}
    if(!force&&!inLineClient&&!pendingLiffCallback&&await resumeVerifiedLineSession())return;
    if(!window.liff)throw Error("LINE 登入元件未能載入。");
    await window.liff.init({liffId:config.liffId});
    // Resolve final merchant after LIFF init completes its secondary redirect.
    refreshLiffRoute();
    if(lineConfigSlug!==slug){
      // A LIFF redirect can restore merchant from liff.state.
      lineConfig=null;lineConfigSlug="";
    }
    if(!window.liff.isLoggedIn()){
      lineLinkStatus="not-logged-in";
      if(!window.liff.isInClient())window.liff.login({redirectUri:cleanLineRedirectUri()});
      return;
    }
    const idToken=window.liff.getIDToken()||"";
    const accessToken=window.liff.getAccessToken()||"";
    if(!idToken&&!accessToken){
      recoverLineLogin(force);
      return;
    }
    const link=async()=>{
      const res=await fetch(LINE_BRIDGE_URL,{
        method:"POST",
        headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},
        body:JSON.stringify({action:"link",slug,idToken,accessToken})
      });
      return {res,result:await res.json()};
    };
    let {res,result}=await link();
    if(res.status===409&&result.error==="LINE_ACCOUNT_CHANGED"&&session.user?.is_anonymous){
      const signedOut=await supa.auth.signOut();
      if(signedOut.error)throw signedOut.error;
      const fresh=await supa.auth.signInAnonymously();
      if(fresh.error||!fresh.data.session)throw fresh.error||Error("無法建立顧客識別");
      session=fresh.data.session;
      ({res,result}=await link());
    }
    if(!res.ok||!result.linked){
      const refreshable=["LINE_ID_TOKEN_EXPIRED","LINE_ACCESS_TOKEN_EXPIRED","INVALID_LINE_ID_TOKEN","LINE_ACCESS_TOKEN_REQUIRED","LINE_LOGIN_TOKEN_REQUIRED"];
      if(refreshable.includes(result.error)){
        recoverLineLogin(force);
        return;
      }
      const reasons={
       LINE_ID_TOKEN_EXPIRED:"LINE 登入憑證已過期，請重新登入 LINE 後再開啟顧客網址。",
       LINE_ID_TOKEN_AUDIENCE_MISMATCH:"LINE 登入頻道與憑證不一致，請使用專屬 LINE 顧客網址重新登入。",
       INVALID_LINE_ID_TOKEN:"LINE 身分憑證無法通過驗證，請在 LINE App 內重新開啟顧客網址。"
      };
      throw Error(reasons[result.error]||result.error||"LINE 身分驗證失敗");
    }
    acceptVerifiedLineIdentity(result);
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    // Stale PKCE verifier/state from a previous callback is recoverable.
    // Restart once from a clean LIFF URL; never loop indefinitely.
    if(!force&&/code_verifier|pkce|invalid.*state|state.*mismatch/i.test(message)
       &&recoverLineLogin(false))return;
    lineLinkStatus="failed";
    lineConnectError=/code_verifier|pkce/i.test(message)?
      "LINE 登入驗證已失效，請重新登入 LINE。":message;
    console.warn("LINE 身分連接失敗",lineConnectError);
  }
}
async function sendLineNotice(action,ids){
 if(!session?.access_token)return "提醒暫時無法送出，請重新登入";
 try{
  const res=await fetch(LINE_BRIDGE_URL,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},body:JSON.stringify({action,slug,...ids})});
  const out=await res.json().catch(()=>({error:"LINE_RESPONSE_ERROR"}));
  if(out.sent)return "LINE 提醒已送出";
  if(out.reason==="ALREADY_SENT")return "LINE 提醒已送出";
  if(["CUSTOMER_NOT_LINKED","CUSTOMER_UNFOLLOWED","OA_CANNOT_REACH_CUSTOMER"].includes(out.reason))
   return "提醒暫時無法送出，請先加入店家的 LINE 官方帳號";
  return "提醒暫時無法送出，預約／號碼狀態仍已儲存";
 }catch(e){return "提醒暫時無法送出，預約／號碼狀態仍已儲存";}
}
function customerNoticeSuffix(notice){
 return /提醒暫時無法送出/.test(notice)?"；"+notice:"";
}
async function notifyLineCalled(ticketNumber,ticketId,eventId){return sendLineNotice("notify",{number:ticketNumber,ticketId,eventId});}
function lineStatusBadge(){
  // Hide successful LINE verification: it is internal diagnostics, not customer content.
  // Only show actionable problems; LINE identity and notifications remain enabled.
  if(lineLinkStatus==="linked"){
    if(lineOaRecipient!=="NOT_REACHABLE"&&lineFriendCheck!=="TOKEN_OR_PROFILE_SCOPE")return "";
    const description=lineOaRecipient==="NOT_REACHABLE"?
      (lineProviderMismatch?
        "LINE 官方帳號設定不一致，可能影響通知。請聯絡店家協助確認。":
        "目前無法透過 LINE 官方帳號通知您，請先加入下方官方帳號。"):
      "LINE 授權資訊不完整，請重新授權 LINE。";
    const addFriend=lineOaAddFriendUrl&&lineOaRecipient==="NOT_REACHABLE"?
      ' <a class="btn" style="display:inline-block;padding:10px 14px;border:1px solid #059669;border-radius:10px;background:#ecfdf5" href="'+esc(lineOaAddFriendUrl)+'" target="_blank" rel="noopener">加入平台 LINE 官方帳號</a>':"";
    return '<div class="alert">'+esc(description)+
      '<div class="flex" style="margin-top:8px">'+
      addFriend+' '+btn("重新授權 LINE","line-reauth","outline")+'</div></div>';
  }
  const detail=lineLinkStatus==="connecting"?"正在連接 LINE 帳號…":
    lineLinkStatus==="not-logged-in"?"正在開啟 LINE 授權…":
    lineConnectError||"請授權 LINE 使用者資訊後繼續。";
  const liffUrl=lineConfig?.liffId?lineLoginUrl():"";
  return '<div class="alert">'+esc(detail)+' '+btn("重新登入 LINE","line-reauth","secondary")+(liffUrl?' <a href="'+esc(liffUrl)+'">使用 LINE 登入（手機／電腦）</a>':'')+'</div>';
}

