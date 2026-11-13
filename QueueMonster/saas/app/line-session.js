import {customerEntryUrl} from "../shared-customer-links.js";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../public-config.js";
import {requestBookingReply} from "./booking-line-reply.js";
import {authState} from "./state/authState.js";
import {bookingState} from "./state/bookingState.js";
import {lineState} from "./state/lineState.js";
import {queueState} from "./state/queueState.js";
import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";



import {incomingParam,isSafeMerchant,refreshLiffRoute} from "./route-state.js";
import {btn,esc,customerFacingError} from "./shared-ui.js";

export async function bridgeConfig(){
  const merchant=isSafeMerchant(routeState.slug)?routeState.slug:"";
  if(lineState.lineConfig!==null&&lineState.lineConfigSlug===merchant)return lineState.lineConfig;
  try{
    const res=await fetch(lineState.LINE_BRIDGE_URL+"?action=config&merchant="+encodeURIComponent(merchant),{cache:"no-store"});
    if(res.ok){lineState.lineConfig=await res.json();lineState.lineConfigSlug=merchant;}
  }catch(e){console.warn("LINE 設定尚不可用");}
  return lineState.lineConfig||{};
}

export function customerUrl(merchant){
 return customerEntryUrl(merchant,{
   currentSlug:routeState.slug,origin:location.origin,bookingPath:sharedUiState.bookingPath,
   liffId:lineState.lineConfig?.liffId||""
 });
}

export function lineLoginUrl(){
  const siteReturn=incomingParam("site_return");
  return "https://liff.line.me/"+encodeURIComponent(lineState.lineConfig?.liffId||"")+"/?view=customer"+(isSafeMerchant(routeState.slug)?"&merchant="+encodeURIComponent(routeState.slug):"")+(routeState.customerTab?"&tab="+encodeURIComponent(routeState.customerTab):"")+(siteReturn?"&site_return="+encodeURIComponent(siteReturn):"")+(["merchant-oa","platform-oa"].includes(incomingParam("entry"))?"&entry="+encodeURIComponent(incomingParam("entry")):"")+
    (bookingState.manageKind&&bookingState.manageItem?"&manage="+encodeURIComponent(bookingState.manageKind)+"&item="+encodeURIComponent(bookingState.manageItem)+"&mode="+encodeURIComponent(bookingState.manageMode):"")+
    (routeState.customerTab==="progress"&&queueState.progressTicketId?"&ticket="+encodeURIComponent(queueState.progressTicketId):"")+
    (routeState.customerTab==="detail"&&routeState.detailId?"&kind="+encodeURIComponent(routeState.detailKind)+"&item="+encodeURIComponent(routeState.detailId):"");
}

export function cleanLineRedirectUri(){
 const url=new URL(location.origin+location.pathname);
 url.searchParams.set("view",routeState.view);
 if(isSafeMerchant(routeState.slug))url.searchParams.set("merchant",routeState.slug);
 if(routeState.view==="customer"){
  if(routeState.customerTab)url.searchParams.set("tab",routeState.customerTab);
  if(["merchant-oa","platform-oa"].includes(incomingParam("entry")))url.searchParams.set("entry",incomingParam("entry"));
  const siteReturn=incomingParam("site_return");
  if(siteReturn)url.searchParams.set("site_return",siteReturn);
  if(routeState.customerTab==="progress"&&queueState.progressTicketId)url.searchParams.set("ticket",queueState.progressTicketId);
  if(routeState.customerTab==="detail"&&routeState.detailId){url.searchParams.set("kind",routeState.detailKind);url.searchParams.set("item",routeState.detailId);}
  if(bookingState.manageKind&&bookingState.manageItem){
   url.searchParams.set("manage",bookingState.manageKind);
   url.searchParams.set("item",bookingState.manageItem);
   url.searchParams.set("mode",bookingState.manageMode);
  }
 }
 return url.href;
}

