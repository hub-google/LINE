import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";

import {sharedUiState} from "../state/sharedUiState.js";

import {staffState} from "../state/staffState.js";

import {box,btn,esc,field,tag} from "../shared-ui.js";

import {merchantProfileFields} from "../merchant-brand.js";
import {customerUrl} from "../line-session.js";
import {closedDatesPickerMarkup,installClosedDatesPicker} from "../closed-dates-picker.js";

export function renderStaffSettings({t,isManager,html}){
  installClosedDatesPicker();
  const policy=staffState.staff.bookingPolicy||{};
  const selectedFlag=staffState.staffCustomerBook.find(x=>x.id===staffState.customerFlagSelected)||staffState.staffCustomerBook[0]||null;
  if(selectedFlag)staffState.customerFlagSelected=selectedFlag.id;
  const weekdayChecks=[["0","週日"],["1","週一"],["2","週二"],["3","週三"],["4","週四"],["5","週五"],["6","週六"]]
      .map(([day,title])=>'<label class="checklist"><input type="checkbox" class="policy-closed-day" value="'+day+'" '+((policy.closed_weekdays||[]).includes(Number(day))?"checked":"")+'> '+title+'</label>').join("");
  const serviceModules=t.modules||{};
  html+=box("顧客服務開放設定",
    '<p class="muted">店家可自行決定提供線上預約、現場取號，或同時提供兩種服務。關閉後顧客不再能建立新預約／新號碼，原有紀錄與已發出的號碼仍保留。</p>'+
    (isManager?
      '<div class="grid"><label class="checklist"><input id="set-service-reservation" type="checkbox" '+(serviceModules.reservation?'checked':'')+'> 開放線上預約</label>'+
      '<label class="checklist"><input id="set-service-queue" type="checkbox" '+(serviceModules.queue?'checked':'')+'> 開放現場取號</label></div>'+
      '<p class="small">只勾預約＝僅預約；只勾取號＝僅取號；都勾＝兩種服務；都不勾＝暫停接收新顧客。</p>'+
      '<div class="staff-actionbar">'+btn("儲存服務開關","save-service-modes","primary")+'</div>':
      '<p class="small">目前：預約 '+(serviceModules.reservation?'已開放':'未開放')+'，現場取號 '+(serviceModules.queue?'已開放':'未開放')+'。只有店家管理者可以修改。</p>'))+
  box("企業基本設定",!isManager?'<p class="muted">只有管理者可以修改設定。</p>':
   merchantProfileFields("set",t)+
   '<div class="merchant-profile-actions">'+btn("儲存企業設定","update-settings","primary")+'</div>')+
  (isManager?box("顧客首頁文字與顯示設定",
    '<p class="small">以下僅影響顧客預約／取號首頁，不會更改店家名稱、搜尋資料或預約功能。留空的文字不會顯示；可直接關閉整個介紹區塊。</p>'+
    '<label class="checklist"><input id="homepage-show-intro" type="checkbox" '+(staffState.customerHomepageCopy?.show_intro===true?'checked':'')+'>顯示首頁介紹區塊</label>'+
    '<div class="grid"><div>'+field("首頁主標題","homepage-title",staffState.customerHomepageCopy?.title??t.name,"text",'maxlength="60" placeholder="例如：歡迎來到本店"')+'</div>'+
    '<div>'+field("上方小標籤（可留空）","homepage-label",staffState.customerHomepageCopy?.label??"","text",'maxlength="32" placeholder="不需要可留空"')+'</div></div>'+
    '<label for="homepage-subtitle">首頁說明文字（可留空）</label><textarea id="homepage-subtitle" class="field" rows="2" maxlength="180" placeholder="想給顧客看的簡短介紹">'+esc(staffState.customerHomepageCopy?.subtitle??t.description??"")+'</textarea>'+
    '<label class="checklist"><input id="homepage-show-label" type="checkbox" '+(staffState.customerHomepageCopy?.show_label?'checked':'')+'>顯示上方小標籤</label>'+
    '<div class="staff-actionbar">'+btn("儲存顧客首頁設定","save-customer-homepage","primary")+'</div>'):"")+
  (isManager?box("候位保留規則",
     '<p class="small">保留期間不會叫號；到期後下一次叫號時自動恢復。可設定回原順位或隊尾，原票券號碼不變。</p>'+
     '<div class="grid3"><div>'+field("每次保留分鐘數","hold-minutes",staffState.staff.queue_hold_policy?.hold_minutes??20,"number",'min="1" max="120"')+
     '</div><div>'+field("最多保留次數","hold-limit",staffState.staff.queue_hold_policy?.max_holds??2,"number",'min="0" max="10"')+
     '</div><div><label for="hold-return-mode">恢復後順位</label><select id="hold-return-mode" class="field">'+
     [["END","返回隊尾"],["ORIGINAL","返回原順位"]].map(([v,name])=>'<option value="'+v+'" '+((staffState.staff.queue_hold_policy?.return_mode||"END")===v?"selected":"")+'>'+name+'</option>').join("")+
     '</select></div></div><div class="staff-actionbar">'+btn("儲存候位保留規則","save-hold-policy","primary")+'</div>'):"")+
   (isManager?box("預約營業日與休息設定",
      '<p class="small">選擇每週固定公休日；特殊休假日期可直接點開日曆多選，系統會自動整理成日期文字。既有預約不會被自動取消。</p>'+
      '<label>每週固定公休日</label><div class="grid">'+weekdayChecks+'</div>'+
      closedDatesPickerMarkup(policy.closed_dates||[])+
      '<div class="grid"><div>'+field("每日休息開始（可留空）","policy-break-start",policy.break_start||"","time")+
      field("最晚提前預約分鐘數","policy-notice",policy.min_notice_minutes??0,"number",'min="0" max="10080"')+'</div>'+
      '<div>'+field("每日休息結束（可留空）","policy-break-end",policy.break_end||"","time")+'</div></div>'+
      '<div style="margin-top:14px">'+btn("儲存預約營業規則","save-booking-policy","primary")+'</div>'):"")+
  (isManager?box("預約送出前二次確認",
    '<p class="small">預設開啟。顧客會先看到預約內容，再決定是否真正送出。</p>'+
    '<label class="checklist"><input id="policy-confirm-required" type="checkbox" '+(policy.require_confirmation!==false?"checked":"")+'>送出前顯示確認卡</label>'+
    '<div style="margin-top:14px">'+btn("儲存二次確認設定","save-booking-confirmation","primary")+'</div>'):"")+
  (isManager?box("顧客簿、未到店紀錄與黑名單",
    '<p class="small">本店顧客紀錄獨立，未驗證的同名或電話不會自動合併。黑名單可只記錄警示，也可選擇禁止新的預約。</p>'+
    (staffState.staffCustomerBook.length?
      '<div class="scroll"><table class="rows"><tr><th>顧客</th><th>歷史預約</th><th>未到店</th><th>狀態</th></tr>'+
      staffState.staffCustomerBook.slice(0,40).map(x=>'<tr><td>'+esc(x.name||"LINE 顧客")+'</td><td><a class="customer-history-link" href="#customer-history" data-customer-history-id="'+esc(x.id)+'" aria-label="查看 '+esc(x.name||"LINE 顧客")+' 的所有歷史預約">'+esc(x.bookings)+' 筆</a></td><td>'+esc(x.no_shows)+'</td><td>'+esc(x.block_new_bookings?"禁止新預約":x.blacklisted?"觀察名單":"正常")+'</td></tr>').join("")+'</table></div>'+
      '<label for="customer-flag-picker">選擇顧客</label><select id="customer-flag-picker" class="field">'+
        staffState.staffCustomerBook.map(x=>'<option value="'+esc(x.id)+'" '+(selectedFlag?.id===x.id?"selected":"")+'>'+esc(x.name||"LINE 顧客")+' · '+esc(x.bookings)+' 筆預約'+(Number(x.no_shows)>0?" · 未到 "+esc(x.no_shows)+" 次":"")+'</option>').join("")+'</select>'+
      field("顧客標籤（逗號分隔，最多 10 個）","customer-flag-tags",(selectedFlag?.tags||[]).join("、"))+
      '<label for="customer-flag-notes">服務備註（僅店家可看）</label><textarea class="field" id="customer-flag-notes" rows="3" maxlength="2000">'+esc(selectedFlag?.notes||"")+'</textarea>'+
      '<label class="checklist"><input id="customer-flag-blacklisted" type="checkbox" '+(selectedFlag?.blacklisted?"checked":"")+'>標記黑名單／未到店警示</label>'+
      '<label class="checklist"><input id="customer-flag-block" type="checkbox" '+(selectedFlag?.block_new_bookings?"checked":"")+'>禁止此顧客建立新的預約</label>'+
      '<div class="staff-actionbar">'+btn("儲存顧客標籤與限制","save-customer-flags","primary")+'</div>':
      '<p class="muted">本店目前還沒有可建立顧客簿的預約資料。</p>')):"")+
  (isManager?box("門市公告與照片",
    '<p class="small">可以發布公告、價目表連結及最多 8 張可橫向滑動的照片。請使用可公開瀏覽的 HTTPS 圖片網址，勿貼個資或私密連結。</p>'+
    (staffState.staffAnnouncements.length?staffState.staffAnnouncements.map(a=>
      '<div class="listline"><span><strong>'+esc(a.title)+'</strong>　'+tag(a.active?"公開":"未公開")+'</span>'+
      '<span>'+btn("編輯","announcement-edit","outline",'data-id="'+esc(a.id)+'"')+
      btn(a.active?"暫停公開":"重新公開","announcement-toggle","outline",'data-id="'+esc(a.id)+'" data-active="'+esc(a.active)+'"')+'</span></div>').join(""):'<p class="muted">目前沒有公告。</p>')+
    '<div style="margin-top:12px">'+field("公告標題","announcement-title",(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.title)||"")+
    '<label for="announcement-body">公告內容</label><textarea class="field" id="announcement-body" rows="4" maxlength="2000">'+esc(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.body||"")+'</textarea>'+
    '<label for="announcement-images">照片網址（每行一張，最多 8 張）</label><textarea class="field" id="announcement-images" rows="4">'+esc((staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.images||[]).join("\n"))+'</textarea>'+
    '<label class="checklist"><input type="checkbox" id="announcement-active" '+(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.active===false?"":"checked")+'>發布至顧客首頁</label>'+
    '<div class="staff-actionbar">'+btn(staffState.announcementEditId?"儲存修改":"發布公告","announcement-save","primary")+
       (staffState.announcementEditId?btn("取消編輯","announcement-edit-cancel","outline"):"")+'</div></div>'):"")+
  box("LINE 官方帳號串接",
    '<p>目前通知來源：<strong>'+(lineState.lineConfig?.merchantOaConnected?"商家自己的 LINE OA":"平台 LINE OA")+'</strong></p>'+
    '<p class="small">若要使用自己的 LINE 官方帳號，請確認登入服務與訊息通知使用同一組 LINE 管理者設定；沒有自有官方帳號也可使用平台提供的服務。</p>'+
    (lineState.lineConfig?.merchantOaConnected?
     '<p>已連接 LINE OA：<strong>'+esc(lineState.lineConfig.botBasicId||"")+'</strong></p>':"")+
    (isManager?
     '<div class="grid"><div>'+field("LINE 登入應用程式編號（LIFF ID）","own-oa-liff",lineState.lineConfig?.merchantOaConnected?lineState.lineConfig.liffId:"")+
      field("官方帳號存取憑證（Channel Access Token）","own-oa-token","","password",'autocomplete="new-password"')+
     '</div><div>'+field("官方帳號驗證金鑰（Channel Secret）","own-oa-secret","","password",'autocomplete="new-password"')+
     '<p class="small">Channel Secret 需為 32 位十六進位字元。憑證會由系統向 LINE 驗證，成功後將安全保存，後台不會再次顯示完整憑證。</p></div></div>'+
     '<div class="staff-actionbar">'+btn("驗證並連接自有 LINE OA","connect-own-oa","primary")+
       (lineState.lineConfig?.merchantOaConnected?btn("解除自有 OA 綁定","disconnect-own-oa","outline"):"")+'</div>'+
     '<p class="small">請在 LINE 官方帳號管理介面設定下列訊息回傳網址（Webhook URL）：</p>'+
     '<p class="small" style="overflow-wrap:anywhere">'+esc(lineState.LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(routeState.slug))+'</p>'+
     btn("複製訊息回傳網址","copy-own-oa-webhook","outline")
     :'<p class="small">僅企業管理者可設定自己的 LINE OA。</p>'))+
  (isManager?box("排隊怪獸店家搜尋",t.onboarding_complete===false?
 '<p>填寫店名、電話、地址與分類並儲存後，門市會自動公開在排隊怪獸的搜尋清單。</p>':
 '<p>你可以決定門市是否顯示在排隊怪獸的公開搜尋清單。</p>'+
    '<label class="checklist"><input id="directory-enabled" type="checkbox" '+(t.directory_enabled?'checked ':'')+'>允許在排隊怪獸平台公開搜尋我的門市</label>'+
    '<p class="small">新門市預設勾選公開；若取消勾選，仍可透過專屬預約網址使用服務。</p>'+
    '<p class="small">通知將依本店已連接的 LINE 官方帳號設定提供。</p>'+
    '<div style="margin-top:12px">'+btn("儲存公開設定","save-directory","primary")+'</div>'):"")+
  box("唯一顧客網址（同時支援電腦與手機）",'<div><a href="'+esc(customerUrl(routeState.slug)||sharedUiState.route("customer",routeState.slug))+'" target="_blank" rel="noopener">'+esc(customerUrl(routeState.slug)||new URL(sharedUiState.route("customer",routeState.slug),location.href).href)+'</a></div><p class="spacer"></p>'+btn("複製顧客連結","copy-customer","outline"));

return html;
}
