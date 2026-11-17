// Shared, accessible explanations for merchant configuration fields.
// Keep explanatory copy here so every settings category uses the same interaction.
const FIELD_HELP = Object.freeze({
  "pickup-mode": "決定顧客能否指定取餐時間：只開放立即取餐、立即與預約都能選，或必須選擇預約時段。",
  "pickup-start": "顧客每天最早能選擇的取餐時間。例如 10:00，不能預訂當天 09:45 取餐。",
  "pickup-end": "顧客每天最晚能選擇的取餐時間。例如 20:00，之後不再提供當天取餐時段。",
  "pickup-interval": "設定取餐時間的選項間隔。例如 15 分鐘，顧客可選 10:00、10:15、10:30。不是每隔 15 分鐘才允許下一位顧客下單。",
  "pickup-capacity-basis": "決定每個取餐時段的容量是按「訂單筆數」還是「餐點總份數」計算。例如選餐點份數，一筆 3 份就占 3 份容量。",
  "pickup-capacity": "每個取餐時段的接單上限，單位依上一欄而定。例如按訂單筆數、上限 5，10:00 最多接受 5 筆訂單。",
  "pickup-notice": "顧客至少要提前幾分鐘下單。例如設定 20 分鐘，現在 10:00，就不能選 10:20 以前取餐；不代表下單後要等待這麼久才能操作。",
  "pickup-days": "顧客可以預訂未來幾天的取餐日期。例如設定 3 天，今天最多可預訂到 3 天後；0 代表僅能預訂今天。",
  "pickup-prep": "店家預估準備餐點所需的時間，作為顧客立即取餐的預估提示；實際完成時間仍以店家接單與製作進度為準。",
  "pickup-staff-view": "勾選後，一般員工也能在後台查看訂單與取餐日曆；不影響管理者權限。",
  "pickup-staff-update": "勾選後，一般員工可以變更訂單的接單、製作、待取等狀態；不影響管理者權限。",
  "set-service-reservation": "開放後顧客可以建立線上預約；關閉只阻止新的預約，既有紀錄仍保留。",
  "set-service-queue": "開放後顧客可以線上取號並查看排隊進度；關閉不會刪除既有號碼牌。",
  "set-service-pickup": "開放後顧客可透過本店網頁點餐；關閉後停止接收新訂單，舊訂單仍保留。",
  "homepage-show-intro": "控制顧客首頁是否顯示店家介紹區塊；不影響實際的預約、取號或點餐功能。",
  "homepage-title": "顧客進入本店服務首頁時看到的主要標題，例如「歡迎來到本店」。",
  "homepage-label": "首頁標題上方的小字標籤，例如「快速線上預約」；留空就不顯示文字。",
  "homepage-subtitle": "顧客首頁的簡短介紹，可以說明服務特色或注意事項；留空不顯示。",
  "homepage-show-label": "控制顧客首頁是否顯示上方小標籤；不會刪除已填好的文字。",
  "hold-minutes": "顧客每次申請暫時保留候位時，可保留多少分鐘。期間不會叫到該號碼。",
  "hold-limit": "同一張號碼牌最多能暫時保留幾次；設定 0 表示不能使用保留功能。",
  "hold-return-mode": "暫時保留結束後回到原本等待順位，或改排到隊伍最後面；號碼本身不變。",
  "policy-break-start": "設定每天暫停接受預約的休息開始時間；可留空表示不設定此段休息。",
  "policy-break-end": "設定每天休息結束、恢復可預約時段的時間；需搭配休息開始時間使用。",
  "policy-notice": "預約時間至少要比顧客送出預約的當下晚幾分鐘；例如 60 分鐘代表至少提前一小時預約。",
  "policy-confirm-required": "開啟後，顧客送出預約前會再看到一次預約內容確認，避免日期與時間填錯。",
  "customer-flag-picker": "先選擇要編輯的顧客，再修改此顧客專屬的標籤、備註或預約限制。",
  "customer-flag-tags": "替顧客建立方便店內管理的分類標籤，多個標籤可用逗號分隔。",
  "customer-flag-notes": "記錄店內服務備註，只供有權限的店員查看，顧客不會看到。",
  "customer-flag-blacklisted": "替這位顧客標記需要留意的警示，不等於自動禁止其預約；要禁止請使用下一項。",
  "customer-flag-block": "開啟後禁止這位顧客建立新的預約；歷史預約紀錄不會被刪除。",
  "announcement-title": "顧客首頁公告顯示的標題，例如「春節營業時間調整」。",
  "announcement-body": "公告的詳細內容，會隨公告顯示給顧客閱讀。",
  "announcement-photo-files": "選擇要放在公告中的照片，最多 8 張；選完仍須按儲存／發布才會上傳。",
  "announcement-images": "進階管理已存在的公告圖片網址；每行一張，移除網址就會從公告移除該圖。",
  "announcement-active": "開啟後公告會出現在顧客首頁；關閉後先保留內容但暫停公開。",
  "directory-enabled": "開啟後，符合公開條件的門市會出現在平台的店家搜尋；關閉仍可透過專屬網址進入。",
  "menu-book-mode": "控制線上預約時如何讓顧客選擇餐點或服務；不影響現場取號的選擇方式。",
  "menu-queue-mode": "控制現場取號時是否及如何讓顧客選擇服務項目；與線上預約獨立。",
  "menu-kind": "選擇新增項目的類型，例如餐點、服務或自行定義類別，方便分類管理。",
  "menu-custom-kind": "當類型選「自行輸入」時，填入店家自己的分類名稱，例如課程或活動。",
  "menu-name": "顧客會看到的餐點或服務名稱，例如「拿鐵咖啡」或「洗髮」。",
  "menu-price": "此項目的價格，沒有價格可留空；請依實際販售方式填寫。",
  "menu-description": "補充餐點內容、服務說明或顧客需要知道的注意事項。",
  "menu-order": "控制項目列表的顯示先後；數字越小越靠前。",
  "menu-active": "開啟後顧客可以選擇這個餐點或服務，關閉則暫時不提供選擇。",
  "resource-name": "預約會占用的實體資源名稱，例如醫師、座位或服務人員，用於避免同時段撞單。",
  "resource-kind": "將服務資源歸類，方便管理不同人員、空間或設備。",
  "rule-service": "選擇要設定預約時間規則的服務項目。",
  "rule-duration": "這項服務預計會占用多少分鐘，用於安排可預約時段。",
  "rule-buffer": "服務結束後預留多少分鐘整理、清潔或準備下一位顧客。",
  "rule-resource": "指定完成此項服務必須使用的資源，避免同一資源被重複預約。",
  "rule-show-duration": "開啟後，讓顧客在選擇服務時看到預估所需時間。",
  "group-name": "在多門市管理中顯示的總店或品牌名稱，方便統一識別。",
  "unit-admin-date": "查看或管理哪一天的服務場次。",
  "unit-admin-unit": "篩選要管理的服務窗口；留空可查看一般場次。",
  "unit-session-date": "指定這個營業場次適用的日期。",
  "unit-session-name": "這個場次對店員與顧客顯示的名稱，例如「上午場」。",
  "unit-session-start": "此場次開始接受預約或服務的時間。",
  "unit-session-end": "此場次停止提供預約或服務的時間。",
  "unit-session-capacity": "此場次最多可接受的人數，額滿後不再提供名額。",
  "unit-session-active": "開啟後場次才對顧客提供；關閉可暫停使用並保留設定。",
  "unit-name": "服務窗口的名稱，例如「小兒科 1 診」或「維修櫃台」。",
  "unit-group": "替服務窗口分類，例如門診科別或不同服務區。",
  "unit-order": "窗口在清單中的顯示順序，數字越小越靠前。",
  "unit-active": "控制此服務窗口是否可供顧客選擇；停用不會刪掉窗口資料。",
  "enable-units": "讓顧客在預約或取號時先選擇服務窗口，例如不同醫師或櫃台。",
  "group-units": "把服務窗口依分類分組顯示，方便顧客找到正確窗口。",
  "link-units": "顧客預約完成報到時，自動加入對應場次的叫號隊伍；不會在尚未報到前加入。",
  "schedule-enabled": "啟用後依每週規則與特殊日期決定營業場次；未啟用時使用預設營業時段。",
  "schedule-batch-plan": "先選擇已儲存的營業方案，再勾選要套用的星期，不必每天重複填寫。",
  "schedule-special-start": "指定特殊營業安排開始生效的日期，例如連假或裝修第一天。",
  "schedule-special-end": "指定特殊營業安排的最後一天；區間內會依此處設定覆蓋一般每週規則。",
  "schedule-special-count": "特殊日期每天提供幾個場次；設為 0 代表這段日期公休。",
  "schedule-special-note": "記錄這次特殊安排的原因，例如「設備保養」或「春節休息」。",
  "own-oa-token": "從店家自己的 LINE Developers Messaging API 取得長效 Channel access token，用來讓本店 LINE OA 發送訊息；請勿分享給顧客。",
  "own-oa-secret": "從店家自己的 LINE Developers Basic settings 取得 Channel secret，用來驗證此官方帳號；請妥善保管。"
});

