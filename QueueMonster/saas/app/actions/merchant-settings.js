import {authState} from "../state/authState.js";
import {bookingState} from "../state/bookingState.js";
import {feedbackState} from "../state/feedbackState.js";
import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";
import {staffState} from "../state/staffState.js";


import {menuModeLabel,showActionFeedback} from "./../shared-ui.js";
import {act,rpc,val} from "./../data-loading.js";
import {render} from "./../staff-layout.js";
import {refreshServiceSlots} from "./../customer-booking.js";

export async function handleMerchantSettings(ev,b,a,id){
if(a==="save-customer-homepage"){
  await act(async()=>{
    const title=val("homepage-title"),subtitle=val("homepage-subtitle"),label=val("homepage-label");
    if(title.length>60||subtitle.length>180||label.length>32)throw Error("顧客首頁文字超過允許長度");
    if(/[\u0000-\u001f\u007f]/.test(title+subtitle+label))throw Error("首頁文字不可包含換行或控制字元");
    const showIntro=!!routeState.$("homepage-show-intro")?.checked;
    const showLabel=!!routeState.$("homepage-show-label")?.checked;
    await rpc("so_set_customer_homepage",{
      p_slug:routeState.slug,p_title:title,p_subtitle:subtitle,p_label:label,
      p_show_label:showLabel,p_show_intro:showIntro
    });
    return "顧客首頁文字與顯示設定已儲存";
  });
  return true;
}
if(a==="copy-own-oa-webhook"){
  const webhook=lineState.LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(routeState.slug);
  try{await navigator.clipboard.writeText(webhook);showActionFeedback("已複製 Webhook URL","success");}
  catch(e){window.prompt("複製 Webhook URL",webhook);}
  return true;
 }
 if(a==="connect-own-oa"||a==="disconnect-own-oa"){
  if(a==="disconnect-own-oa"&&!confirm("確定改回平台 LINE OA？商家自己的 LIFF 與通知將停止；原預約和取號不會刪除。"))return true;
  await act(async()=>{
   const payload=a==="connect-own-oa"
    ?{action:"connect-merchant-oa",slug:routeState.slug,liffId:val("own-oa-liff"),botToken:val("own-oa-token"),channelSecret:val("own-oa-secret")}
    :{action:"disconnect-merchant-oa",slug:routeState.slug};
   if(!authState.session?.access_token)throw Error("請先登入企業管理者帳號");
   const res=await fetch(lineState.LINE_BRIDGE_URL,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+authState.session.access_token},
    body:JSON.stringify(payload)
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok||!data.ok)throw Error(data.error||"LINE OA 串接失敗");
   lineState.lineConfig=null;lineState.lineConfigSlug="";
   return a==="connect-own-oa"?"LINE OA 已驗證並連接，請設定上方 Webhook URL，並確認 Login 與 Messaging API 同屬 Provider":"已解除自有 LINE OA，恢復平台服務";
  });return true;
 }
 if(a==="save-directory"){await act(async()=>{const enabled=!!routeState.$("directory-enabled")?.checked;await rpc("so_set_directory_listing",{p_slug:routeState.slug,p_enabled:enabled,p_oa_mode:"PLATFORM"});return enabled?"門市已開放在排隊怪獸平台搜尋":"門市已取消公開搜尋（原有專屬連結仍可使用）";});return true;}
 if(a==="menu-edit"){bookingState.editingMenuItemId=id;render();return true;}
 if(a==="menu-edit-clear"){bookingState.editingMenuItemId="";render();return true;}
 if(a==="refresh-service-slots"){void refreshServiceSlots();return true;}
 if(a==="menu-save"){
   await act(async()=>{
     const priceText=val("menu-price"),price=priceText===""?null:Number(priceText);
     let kind=val("menu-kind");
     if(kind==="__CUSTOM__")kind=val("menu-custom-kind");
     if(!kind||kind.length>30||kind==="__CUSTOM__"||/[<>\u0000-\u001f\u007f]/.test(kind))throw Error("請輸入 1～30 字的有效類型名稱");
     if(price!==null&&(!Number.isFinite(price)||price<0))throw Error("請輸入有效的價格");
     const result=await rpc("so_menu_save",{
       p_slug:routeState.slug,p_kind:kind,p_name:val("menu-name"),
       p_description:val("menu-description"),p_price:price,
       p_sort_order:Number(val("menu-order")||0),
       p_active:!!routeState.$("menu-active")?.checked,
       p_item_id:bookingState.editingMenuItemId||null
     });
     bookingState.editingMenuItemId="";
     return "「"+result.name+"」已儲存";
   });return true;
 }
 if(a==="menu-toggle"){
   const item=(staffState.staff?.menu_items||[]).find(x=>x.id===id);
   if(!item){showActionFeedback("找不到這個項目","error");return true;}
   await act(async()=>{
     await rpc("so_menu_save",{p_slug:routeState.slug,p_kind:item.kind,p_name:item.name,
       p_description:item.description||"",p_price:item.price,
       p_sort_order:item.sort_order,p_active:!item.active,p_item_id:item.id});
     return "「"+item.name+"」已"+(item.active?"停用":"上架");
   });return true;
 }
 if(a==="save-number-prefix"){
   const kind=b.dataset.kind;
   if(!["booking","queue"].includes(kind))return true;
   const prefix=document.getElementById("prefix-"+kind)?.value??"";
   const visibleLength=typeof Intl.Segmenter==="function"
     ?Array.from(new Intl.Segmenter("zh-Hant",{granularity:"grapheme"}).segment(prefix)).length
     :Array.from(prefix).length;
   if(visibleLength>3||/[\u0000-\u001f\u007f]/.test(prefix)){showActionFeedback("前綴最多 3 個可見字元，不能包含控制字元","error");return true;}
   await act(async()=>{
     const result=await rpc(kind==="booking"?"so_set_booking_prefix":"so_set_queue_prefix",{p_slug:routeState.slug,p_prefix:prefix});
     return (kind==="booking"?"預約":"叫號")+"前綴已設為："+(result.prefix||"（無前綴）")+"，不影響既有編號";
   });return true;
  }
  if(a==="reset-serial"){
   const kind=b.dataset.kind;
   if(!["booking","queue"].includes(kind))return true;
   const label=kind==="booking"?"預約":"叫號";
   if(feedbackState.busy||b.disabled)return true;
   // Prevent rapid double-taps while waiting for the server-side preview.
   b.disabled=true;
   let preview;
   try{
     preview=await rpc("so_number_reset_preview",{p_slug:routeState.slug,p_kind:kind});
   }catch(error){
     showActionFeedback("無法確認未結案筆數，為避免錯誤重置，請稍後重試："+(error?.message||"未知錯誤"),"error");
     return true;
   }finally{
     if(b.isConnected)b.disabled=false;
   }
   const count=Number(preview?.still_open);
   if(!Number.isSafeInteger(count)||count<0){
     showActionFeedback("無法取得可信的未結案筆數，已取消重置。","error");return true;
   }
   const warning=count>0
     ?"目前還有 "+count+" 筆未結案"+label+"。重置後新舊批次可能出現相同顯示號碼，請以批次及紀錄識別，避免錯誤操作。"
     :"目前沒有未結案"+label+"。";
   if(!confirm("確定重置「"+label+"」編號嗎？\n\n"+warning+"\n\n下一筆新"+(kind==="booking"?"預約":"取號")+"會從 1 開始；歷史資料與原編號都會保留。"))return true;
   await act(async()=>{
     const result=await rpc(kind==="booking"?"so_reset_booking_number":"so_reset_queue_number",{p_slug:routeState.slug});
     const currentOpen=Number(result.still_open);
     const changedCount=Number.isSafeInteger(currentOpen)&&currentOpen!==count
       ?"（重置時尚有 "+currentOpen+" 筆未結案；資料可能在確認期間變動）":"";
     return label+"編號已重置，新資料將從 "+(result.prefix||"")+"1 開始；既有資料未更動。"+changedCount;
   });return true;
  }
  if(a==="resource-save"){
   await act(async()=>{
     const name=val("resource-name"),kind=val("resource-kind");
     if(!name||!["STAFF","ROOM","EQUIPMENT"].includes(kind))throw Error("請輸入員工／房間／設備名稱與類型");
     await rpc("so_resource_upsert",{p_slug:routeState.slug,p_name:name,p_kind:kind,p_active:true,p_resource_id:null});
     return "已新增本店資源："+name;
   });return true;
 }
 if(a==="resource-toggle"){
   const item=(staffState.staff?.resourceContext?.resources||[]).find(x=>x.id===id);
   if(!item){showActionFeedback("找不到本店資源","error");return true;}
   await act(async()=>{
     await rpc("so_resource_upsert",{p_slug:routeState.slug,p_name:item.name,p_kind:item.kind,p_active:!item.active,p_resource_id:item.id});
     return "資源「"+item.name+"」已"+(item.active?"停用":"重新啟用");
   });return true;
 }
 if(a==="service-rule-save"){
   await act(async()=>{
     const item=val("rule-service"),duration=Number(val("rule-duration")),buffer=Number(val("rule-buffer")),resource=val("rule-resource");
     if(!item||!Number.isInteger(duration)||duration<5||duration>480||!Number.isInteger(buffer)||buffer<0||buffer>120)
       throw Error("服務時間應為 5～480 分鐘，緩衝 0～120 分鐘");
     await rpc("so_service_rule_save",{p_slug:routeState.slug,p_item_id:item,p_duration:duration,p_buffer:buffer,
       p_resource_id:resource||null,p_show_duration:!!routeState.$("rule-show-duration")?.checked});
     return "服務時長、緩衝與指定資源已儲存；既有預約保留原本的時間快照";
   });return true;
 }
 if(a==="save-menu-modes"){
   await act(async()=>{
     const value=await rpc("so_menu_set_modes",{p_slug:routeState.slug,
       p_booking_mode:val("menu-book-mode"),p_queue_mode:val("menu-queue-mode")});
     return "菜單及服務規則已儲存：預約「"+menuModeLabel(value.booking)+"」，現場取號「"+menuModeLabel(value.queue)+"」";
   });return true;
 }
return false;
}
