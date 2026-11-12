import {routeState} from "../state/routeState.js";
import {authState} from "../state/authState.js";
import {lineState} from "../state/lineState.js";
import {merchantBrandState} from "../state/merchantBrandState.js";
import {staffState} from "../state/staffState.js";
import {serviceUnitsState} from "../state/serviceUnitsState.js";

import {queueSessionName} from "./../shared-ui.js";
import {act,rpc,val} from "./../data-loading.js";
import {render} from "./../staff-layout.js";

export async function handleQueueSettings(ev,b,a,id){
if(a==="noop-queue-session"){return true;}
 if(a==="set-queue-session"){
   const session=b.dataset.sessionCode;
   if(!["MORNING","AFTERNOON","EVENING","REST"].includes(session))return true;
   if(!confirm("切換至「"+queueSessionName(session)+"」？只影響新取號，不會重設既有號碼。"))return true;
   await act(async()=>{
     await rpc("so_set_queue_session",{p_slug:routeState.slug,p_session:session});
     return "已切換為「"+queueSessionName(session)+"」，現有號碼及順序不變";
   });return true;
 }
 if(a==="save-hold-policy"){
   await act(async()=>{
     const minutes=Number(val("hold-minutes")),max=Number(val("hold-limit")),mode=val("hold-return-mode");
     if(!Number.isInteger(minutes)||minutes<1||minutes>120||!Number.isInteger(max)||max<0||max>10||!["END","ORIGINAL"].includes(mode))throw Error("請設定有效的保留時間、次數與恢復順位");
     await rpc("so_set_queue_hold_policy",{p_slug:routeState.slug,p_hold_minutes:minutes,p_max_holds:max,p_return_mode:mode});
     return "候位保留規則已儲存";
   });return true;
  }
  if(a==="save-customer-flags"){
   await act(async()=>{
     if(!staffState.customerFlagSelected)throw Error("請先選擇本店顧客");
     const tags=val("customer-flag-tags").split(/[,，、;；\n]+/).map(x=>x.trim()).filter(Boolean);
     if(tags.length>10)throw Error("最多十個顧客標籤");
     await rpc("so_staff_set_customer_flag",{
       p_slug:routeState.slug,p_user_id:staffState.customerFlagSelected,p_notes:val("customer-flag-notes"),p_tags:tags,
       p_blacklisted:!!routeState.$("customer-flag-blacklisted")?.checked,
       p_block_new_bookings:!!routeState.$("customer-flag-block")?.checked
     });
     return "顧客標籤及預約限制已保存";
   });return true;
  }
  if(a==="announcement-edit"){staffState.announcementEditId=id;render();return true;}
  if(a==="announcement-edit-cancel"){staffState.announcementEditId="";render();return true;}
  if(a==="announcement-save"){
    await act(async()=>{
      const title=val("announcement-title"),body=val("announcement-body");
      const images=val("announcement-images").split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean);
      const files=Array.from(routeState.$("announcement-photo-files")?.files||[]);
      if(!title||title.length>80||images.length+files.length>8)throw Error("請輸入公告標題；既有照片與新照片合計最多八張");
      if(files.some(f=>!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size<1||f.size>2097152))
        throw Error("公告照片僅支援 JPG、PNG 或 WebP，每張不超過 2 MB");
      if(files.length){
        const userId=authState.session?.user?.id;
        if(!userId||!globalThis.crypto?.randomUUID)throw Error("上傳公告照片前請先登入店家帳號");
        const bucket=lineState.supa.storage.from(merchantBrandState.MERCHANT_LOGO_BUCKET);
        for(const file of files){
          const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
          const key=userId+"/announcements/"+crypto.randomUUID()+"."+ext;
          const uploaded=await bucket.upload(key,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
          if(uploaded.error)throw Error("照片「"+file.name+"」上傳失敗："+uploaded.error.message);
          images.push(bucket.getPublicUrl(uploaded.data.path).data.publicUrl);
        }
      }
      await rpc("so_save_announcement",{p_slug:routeState.slug,p_id:staffState.announcementEditId||null,
        p_title:title,p_body:body,p_images:images,p_active:!!routeState.$("announcement-active")?.checked});
      staffState.announcementEditId="";
      return "公告已成功儲存";
    });return true;
  }
  if(a==="announcement-toggle"){
    if(!confirm("確定變更這篇公告的公開狀態？"))return true;
    await act(async()=>{
      await rpc("so_set_announcement_active",{p_slug:routeState.slug,p_id:id,p_active:b.dataset.active!=="true"});
      return "公告公開狀態已更新";
    });return true;
  }
  if(a==="save-booking-confirmation"){
   await act(async()=>{
     await rpc("so_set_booking_confirmation",{p_slug:routeState.slug,p_required:!!routeState.$("policy-confirm-required")?.checked});
     return "二次確認設定已儲存";
   });return true;
  }
  if(a==="save-booking-policy"){
   await act(async()=>{
     const managed=serviceUnitsState.scheduleConfig?.enabled===true;
     const policy=staffState.staff?.bookingPolicy||{};
     const dates=managed?(policy.closed_dates||[]):val("policy-closed-dates").split(/[,，;；\s]+/).filter(Boolean);
     if(dates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)))throw Error("請使用 YYYY-MM-DD 格式填寫特殊休假日期");
     const days=managed?(policy.closed_weekdays||[]):Array.from(document.querySelectorAll(".policy-closed-day:checked"),x=>Number(x.value));
     await rpc("so_set_booking_policy",{
       p_slug:routeState.slug,p_closed_weekdays:days,p_closed_dates:dates,
       p_break_start:val("policy-break-start"),p_break_end:val("policy-break-end"),
       p_min_notice_minutes:Number(val("policy-notice")||0)
     });
     return "預約營業規則已更新";
   });return true;
 }
return false;
}