const MERCHANT_FIELDS = Object.freeze({
  name: "店家在顧客網頁、搜尋結果與預約資料中顯示的名稱。",
  phone: "讓顧客聯繫本店的電話，建議填寫可接聽的門市號碼。",
  address: "店家地址，供顧客查看門市位置並確認前往的地點。",
  "logo-file": "上傳店家品牌 LOGO，讓顧客在服務頁面更容易辨認本店；選取後須儲存才生效。",
  "accent-picker": "設定店家網頁的品牌代表色，預約與取號介面會使用此色系。",
  "directory-category": "選擇店家所屬產業類別，幫助顧客在平台搜尋時找到本店。",
  description: "店家對外顯示的簡短介紹，說明主要服務與特色。",
  open: "預設每天開始營業的時間；啟用每週排程後，請以排程規則為準。",
  close: "預設每天結束營業的時間；啟用每週排程後，請以排程規則為準。",
  capacity: "每個預約時段最多可接受的人數，例如設 3 代表單一時段最多 3 人。",
  minutes: "可供預約的時間選項間隔，例如設定 30 分鐘，顧客可選 10:00、10:30、11:00；不是每 30 分鐘才能預約一筆。"
});

const LABEL_HELP = Object.freeze({
  "名額（人）": "此場次最多可提供多少人預約或取號；達上限後停止提供新名額。",
  "服務窗口（選填）": "可將場次分配給特定醫師、櫃台或其他服務窗口；留空使用一般場次。",
  "開始時間": "設定這個場次開始對顧客提供服務的時間。",
  "結束時間": "設定這個場次結束對顧客提供服務的時間。",
  "場次數": "指定這個營業方案一天有幾個場次；0 代表公休，最多 50 場。",
  "場次數（0 為公休）": "設定該星期幾一天開放幾個場次；0 代表這一天公休。",
  "每天場次數（0 為公休）": "設定特殊日期每天的場次數；0 代表整個日期區間公休。",
  "方案名稱": "為常用的營業時間組合命名，例如「平日兩場」；可套用到多個星期。",
  "場次名稱": "這個場次的顯示名稱，例如「上午場」或「晚間場」。",
  "Channel access token (long-lived)": "從本店 LINE Messaging API 取得的長效權杖，用於本店官方帳號訊息發送。請勿提供給他人。",
  "Channel secret": "LINE Messaging API 頻道的驗證密鑰，請妥善保管，不要貼到公開訊息。"
});

