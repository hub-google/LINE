# 客戶 LINE OA 圖文選單串接流程（2026-10-22）

## 即可使用：圖文選單連結

現有 SaaS 網址採用 `https://hub-google.github.io/LINE/saas/?view=customer&merchant={slug}&tab={tab}`。前端已支援 `tab=reserve`（預約）、`tab=queue`（取號及叫號進度）、`tab=mine`（我的紀錄）。

範例企業 `greenfield-salon`：
- 預約：https://hub-google.github.io/LINE/saas/?view=customer&merchant=greenfield-salon&tab=reserve
- 取號：https://hub-google.github.io/LINE/saas/?view=customer&merchant=greenfield-salon&tab=queue
- 我的紀錄：https://hub-google.github.io/LINE/saas/?view=customer&merchant=greenfield-salon&tab=mine

客戶 LINE Official Account Manager（https://manager.line.biz/）→ 圖文選單 → 建立含三個點擊區的選單 → 對應的按鈕選「連結」 → 填上述 URL → 啟用/發布。首次接入不需要傳任何秘鑰，也不需要 LIFF。手機 LINE OA 聊天視窗才會顯示圖文選單（桌面版不顯示）。

注意：這是 LINE 內建瀏覽器開啟本系統，但仍為 Supabase 匿名訪客登入；跨裝置的 LINE 身分、以 LINE 帳號查詢自己所有紀錄、自動叫號推播都尚未完成，不能將此步驟宣稱為完整 LINE 身分串接。

## 下一階段：客戶專屬 LINE 登入 / LIFF / LINE MINI App + Messaging API

請客戶提供非機密資料：
1. OA 官方帳號 ID（@...）或好友連結，企業所屬 SaaS slug。
2. LINE Developers Provider 名稱（必須符合該客戶的 Provider 管理權歸屬）。
3. Messaging API Channel ID，及是否已啟用。
4. 同個 Provider 下的 LINE Login Channel ID、LIFF ID；或新建立 LINE MINI App 的 Channel ID。
5. 是否擁有 OA 和 Developer Channel 管理權限，以及選單顯示哪些開通功能。

機密資訊不得透過聊天室、前端公開頁面或 GitHub 提供：Messaging API Channel Secret、Access Token、LINE Login Secret。需後續建立已驗證管理者才有權限使用的安全後端憑證設定/綁定流程，以 Supabase Edge Functions、Vault 或等效伺服器端密鑰管理保存。不要將秘鑰寫入 `db-config.js` 或 GitHub Pages。

整合應採：
- 每家客戶的 OA 與 LINE Login / LIFF 或 LINE MINI App Channel 位於**同一 Provider**，否則 LINE User ID 無法互通。不同法人/客戶原則上不要共用 Provider。
- 顧客點 LIFF/MINI App URL，前端執行初始化，送 raw LINE ID token/access token 給 Edge Function，由服務端呼叫 LINE Verify API，使用已驗證的 provider-scoped user ID 綁定該租戶顧客帳號；不得相信瀏覽器傳來的裸 userId。
- 每家客戶的 Messaging API Channel Access Token/Secret 獨立保存；LINE webhook 服務端驗證 x-line-signature 後對應租戶，再做叫號／預約通知。
- 如果平台要自動建立客戶 OA 圖文選單，則在完成取得該 OA 管理授權及 Messaging API token 後，透過 Create rich menu、Upload image、Set default rich menu 完成。要注意透過 LINE OA Manager 建立的選單，無法被 Messaging API 直接讀取或編輯。
- 前端可共用同一個 GitHub Pages 網站，但每個租戶保留獨立 Provider/Channel 與資料庫隔離設定。

## 官方來源
- https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/
- https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/
- https://developers.line.biz/en/docs/liff/getting-started/
- https://developers.line.biz/en/docs/liff/using-user-profile/
- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/tips/2026/06/25/provider-design-basics/
- https://developers.line.biz/en/docs/liff/registering-liff-apps/

