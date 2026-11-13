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
   const pickup=document.getElementById("set-service-pickup")?.checked;
  if(typeof reservation!=="boolean"||typeof queue!=="boolean"||typeof pickup!=="boolean")throw Error("請在企業設定中調整服務開關");
  await rpc("so_set_all_merchant_services",{p_slug:routeState.slug,p_reservation:reservation,p_queue:queue,p_pickup:pickup});
  return "預約、取號、訂餐三項服務開關已同步儲存，既有紀錄不受影響";
 });return true;}
 if(a==="save-default-operating-hours"){await act(async()=>{
   const open=val("legacy-open"),close=val("legacy-close");
   const capacity=Number(val("legacy-capacity")),minutes=Number(val("legacy-minutes"));
   if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(open)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(close)||close<=open)
     throw Error("請確認營業時間，結束時間必須晚於開始時間");
   if(!Number.isInteger(capacity)||capacity<1||capacity>100)throw Error("每時段人數必須介於 1～100");
   if(![15,30,60].includes(minutes))throw Error("請選擇預約時段間隔");
   await rpc("so_update_tenant",{p_slug:routeState.slug,
     p_patch:{open_time:open,close_time:close,slot_capacity:capacity,slot_minutes:minutes}});
   return "預設營業時段已更新";
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
 if(a==="promote-staff-manager"){
   const target=(staffState.staff?.members||[]).find(m=>m.user_id===id);
   if(!target||target.role!=="STAFF"){showActionFeedback("找不到可設為管理者的員工。","error");return true;}
   if(!window.confirm("確定將 "+(target.email||"這位員工")+" 設為管理者？對方將取得店家管理權限。"))return true;
   await act(async()=>{
     const result=await rpc("so_promote_tenant_manager",{p_slug:routeState.slug,p_user_id:id});
     if(!result?.promoted)throw Error("無法變更員工角色");
     return "已新增一位管理者。若你是原本唯一管理者，現在可以退出店家。";
   });return true;
 }
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