export function settingHelpFor(id, label = "") {
  if (Object.prototype.hasOwnProperty.call(FIELD_HELP, id)) return FIELD_HELP[id];
  const merchant = /^(?:set|create|legacy)-(.+)$/.exec(id);
  if (merchant && Object.prototype.hasOwnProperty.call(MERCHANT_FIELDS, merchant[1])) {
    return MERCHANT_FIELDS[merchant[1]];
  }
  if (/^schedule-plan-count-/.test(id)) return LABEL_HELP["場次數"];
  if (/^schedule-weekday-count-/.test(id)) return LABEL_HELP["場次數（0 為公休）"];
  if (/^schedule-plan-name-/.test(id)) return LABEL_HELP["方案名稱"];
  if (/^branch-slug-/.test(id)) return "貼上已有門市專屬網址中的代碼，將該門市加入同一個品牌管理。";
  const clean = String(label).replace(/\s+/g, " ").trim();
  if (/^週[一二三四五六日]$/.test(clean)) {
    return "勾選後，將所選營業方案套用到這一天；未勾選的星期不受影響。";
  }
  return LABEL_HELP[clean] || "";
}

let installed = false;
let popup = null;
let active = null;
let locked = false;

function closeHelp(force = false) {
  if (!force && locked) return;
  if (active) active.setAttribute("aria-expanded", "false");
  if (popup) popup.hidden = true;
  active = null;
  locked = false;
}

