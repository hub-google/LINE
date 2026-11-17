# WF｜LINE MINI App 接入與驗收（2026-11-17）

WF 的 MINI App 是**原有 Workforce 網頁的第二個入口**，不是第二份程式或第二個資料庫。公開網站 `https://hub-google.github.io/LINE/workforce/` 保持可用；MINI App 入口是：

`https://hub-google.github.io/LINE/workforce/?mini=1`

**上線狀態**：前端、Edge Function 雙 Channel 驗證已實作；**尚未建立／配置新的 LINE MINI App Channel ID 和 LIFF ID，因此尚無可用的正式 LINE MINI App 連結**。不能用舊的 LINE Login LIFF ID 假裝 MINI App 已啟用。

## LINE Developers 必要設定（Channel 擁有者操作）

1. 進入 [LINE Developers](https://developers.line.biz/console/)；在 WF 原 LINE Login Channel 的 **同一 Provider** 下建立「LINE MINI App」Channel（服務地區：Taiwan）。同一 Provider 可以對應同一 LINE userId；若 Provider 不同，不可假設 userId 相同。
2. 在 MINI App Channel 內將 Endpoint URL 設為 `https://hub-google.github.io/LINE/workforce/?mini=1`，Size 使用 Full，Scopes 至少包含 `openid`；如需顯示 LINE 個人資料另開 `profile`。依 LINE Console 的 Developing / Review / Published 環境選定待測的 LIFF ID。
3. 在 Supabase 專案 `unapiwajmgqqtdkixaab` 的 **Edge Function Secrets** 中設定兩個**新**環境變數：
   - `LINE_MINI_APP_CHANNEL_ID`：MINI App Channel ID（純數字）。
   - `LINE_MINI_APP_LIFF_ID`：該 Channel 的完整 LIFF ID（例如 `1234567890-AbcdEfgh`，只是格式示意）。
   保留原有 `LINE_LOGIN_CHANNEL_ID`、`LINE_LIFF_ID`、`LINE_MESSAGING_ACCESS_TOKEN`，不可覆蓋或清空。
4. 保留既有部署 `wm-line` Edge Function（`verify_jwt=false` 是為了匿名讀取公開 Channel 設定；**所有寫入仍須 Supabase JWT、企業及在職員工驗證**）。
5. 從 LINE 的 MINI App Channel 測試連結打開，在同一頁面登入既有 WF 企業帳號，再進入「LINE 通知」點「以 LINE 驗證並綁定」。同意後，後端會向 LINE 驗證 ID Token 的 `aud`，與准許的 MINI Channel ID 完全一致才進行既有員工綁定。
6. 測試員工、主管、管理者各角色的首頁／排班／打卡／請假／簽核與登出，並分別測試 iOS、Android 的定位許可、拒絕和精度不足。MINI App **不免除定位授權**，也不表示 GPS 防造假已經實測通過。

## 設計與安全範圍

- 未設定 MINI Channel 時會明確顯示「尚未設定」，不會自動切回舊 LIFF、亂綁錯的 Channel 或使用假 LINE 身分。
- LINE 身分與 Supabase 企業帳號**不是同一種登入憑證**：LINE 身分本身不授予員工資料、租戶、薪資或核准權限。保留原本 Supabase Auth、wm_ RLS／RPC、企業與角色權限。
- 不能以 `liff.getProfile()`、`getDecodedIDToken()` 或客戶端 userId 直接授權。後端向 LINE 驗證 ID Token 後，才將身分綁定至目前登入的在職員工。
- 未認證（Unverified）MINI App 不保證具有免費服務訊息功能；現有 `wm-line` 通知仍為原本平台 OA 發送，不在本次改動中改成免費 MINI Service Messages。
- 網頁外部瀏覽器仍允許使用原本電子郵件登入，未在 LINE 登入時可透過 `https://liff.line.me/<LIFF_ID>` 導回 MINI App。
- 手機定位仍由瀏覽器／LINE WebView 要求權限；不新增背景定位或保證 GPS 公尺級精度。

## 開發者檢查

```bash
node --check workforce-management/app.js
node --test workforce-management/tests/workforce-prd.test.mjs
node --test workforce-management/tests/workforce-button-clicks.test.mjs
node --test workforce-management/tests/workforce-mini-app.test.mjs
```

**外部依賴**：LINE Channel 建立、Channel ID／LIFF ID 的 Secret 設置、LINE 手機實機驗證和（如需認證）LINE 送審皆不能只靠推送 GitHub 程式碼完成。

官方文件：[將網站接入 MINI App](https://developers.line.biz/en/docs/line-mini-app/develop/web-to-mini-app/)｜[台灣 MINI App 建立](https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/)
