import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";

import {sharedUiState} from "../state/sharedUiState.js";

import {staffState} from "../state/staffState.js";
import {serviceUnitsState} from "../state/serviceUnitsState.js";

import {box,btn,esc,field,tag} from "../shared-ui.js";

import {merchantProfileFields,merchantOperatingFields} from "../merchant-brand.js";
import {unitSettingsPanel} from "../service-units.js";
import {renderStaffMenu} from "./menu.js";
import {renderPickupSettings,pickupState} from "../pickup-mode.js";
import {renderStaffBranches} from "./branches.js";
import {renderOaSettings} from "./oa-settings.js";
import {customerUrl} from "../line-session.js";

function serviceLink(kind,label,enabled){
 const url=["board","pickup-board"].includes(kind)
   ?new URL(sharedUiState.bookingPath+(kind==="board"?"board.html":"pickup-board.html")+"?merchant="+encodeURIComponent(routeState.slug),location.origin)
   :new URL(customerUrl(routeState.slug)||new URL(sharedUiState.route("customer",routeState.slug),location.href).href,location.href);
 if(!["board","pickup-board"].includes(kind))url.searchParams.set("tab",kind);
 const href=url.href;
 // For any OA-enabled service QR, open the correct LINE chat first:
 // merchant-owned OA when connected, otherwise the QueueMonster platform OA.
 // Customer presses Send to start; Reply API returns a shared LIFF entry.
 const basicId=String(lineState.lineConfig?.botBasicId||"");
 const verb={reserve:"開始預約",queue:"開始取號",order:"開始點餐"}[kind];
 const ownChat=verb&&/^@[a-z0-9_.-]{2,100}$/i.test(basicId)
   ?"https://line.me/R/oaMessage/"+encodeURIComponent(basicId)+"/?"+
     encodeURIComponent(verb+" "+routeState.slug):"";
 const qrHref=ownChat||href;
 return '<div class="inset" data-service-url-kind="'+kind+'" style="margin-top:12px">'+
   '<strong>'+label+'</strong>'+
   '<div data-service-url-active'+(enabled?'':' style="display:none"')+'>'+
     '<p style="overflow-wrap:anywhere"><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(href)+'</a></p>'+
     btn("複製"+label,"copy-service-link","outline",'data-url="'+esc(href)+'" data-service-kind="'+kind+'"')+
     btn("顯示 QR Code","show-service-qr","outline",'data-url="'+esc(qrHref)+'"')+
     (ownChat?'<p class="small">掃描 QR Code 會先開啟<strong>'+(lineState.lineConfig?.merchantOaConnected?"店家 LINE OA":"排隊怪獸官方 LINE OA")+'聊天室</strong>；顧客按傳送開始使用，再點回覆的排隊怪獸預約／取號／點餐連結。完成操作後會嘗試由客戶 LINE 自動發出確認請求；無法自動發送時可在個人紀錄手動按傳送。</p>'+
       '<p class="small"><a href="'+esc(ownChat)+'" target="_blank" rel="noopener noreferrer">開啟 LINE 服務入口</a></p>':"")+
   '</div>'+
   '<p class="muted" data-service-url-inactive'+(enabled?' style="display:none"':'')+'>未選擇此功能</p>'+
 '</div>';
}

