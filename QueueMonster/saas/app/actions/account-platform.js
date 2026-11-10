import {authState} from "../state/authState.js";
import {feedbackState} from "../state/feedbackState.js";
import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";
import {staffHistoryState} from "../state/staffHistoryState.js";
import {staffState} from "../state/staffState.js";


import {render} from "./../staff-layout.js";
import {showActionFeedback} from "./../shared-ui.js";
import {loadCustomerHistory} from "./../staff-history.js";
import {act,checked,rpc,urlFor,val} from "./../data-loading.js";
import {merchantLogoSaved,merchantProfilePatch,merchantUploadLogo} from "./../merchant-brand.js";

export async function handleAccountPlatform(ev,b,a,id){
if(a==="customer-history-close"){
   staffHistoryState.customerHistorySeq++;staffHistoryState.customerHistoryUserId="";staffHistoryState.customerHistoryData=null;staffHistoryState.customerHistoryError="";
   render();return true;
 }
 if(a==="customer-history-prev"||a==="customer-history-next"){
   if(staffHistoryState.customerHistoryLoading||!staffHistoryState.customerHistoryData)return true;
   const next=staffHistoryState.customerHistoryPage+(a==="customer-history-next"?1:-1);
   const last=Math.max(1,Math.ceil(Number(staffHistoryState.customerHistoryData.total||0)/25));
   if(next<1||next>last)return true;
   void loadCustomerHistory(next);return true;
 }


  if(a==="login"||a==="signup"){const email=val("auth-email"),password=val("auth-pass");if(!email||password.length<8){feedbackState.err="請輸入 Email 與至少 8 字元的密碼";render();return true;}
 await act(async()=>{if(authState.session?.user?.is_anonymous){await lineState.supa.auth.signOut();authState.session=null}
 const r=a==="login"?await lineState.supa.auth.signInWithPassword({email,password}):await lineState.supa.auth.signUp({email,password});
 if(r.error)throw Error(r.error.message);authState.session=r.data.session;return a==="signup"?"帳號已送出註冊；如需確認信，請先驗證後登入。":"登入成功";});return true;}


  if(a==="logout"){await act(async()=>{const r=await lineState.supa.auth.signOut();if(r.error)throw Error(r.error.message);authState.session=null;authState.context=null;staffState.staff=null;return "已登出";});return true;}
 if(a==="accept-invite"){await act(async()=>{await rpc("so_accept_invite",{p_invite_id:id});return "已接受企業邀請";});return true;}
 if(a==="claim-admin"){await act(async()=>{await rpc("so_claim_platform_admin",{p_token:val("bootstrap-token")});return "已取得平台管理員權限";});return true;}
 if(a==="new-tenant"){routeState.platformTab="create";render();return true;}
 if(a==="create-tenant"){await act(async()=>{
  const patch=merchantProfilePatch("create");
  const code=val("create-slug");
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(code))throw Error("網址英文代碼需為 3～40 個小寫字母、數字或連字號");
  const email=val("create-owner");
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("企業管理者 Email 格式不正確");
  patch.logo_url=await merchantUploadLogo("create",patch.logo_url);
  const result=await rpc("so_create_tenant",{p_name:patch.name,
   p_slug:code,
   p_modules:checked("create-feature"),p_owner_email:email||null});
  try{await rpc("so_update_tenant",{p_slug:result.slug,p_patch:patch});}
  catch(error){routeState.platformTab="list";throw Error("企業已建立，但部分設定未儲存（"+result.slug+"）："+error.message);}
  merchantLogoSaved("create");
  routeState.platformTab="list";
  return "企業已建立，LOGO 與品牌設定已儲存";
 });return true;}
 if(a==="toggle-company"){await act(async()=>{const target=b.dataset.slug;const t=routeState.overview.find(x=>x.slug===target);if(!t)throw Error("找不到企業，請重新整理清單");await rpc("so_update_tenant",{p_slug:target,p_patch:{status:t.status==="ACTIVE"?"SUSPENDED":"ACTIVE"}});return "已更新企業啟用狀態";});return true;}
 if(a==="copy-customer"||a==="copy-staff"){await act(async()=>{
  const s=routeState.slug,v=a==="copy-customer"?"customer":"staff";
  const u=await urlFor(v,s);
  try{await navigator.clipboard.writeText(u);return "已複製網址："+u;}
  catch(e){window.prompt("複製網址",u);return "請複製顯示的網址";}
 });return true;}
 if(a==="copy-service-link"){
   const link=b.dataset.url||"";
   const kind=b.dataset.serviceKind;
   if(!link||!["queue","reserve"].includes(kind))return true;
   let url;
   try{
     url=new URL(link);
     if(url.protocol!=="https:"&&url.origin!==location.origin)throw Error("網址格式不正確");
   }catch(_error){showActionFeedback("顧客網址無效，請重新整理","error");return true;}
   try{
     await navigator.clipboard.writeText(url.href);
     showActionFeedback("已複製"+(kind==="queue"?"抽號":"預約")+"網址","success");
   }catch(_error){window.prompt("請複製"+(kind==="queue"?"抽號":"預約")+"網址",url.href);}
   return true;
 }
 if(a==="create-business-group"){
   await act(async()=>{
     await rpc("so_create_business_group",{p_name:val("group-name")});
     return "已建立總店群組";
   });return true;
 }
 if(a==="attach-business-branch"){
   const group=b.dataset.group;
   await act(async()=>{
     await rpc("so_attach_business_branch",{p_group_id:group,p_slug:val("branch-slug-"+group)});
     return "分店已加入總店";
   });return true;
 }
 if(a==="detach-business-branch"){
   if(!confirm("確定把分店移出總店嗎？不會刪除門市、預約或叫號資料。"))return true;
   await act(async()=>{
     await rpc("so_detach_business_branch",{p_group_id:b.dataset.group,p_slug:b.dataset.slug});
     return "分店已移出總店";
   });return true;
 }
return false;
}
