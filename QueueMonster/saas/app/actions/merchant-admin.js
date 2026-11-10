import {routeState} from "../state/routeState.js";
import {authState} from "../state/authState.js";
import {lineState} from "../state/lineState.js";
import {showActionFeedback} from "../shared-ui.js";
import {staffState} from "../state/staffState.js";

import {act,rpc,val} from "./../data-loading.js";
import {merchantLogoSaved,merchantProfilePatch,merchantUploadLogo} from "./../merchant-brand.js";

export async function handleMerchantAdmin(ev,b,a,id){
if(a==="save-service-modes"){await act(async()=>{
  const reservation=document.getElementById("set-service-reservation")?.checked;
  const queue=document.getElementById("set-service-queue")?.checked;
  if(typeof reservation!=="boolean"||typeof queue!=="boolean")throw Error("請在企業設定中調整服務開關");
  await rpc("so_set_merchant_services",{p_slug:routeState.slug,p_reservation:reservation,p_queue:queue});
  return reservation&&queue?"已開放預約與取號":reservation?"已切換為僅提供線上預約":queue?"已切換為僅提供現場取號":"已暫停接受新預約及新取號";
 });return true;}
 if(a==="update-settings"){await act(async()=>{
 const initial=staffState.staff?.tenant?.onboarding_complete===false;
 // Keep an incomplete merchant unlisted until all settings are successfully saved.
 const t=staffState.staff?.tenant||{};
 const patch=merchantProfilePatch("set",t);
 patch.logo_url=await merchantUploadLogo("set",patch.logo_url);
 await rpc("so_update_tenant",{p_slug:routeState.slug,p_patch:patch});
 if(initial){
   await rpc("so_complete_merchant_onboarding",{p_slug:routeState.slug,p_name:patch.name,
     p_phone:patch.phone,p_address:patch.address,p_category:patch.directory_category});
 }
 merchantLogoSaved("set");
 return initial?"店家資料已建立並公開搜尋":"企業設定與品牌 LOGO 已儲存";
 });return true;}
 if(a==="copy-staff-invite"){
   const invite=(staffState.staff?.invites||[]).find(item=>item.id===id);
   if(!invite){showActionFeedback("邀請已不存在，請重新整理員工管理頁面。","error");return true;}
   const link=new URL("./merchant-register.html",location.href);
   link.searchParams.set("mode","login");link.searchParams.set("staff_invite",invite.id);
   try{await navigator.clipboard.writeText(link.href);showActionFeedback("已複製邀請連結；請傳給 "+invite.email+"，對方須用此 Email 登入才能接受。","success");}
   catch(_error){window.prompt("請複製員工邀請連結",link.href);}
   return true;
 }
 if(a==="resend-staff-invite"){
   const invite=(staffState.staff?.invites||[]).find(item=>item.id===id);
   if(!invite){showActionFeedback("此筆邀請不存在，請重新整理。","error");return true;}
   await act(async()=>{
     const {data,error}=await lineState.supa.functions.invoke("staff-invite",{body:{slug:routeState.slug,email:invite.email,role:invite.role}});
     if(error||!data?.saved)throw Error("重新寄送失敗，請改用複製邀請連結。");
     return data.email_sent?"邀請郵件已重新提交寄送，請對方查看收件匣與垃圾郵件。":"邀請信未能寄出，請改用複製邀請連結。";
   });return true;
 }
 if(a==="invite-staff"){await act(async()=>{
   const email=val("invite-email").toLowerCase(),role=val("invite-role");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("請輸入有效的員工電子信箱");
   if(!["STAFF","MANAGER","OWNER"].includes(role))throw Error("員工角色不正確");
   if(!authState.session?.access_token)throw Error("請先登入管理者帳號");
   const {data,error}=await lineState.supa.functions.invoke("staff-invite",{body:{slug:routeState.slug,email,role}});
   if(error)throw Error("邀請寄送服務無法完成，請稍後重試；沒有顯示寄送成功就不代表已寄出。");
   if(!data?.saved)throw Error(data?.error||"無法建立員工邀請");
   return data.email_sent
     ?"員工邀請已建立，郵件已提交寄送；請提醒員工檢查收件匣及垃圾郵件。"
     :"員工邀請已建立，但邀請信未能寄出。請到「待接受邀請」複製連結交給員工。";
 });return true;}
return false;
}