export function renderStaffSettings({t,isManager,html,customersOnly=false}){
  const policy=staffState.staff.bookingPolicy||{};
  const selectedFlag=staffState.staffCustomerBook.find(x=>x.id===staffState.customerFlagSelected)||staffState.staffCustomerBook[0]||null;
  if(selectedFlag)staffState.customerFlagSelected=selectedFlag.id;
  const serviceModules=t.modules||{};
  const cards=[
["public",renderOaSettings({isManager})],
["catalog",box("顧客服務開放設定",
    '<p class="muted">店家可自行決定開放線上預約、現場取號與線上點餐；可單獨啟用或任意組合。關閉後顧客不再能建立新預約／新號碼，原有紀錄與已發出的號碼仍保留。</p>'+
    (isManager?
      '<div class="grid"><label class="checklist"><input id="set-service-reservation" type="checkbox" '+(serviceModules.reservation?'checked':'')+'> 開放線上預約</label>'+
      '<label class="checklist"><input id="set-service-queue" type="checkbox" '+(serviceModules.queue?'checked':'')+'> 開放現場取號</label>'+
       '<label class="checklist"><input id="set-service-pickup" type="checkbox" '+(pickupState.staff?.settings?.enabled?'checked':'')+'> 開放線上點餐</label></div>'+
      '<p class="small">三項服務獨立控制；全部關閉將暫停新預約、新取號與新訂單，既有紀錄保留。細部規則請在下方設定。</p>'+
      '<div class="staff-actionbar">'+btn("儲存服務開關","save-service-modes","primary")+'</div>':
      '<p class="small">目前：預約 '+(serviceModules.reservation?'已開放':'未開放')+'，現場取號 '+(serviceModules.queue?'已開放':'未開放')+'，線上點餐 '+(pickupState.staff?.settings?.enabled?'已開放':'未開放')+'。只有店家管理者可以修改。</p>'))],
["profile",box("店家基本資料",!isManager?'<p class="muted">只有管理者可以修改設定。</p>':
   merchantProfileFields("set",t)+
   '<div class="merchant-profile-actions">'+btn("儲存企業設定","update-settings","primary")+'</div>')],
["public",(isManager?box("顧客首頁文字與顯示設定",
    '<p class="small">以下僅影響顧客預約／取號首頁，不會更改店家名稱、搜尋資料或預約功能。留空的文字不會顯示；可直接關閉整個介紹區塊。</p>'+
    '<label class="checklist"><input id="homepage-show-intro" type="checkbox" '+(staffState.customerHomepageCopy?.show_intro===true?'checked':'')+'>顯示首頁介紹區塊</label>'+
    '<div class="grid"><div>'+field("首頁主標題","homepage-title",staffState.customerHomepageCopy?.title??t.name,"text",'maxlength="60" placeholder="例如：歡迎來到本店"')+'</div>'+
    '<div>'+field("上方小標籤（可留空）","homepage-label",staffState.customerHomepageCopy?.label??"","text",'maxlength="32" placeholder="不需要可留空"')+'</div></div>'+
    '<label for="homepage-subtitle">首頁說明文字（可留空）</label><textarea id="homepage-subtitle" class="field" rows="2" maxlength="180" placeholder="想給顧客看的簡短介紹">'+esc(staffState.customerHomepageCopy?.subtitle??t.description??"")+'</textarea>'+
    '<label class="checklist"><input id="homepage-show-label" type="checkbox" '+(staffState.customerHomepageCopy?.show_label?'checked':'')+'>顯示上方小標籤</label>'+
    '<div class="staff-actionbar">'+btn("儲存顧客首頁設定","save-customer-homepage","primary")+'</div>'):"")],
["catalog",(isManager?box("候位保留規則",
     '<p class="small">保留期間不會叫號；到期後下一次叫號時自動恢復。可設定回原順位或隊尾，原票券號碼不變。</p>'+
     '<div class="grid3"><div>'+field("每次保留分鐘數","hold-minutes",staffState.staff.queue_hold_policy?.hold_minutes??20,"number",'min="1" max="120"')+
     '</div><div>'+field("最多保留次數","hold-limit",staffState.staff.queue_hold_policy?.max_holds??2,"number",'min="0" max="10"')+
     '</div><div><label for="hold-return-mode">恢復後順位</label><select id="hold-return-mode" class="field">'+
     [["END","返回隊尾"],["ORIGINAL","返回原順位"]].map(([v,name])=>'<option value="'+v+'" '+((staffState.staff.queue_hold_policy?.return_mode||"END")===v?"selected":"")+'>'+name+'</option>').join("")+
     '</select></div></div><div class="staff-actionbar">'+btn("儲存候位保留規則","save-hold-policy","primary")+'</div>'):"")],
["catalog",(isManager?box("預約提前限制與休息時間",
      '<p class="small">設定預約最晚提前時間及中場休息。營業日期、場次及公休請到「營業排程」管理；既有預約不會自動取消。</p>'+
      '<p class="settings-guidance">每週公休、特殊日期及加開場次請統一至「營業排程」。既有公休資料保留；啟用每週排程後以新規則優先。</p>'+
      '<div class="staff-actionbar">'+btn("前往營業排程","settings-section","outline",'data-section="operations"')+'</div>'+
      '<div class="grid"><div>'+field("每日休息開始（可留空）","policy-break-start",policy.break_start||"","time")+
      field("最晚提前預約分鐘數","policy-notice",policy.min_notice_minutes??0,"number",'min="0" max="10080"')+'</div>'+
      '<div>'+field("每日休息結束（可留空）","policy-break-end",policy.break_end||"","time")+'</div></div>'+
      '<div style="margin-top:14px">'+btn("儲存預約營業規則","save-booking-policy","primary")+'</div>'):"")],
["catalog",(isManager?box("預約送出前二次確認",
    '<p class="small">預設開啟。顧客會先看到預約內容，再決定是否真正送出。</p>'+
    '<label class="checklist"><input id="policy-confirm-required" type="checkbox" '+(policy.require_confirmation!==false?"checked":"")+'>送出前顯示確認卡</label>'+
    '<div style="margin-top:14px">'+btn("儲存二次確認設定","save-booking-confirmation","primary")+'</div>'):"")],
["customers",(isManager?box("顧客簿、未到店紀錄與黑名單",
    '<p class="small">本店將已驗證的同一 LINE 身分之預約與訂餐資料合併計算；未驗證的同名或電話不會自動合併。黑名單可只記錄警示，也可選擇禁止新的預約。</p>'+
    (staffState.staffCustomerBook.length?
      '<div class="scroll"><table class="rows"><tr><th>顧客</th><th>歷史預約</th><th>有效訂單</th><th>訂餐金額</th><th>未到店</th><th>狀態</th></tr>'+
      staffState.staffCustomerBook.slice(0,40).map(x=>'<tr><td>'+esc(x.name||"LINE 顧客")+'</td><td><a class="customer-history-link" href="#customer-history" data-customer-history-id="'+esc(x.id)+'" aria-label="查看 '+esc(x.name||"LINE 顧客")+' 的所有歷史預約">'+esc(x.bookings)+' 筆</a></td><td>'+esc(x.orders||0)+'</td><td>NT$ '+esc(Number(x.order_amount||0).toLocaleString("zh-TW"))+'</td><td>'+esc(x.no_shows)+'</td><td>'+esc(x.block_new_bookings?"禁止新預約":x.blacklisted?"觀察名單":"正常")+'</td></tr>').join("")+'</table></div>'+
      '<label for="customer-flag-picker">選擇顧客</label><select id="customer-flag-picker" class="field">'+
        staffState.staffCustomerBook.map(x=>'<option value="'+esc(x.id)+'" '+(selectedFlag?.id===x.id?"selected":"")+'>'+esc(x.name||"LINE 顧客")+' · '+esc(x.bookings)+' 筆預約'+(Number(x.no_shows)>0?" · 未到 "+esc(x.no_shows)+" 次":"")+'</option>').join("")+'</select>'+
      field("顧客標籤（逗號分隔，最多 10 個）","customer-flag-tags",(selectedFlag?.tags||[]).join("、"))+
      '<label for="customer-flag-notes">服務備註（僅店家可看）</label><textarea class="field" id="customer-flag-notes" rows="3" maxlength="2000">'+esc(selectedFlag?.notes||"")+'</textarea>'+
      '<label class="checklist"><input id="customer-flag-blacklisted" type="checkbox" '+(selectedFlag?.blacklisted?"checked":"")+'>標記黑名單／未到店警示</label>'+
      '<label class="checklist"><input id="customer-flag-block" type="checkbox" '+(selectedFlag?.block_new_bookings?"checked":"")+'>禁止此顧客建立新的預約</label>'+
      '<div class="staff-actionbar">'+btn("儲存顧客標籤與限制","save-customer-flags","primary")+'</div>':
      '<p class="muted">本店目前沒有預約或訂餐顧客資料。</p>')):"")],
["public",(isManager?box("門市公告與照片",
    '<p class="small">公告最多可放 8 張照片，可直接選擇裝置內的圖片上傳，也可以貼公開 HTTPS 圖片網址。</p>'+
    (staffState.staffAnnouncements.length?staffState.staffAnnouncements.map(a=>
      '<div class="listline"><span><strong>'+esc(a.title)+'</strong>　'+tag(a.active?"公開":"未公開")+'</span>'+
      '<span>'+btn("編輯","announcement-edit","outline",'data-id="'+esc(a.id)+'"')+
      btn(a.active?"暫停公開":"重新公開","announcement-toggle","outline",'data-id="'+esc(a.id)+'" data-active="'+esc(a.active)+'"')+'</span></div>').join(""):'<p class="muted">目前沒有公告。</p>')+
    '<div style="margin-top:12px">'+field("公告標題","announcement-title",(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.title)||"")+
    '<label for="announcement-body">公告內容</label><textarea class="field" id="announcement-body" rows="4" maxlength="2000">'+esc(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.body||"")+'</textarea>'+
    '<label for="announcement-photo-files">從手機或電腦新增照片（最多 8 張，單張 2 MB）</label><input class="field" type="file" id="announcement-photo-files" accept="image/png,image/jpeg,image/webp" multiple aria-describedby="announcement-photo-hint">'+
    '<p class="small" id="announcement-photo-hint">可選 JPG、PNG、WebP，選取後按「儲存修改／發布公告」才會上傳。</p>'+
    '<p class="small">目前既有照片：'+(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.images||[]).length+' 張；新增後合計最多 8 張。</p>'+
    '<details><summary>進階：以照片網址管理既有照片</summary><label for="announcement-images">照片網址（一行一張，刪除網址即可移除照片）</label><textarea class="field" id="announcement-images" rows="4">'+esc((staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.images||[]).join("\n"))+'</textarea></details>'+
    '<label class="checklist"><input type="checkbox" id="announcement-active" '+(staffState.staffAnnouncements.find(a=>a.id===staffState.announcementEditId)?.active===false?"":"checked")+'>發布至顧客首頁</label>'+
    '<div class="staff-actionbar">'+btn(staffState.announcementEditId?"儲存修改":"發布公告","announcement-save","primary")+
       (staffState.announcementEditId?btn("取消編輯","announcement-edit-cancel","outline"):"")+'</div></div>'):"")],
["public",(isManager?box("排隊怪獸店家搜尋",t.onboarding_complete===false?
 '<p>填寫店名、電話、地址與分類並儲存後，門市會自動公開在排隊怪獸的搜尋清單。</p>':
 '<p>你可以決定門市是否顯示在排隊怪獸的公開搜尋清單。</p>'+
    '<label class="checklist"><input id="directory-enabled" type="checkbox" '+(t.directory_enabled?'checked ':'')+'>允許在排隊怪獸平台公開搜尋我的門市</label>'+
    '<p class="small">新門市預設勾選公開；若取消勾選，仍可透過專屬預約網址使用服務。</p>'+
    '<p class="small">通知將依本店已連接的 LINE 官方帳號設定提供。</p>'+
    '<div style="margin-top:12px">'+btn("儲存公開設定","save-directory","primary")+'</div>'):"")],
["public",box("顧客專屬網址（電腦與手機皆可使用）",'<p class="small">叫號看板網址固定顯示；抽號與預約網址依「營業與場次」的服務開關即時顯示，按下「儲存服務開關」後正式生效。</p>'+serviceLink("board","叫號看板網址",true)+serviceLink("pickup-board","取餐進度看板網址",true)+serviceLink("queue","抽號網址",!!serviceModules.queue)+serviceLink("reserve","預約網址",!!serviceModules.reservation)+serviceLink("order","點餐網址",!!pickupState.staff?.settings?.enabled))]];
  // Customer records are daily operations, not merchant configuration.
  if(customersOnly){
    return html+'<div class="settings-hub-head"><h2>顧客管理</h2><p class="small">查看顧客紀錄、編輯標籤、備註與預約限制。</p></div>'+
      (isManager?cards.filter(([key])=>key==="customers").map(([,markup])=>markup).join(""):box("顧客管理","<p class=\"muted\">只有店家管理者可以查看及編輯顧客資料。</p>"));
  }
  // Preserve historical deep links while presenting only four visible categories.
  const aliases={sessions:"operations",units:"operations",pickup:"catalog",menu:"catalog",branches:"profile",customers:"profile"};
  const section=aliases[staffState.settingsSection]||staffState.settingsSection||"profile";
  staffState.settingsSection=section;
  const choices=[
    ["profile","店家資料"],["operations","營業排程"],
    ["catalog","服務設定"],["public","顧客通路"]
  ];
  const tabs='<nav class="settings-hub-tabs" aria-label="設定分類">'+choices.map(([key,label])=>
    btn(label,"settings-section",section===key?"primary":"outline",'data-section="'+key+'" aria-current="'+(section===key?"page":"false")+'"')).join("")+'</nav>';
  const descriptions={
    profile:"修改店家基本資訊、品牌識別及分店資料。",
    operations:"管理每週營業時間、場次、特殊日期與服務窗口。",
    catalog:"設定預約、叫號、點餐規則，以及菜單與服務項目。",
    public:"設定顧客首頁、公開搜尋、分享入口與 LINE 通知。"
  };
  html+='<div class="settings-hub-head"><h2>設定</h2><p class="small">'+descriptions[section]+'</p></div>'+tabs;
  html+=cards.filter(([key])=>key===section).map(([,markup])=>markup).join("");
  if(section==="profile")html=renderStaffBranches({role:staffState.staff.role,html});
  if(section==="operations"){
    const tenant=staffState.staff?.tenant||{};
    if(!serviceUnitsState.scheduleConfig?.enabled){
      html+=box("預設營業時段",
        '<p class="small">未啟用每週自動排程時使用此處的基本時段。可在下方啟用智慧營業排程，統一管理每週公休、特殊日期與場次。</p>'+
        (isManager?merchantOperatingFields("legacy",tenant)+
          '<div class="staff-actionbar">'+btn("儲存預設營業時段","save-default-operating-hours","primary")+'</div>':
          '<p class="muted">僅店家管理者可以修改。</p>'));
    }
    html+=unitSettingsPanel(isManager);
  }
  if(section==="catalog"){
    html=renderStaffMenu({t,isManager,html});
    html+=renderPickupSettings(isManager);
  }
  return html;
}