function showHelp(button, pin = false) {
  if (!button || !button.isConnected) return;
  if (active && active !== button) closeHelp(true);
  if (!popup) {
    popup = document.createElement("div");
    popup.className = "settings-help-popover";
    popup.setAttribute("role", "tooltip");
    popup.id = "settings-help-popover";
    popup.hidden = true;
    document.body.appendChild(popup);
  }
  popup.textContent = button.dataset.settingHelp || "";
  popup.hidden = false;
  button.setAttribute("aria-expanded", "true");
  active = button;
  locked = pin;
  const rect = button.getBoundingClientRect();
  const width = Math.min(320, Math.max(200, window.innerWidth - 24));
  popup.style.width = width + "px";
  popup.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + "px";
  const height = popup.getBoundingClientRect().height;
  const below = rect.bottom + 8;
  popup.style.top = (below + height <= window.innerHeight - 12
    ? below : Math.max(12, rect.top - height - 8)) + "px";
}

function helpButtonOf(target) {
  return target instanceof Element ? target.closest(".settings-help-button") : null;
}

function installHelpEvents() {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const button = helpButtonOf(event.target);
    if (button && !locked) showHelp(button);
  });
  document.addEventListener("pointerout", event => {
    const button = helpButtonOf(event.target);
    if (button && !button.contains(event.relatedTarget)) closeHelp();
  });
  document.addEventListener("focusin", event => {
    const button = helpButtonOf(event.target);
    if (button && !locked) showHelp(button);
  });
  document.addEventListener("focusout", event => {
    if (helpButtonOf(event.target)) closeHelp();
  });
  document.addEventListener("click", event => {
    const button = helpButtonOf(event.target);
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      if (active === button && locked) closeHelp(true);
      else showHelp(button, true);
    } else if (active && event.target !== popup && !popup?.contains(event.target)) {
      closeHelp(true);
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeHelp(true);
  });
  document.addEventListener("scroll", () => closeHelp(true), true);
  window.addEventListener("resize", () => closeHelp(true));
}

function helpControl(description, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-help-button";
  button.dataset.settingHelp = description;
  button.textContent = "?";
  button.setAttribute("aria-label", label + "：查看說明");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "settings-help-popover");
  return button;
}

/** Decorate the actual settings DOM after render. Never change the original input/label IDs. */
export function enhanceSettingsHints(root) {
  if (!root?.querySelector(".settings-hub-head")) return;
  installHelpEvents();
  closeHelp(true);
  for (const label of root.querySelectorAll(".settings-hub-head ~ .card label")) {
    if (label.closest(".settings-help-label-row")) continue;
    const input = label.querySelector("input,select,textarea");
    const id = label.getAttribute("for") || input?.id || "";
    const name = label.textContent.replace(/\s+/g, " ").trim();
    const explanation = settingHelpFor(id, name);
    if (!explanation) continue;
    const row = document.createElement("span");
    row.className = "settings-help-label-row" + (label.classList.contains("checklist") ? " settings-help-checkbox-row" : "");
    label.parentNode.insertBefore(row, label);
    row.appendChild(label);
    row.appendChild(helpControl(explanation, name));
  }
  // A few editable schedule names use aria-label instead of a visible label.
  for (const input of root.querySelectorAll(".settings-hub-head ~ .card input[aria-label]")) {
    if (input.closest(".settings-help-label-row") || input.nextElementSibling?.classList.contains("settings-help-button")) continue;
    const name = input.getAttribute("aria-label") || "";
    const help = settingHelpFor(input.id, name);
    if (help && (name === "方案名稱" || name === "場次名稱")) {
      input.insertAdjacentElement("afterend", helpControl(help, name));
    }
  }
}