export function finishPublicHeaderLogin(){
  const key="line-site-auth-return-v1";
  let stored=null;
  try{stored=JSON.parse(sessionStorage.getItem(key)||"null")}catch(_){}
  const recent=stored&&Number(stored.at)>0&&Date.now()-Number(stored.at)<15*60*1000;
  const target=incomingParam("site_return")||(recent?stored.target:"");
  if(typeof target!=="string"||target.length>600||
     !/^(?:home|directory|board|merchant-center|merchant-register|privacy|terms)\.html(?:\?[^#]*)?$/.test(target))return false;
  const destination=new URL(target,location.origin+sharedUiState.bookingPath);
  if(destination.origin!==location.origin||
     !/^\/LINE\/(?:booking|saas)\/(?:home|directory|board|merchant-center|merchant-register|privacy|terms)\.html$/.test(destination.pathname))return false;
  try{sessionStorage.removeItem(key)}catch(_){}
  location.replace(destination.pathname+destination.search);
  return true;
}

export function acceptVerifiedLineIdentity(result){
 if(!result?.linked||!result.displayName)throw Error("LINE 身分驗證未完成");
 lineState.lineDisplayName=result.displayName;
 lineState.lineLinkStatus="linked";
 window.dispatchEvent(new Event("line-site-auth-changed"));
 sessionStorage.removeItem(authRecoveryKey());
 lineState.lineFriendStatus=result.isFollowing===true?true:result.isFollowing===false?false:null;
 lineState.lineOaRecipient=["REACHABLE","NOT_REACHABLE","UNKNOWN"].includes(result.recipientReachability)?result.recipientReachability:"UNKNOWN";
 lineState.lineFriendCheck=String(result.friendCheckStatus||"UNAVAILABLE");
 lineState.lineOaAddFriendUrl=typeof result.oaAddFriendUrl==="string"&&
  /^https:\/\/line\.me\/R\/ti\/p\/@[a-zA-Z0-9_.-]{2,100}$/.test(result.oaAddFriendUrl)?result.oaAddFriendUrl:"";
 lineState.lineProviderMismatch=result.providerMismatchSuspected===true;
}

export async function resumeVerifiedLineSession(){
 if(routeState.view!=="customer"||!authState.session?.access_token)return false;
 try{
  const res=await fetch(lineState.LINE_BRIDGE_URL,{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+authState.session.access_token},
   body:JSON.stringify(isSafeMerchant(routeState.slug)?{action:"resume",slug:routeState.slug}:{action:"resume-platform"})
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

export function authRecoveryKey(){return "line-saas-reauth-v2:"+routeState.slug}

export function recoverLineLogin(manual=false){
 const key=authRecoveryKey(),last=Number(sessionStorage.getItem(key)||0);
 if(!manual&&last>0&&Date.now()-last<120000){
  lineState.lineLinkStatus="failed";
  lineState.lineConnectError="LINE 登入驗證未完成，請按「重新登入 LINE」再試一次。";
  return false;
 }
 sessionStorage.setItem(key,String(Date.now()));
 lineState.lineLinkStatus="connecting";
 lineState.lineConnectError="資料更新中，請稍後";
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

export async function connectLineSession(force=false){
  if(routeState.view!=="customer"||!authState.session?.access_token)return;
  if(force)lineState.lineLinkAttempted=false;
  if(lineState.lineLinkAttempted)return;
  const config=await bridgeConfig();
  if(!config.liffId){lineState.lineLinkStatus="not-ready";lineState.lineConnectError="目前無法使用 LINE 登入，請稍後再試。";return;}
  lineState.lineLinkAttempted=true;
  lineState.lineLinkStatus="connecting";
  lineState.lineConnectError="";
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
    if(lineState.lineConfigSlug!==routeState.slug){
      // A LIFF redirect can restore merchant from liff.state.
      lineState.lineConfig=null;lineState.lineConfigSlug="";
    }
    if(!window.liff.isLoggedIn()){
      lineState.lineLinkStatus="not-logged-in";
      lineState.lineConnectError="請按下方「使用 LINE 登入」以完成身分驗證；登入前仍可查看公開叫號看板。";
      // A customer opening a merchant URL in Safari should not be thrown
      // straight into LINE Login before seeing the merchant's service page.
      // An explicit click in the shared site header retains its one-click flow.
      if(!window.liff.isInClient()&&new URLSearchParams(location.search).get("site_login")==="1"){
        const clean=new URL(location.href);
        clean.searchParams.delete("site_login");
        history.replaceState(null,"",clean.pathname+clean.search+clean.hash);
        window.liff.login({redirectUri:cleanLineRedirectUri()});
      }
      return;
    }
    const idToken=window.liff.getIDToken()||"";
    const accessToken=window.liff.getAccessToken()||"";
    if(!idToken&&!accessToken){
      recoverLineLogin(force);
      return;
    }
    const link=async()=>{
      const res=await fetch(lineState.LINE_BRIDGE_URL,{
        method:"POST",
        headers:{"content-type":"application/json","authorization":"Bearer "+authState.session.access_token},
        body:JSON.stringify(isSafeMerchant(routeState.slug)?{action:"link",slug:routeState.slug,idToken,accessToken}:{action:"link-platform",idToken,accessToken})
      });
      return {res,result:await res.json()};
    };
    let {res,result}=await link();
    if(res.status===409&&result.error==="LINE_ACCOUNT_CHANGED"&&authState.session.user?.is_anonymous){
      const signedOut=await lineState.supa.auth.signOut();
      if(signedOut.error)throw signedOut.error;
      const fresh=await lineState.supa.auth.signInAnonymously();
      if(fresh.error||!fresh.data.session)throw fresh.error||Error("無法建立顧客識別");
      authState.session=fresh.data.session;
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
       LINE_ID_TOKEN_AUDIENCE_MISMATCH:"LINE 登入頻道與憑證不一致，請重新開啟排隊怪獸並登入。",
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
    lineState.lineLinkStatus="failed";
    lineState.lineConnectError=/code_verifier|pkce/i.test(message)?
      "LINE 登入驗證已失效，請重新登入 LINE。":customerFacingError(e,"line");
    console.warn("LINE 身分連接失敗",lineState.lineConnectError);
  }
}

export async function lineReplyHandoff(kind,recordId) {
 if(!["reservation","ticket","order"].includes(kind))throw Error("LINE 通知類型不正確");
 if(!authState.session?.access_token)throw Error("請先完成 LINE 登入驗證");
 const res=await fetch(lineState.LINE_BRIDGE_URL,{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+authState.session.access_token},
   body:JSON.stringify({action:"event-reply-command",slug:routeState.slug,kind,recordId})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok||data.ok!==true||typeof data.command!=="string"||
   !/^https:\/\/line\.me\/R\/oaMessage\//.test(data.oaMessageUrl||"")||
   !["MERCHANT","PLATFORM"].includes(data.oaMode))
   throw Error("LINE 確認訊息暫時無法產生，請在此頁稍後重試");
 return data;
}
export async function bookingReplyHandoff(reservationId){
 return lineReplyHandoff("reservation",reservationId);
}
export async function sendActionReply(kind,recordId){
 const config=await bridgeConfig();
 let handoff;
 try{handoff=await lineReplyHandoff(kind,recordId);}
 catch(_){return "提醒暫時無法送出；資料已儲存，請在單筆紀錄頁重試。";}
 const routeEntry=incomingParam("entry")||new URLSearchParams(location.search).get("entry");
 const platform=handoff.oaMode==="PLATFORM";
 const result=await requestBookingReply(window.liff,recordId,{
   oaMode:platform?"PLATFORM":"MERCHANT",
   merchantOaConnected:!platform,
   expectedLiffId:config.liffId||"",
   fromMerchantChat:!platform&&routeEntry==="merchant-oa",
   fromPlatformChat:platform&&routeEntry==="platform-oa",
   command:handoff.command
 });
 return result.requested
   ?"已向"+(platform?"排隊怪獸":"店家")+" LINE 官方帳號送出確認請求，請查看 LINE 聊天室"
   :"提醒暫時無法送出；操作已成功。請從單筆紀錄按「LINE 取得確認」，在"+(platform?"排隊怪獸":"店家")+" LINE 聊天室按傳送。";
}
export async function sendBookingReply(reservationId){
 return sendActionReply("reservation",reservationId);
}
export async function sendTicketReply(ticketId){
 return sendActionReply("ticket",ticketId);
}
export async function sendOrderReply(orderId){
 return sendActionReply("order",orderId);
}

export async function sendLineNotice(action,ids){
 if(!authState.session?.access_token)return "提醒暫時無法送出，請重新登入";
 try{
  const res=await fetch(lineState.LINE_BRIDGE_URL,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+authState.session.access_token},body:JSON.stringify({action,slug:routeState.slug,...ids})});
  const out=await res.json().catch(()=>({error:"LINE_RESPONSE_ERROR"}));
  if(out.sent)return "LINE 提醒已送出";
  if(out.reason==="ALREADY_SENT")return "LINE 提醒已送出";
  if(["CUSTOMER_NOT_LINKED","CUSTOMER_UNFOLLOWED","OA_CANNOT_REACH_CUSTOMER"].includes(out.reason))
   return "提醒暫時無法送出，請先加入店家的 LINE 官方帳號";
  return "提醒暫時無法送出，預約／號碼狀態仍已儲存";
 }catch(e){return "提醒暫時無法送出，預約／號碼狀態仍已儲存";}
}

export function customerNoticeSuffix(notice){
 return /提醒暫時無法送出/.test(notice)?"；"+notice:"";
}

export async function notifyLineCalled(ticketNumber,ticketId,eventId){return sendLineNotice("notify",{number:ticketNumber,ticketId,eventId});}

export function lineStatusBadge(){
  // Hide successful LINE verification: it is internal diagnostics, not customer content.
  // Only show actionable problems; LINE identity and notifications remain enabled.
  if(lineState.lineLinkStatus==="linked"){
    if(lineState.lineOaRecipient!=="NOT_REACHABLE"&&lineState.lineFriendCheck!=="TOKEN_OR_PROFILE_SCOPE")return "";
    const description=lineState.lineOaRecipient==="NOT_REACHABLE"?
      (lineState.lineProviderMismatch?
        "LINE 官方帳號設定不一致，可能影響通知。請聯絡店家協助確認。":
        "目前無法透過 LINE 官方帳號通知您，請先加入下方官方帳號。"):
      "LINE 授權資訊不完整，請重新授權 LINE。";
    const addFriend=lineState.lineOaAddFriendUrl&&lineState.lineOaRecipient==="NOT_REACHABLE"?
      ' <a class="btn" style="display:inline-block;padding:10px 14px;border:1px solid #059669;border-radius:10px;background:#ecfdf5" href="'+esc(lineState.lineOaAddFriendUrl)+'" target="_blank" rel="noopener">加入平台 LINE 官方帳號</a>':"";
    return '<div class="alert">'+esc(description)+
      '<div class="flex" style="margin-top:8px">'+
      addFriend+' '+btn("重新授權 LINE","line-reauth","outline")+'</div></div>';
  }
  const detail=lineState.lineLinkStatus==="connecting"?"正在連接 LINE 帳號…":
    lineState.lineLinkStatus==="not-logged-in"?"請使用 LINE 登入後繼續預約或取號。":
    lineState.lineConnectError||"請授權 LINE 使用者資訊後繼續。";
  const liffUrl=lineState.lineConfig?.liffId?lineLoginUrl():"";
  const loginLabel=lineState.lineLinkStatus==="not-logged-in"?"使用 LINE 登入":"重新登入 LINE";
  return '<div class="alert">'+esc(detail)+' '+btn(loginLabel,"line-reauth","secondary")+(liffUrl?' <a href="'+esc(liffUrl)+'">使用 LINE 登入（手機／電腦）</a>':'')+'</div>';
}

export function initializeLineSession(){
lineState.SB_URL=SUPABASE_URL;
lineState.SB_KEY=SUPABASE_PUBLISHABLE_KEY;
lineState.routeBeforeAuth=new URLSearchParams(location.search);
lineState.initialViews=lineState.routeBeforeAuth.getAll("view");
lineState.initialView=lineState.initialViews[lineState.initialViews.length-1]||"customer";
lineState.authOptions={persistSession:true,autoRefreshToken:true,detectSessionInUrl:false};
if(lineState.initialView==="customer")lineState.authOptions.storageKey="line-saas-customer-session-v2";
lineState.supa=createClient(lineState.SB_URL,lineState.SB_KEY,{auth:lineState.authOptions});
lineState.LINE_BRIDGE_URL=lineState.SB_URL+"/functions/v1/line-bridge";
lineState.lineConfig=null;
lineState.lineConfigSlug="";
lineState.lineLinkStatus="not-ready";
lineState.lineLinkAttempted=false;
lineState.lineFriendStatus=null;
lineState.lineDisplayName="";
lineState.lineConnectError="";
lineState.lineOaRecipient="UNKNOWN";
lineState.lineFriendCheck="UNAVAILABLE";
lineState.lineOaAddFriendUrl="";
lineState.lineProviderMismatch=false;
}
