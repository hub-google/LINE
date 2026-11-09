import {routeState} from "../state/routeState.js";
import {staffState} from "../state/staffState.js";

import {act,rpc,val} from "./../data-loading.js";
import {merchantProfilePatch,merchantUploadLogo} from "./../merchant-brand.js";

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
 return initial?"店家資料已建立並公開搜尋":"企業設定與品牌 LOGO 已儲存";
 });return true;}
 if(a==="invite-staff"){await act(async()=>{await rpc("so_invite_staff",{p_slug:routeState.slug,p_email:val("invite-email"),p_role:val("invite-role")});return "員工邀請已儲存，請通知對方登入接受";});return true;}
return false;
}
