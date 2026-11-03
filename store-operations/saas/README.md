# LINE 多企業預約、叫號 SaaS
實際網站：https://hub-google.github.io/LINE/saas/

## 三個入口
- 平台總後台：?view=platform
- 企業管理：?view=staff&merchant=greenfield-salon
- 顧客網頁：?view=customer&merchant=greenfield-salon
- 第二個租戶：?view=customer&merchant=demo-clinic（僅預約）

## 架構
- 前端：GitHub Pages，gh-pages 分支 saas/index.html（同版原始碼在 main/store-operations/saas/index.html）。
- 後端資料：現有 Supabase 專案 unapiwajmgqqtdkixaab。只使用 `so_` 前綴資料表與 RPC，不修改其他產品資料。
- 所有寫入經 Supabase Auth + SECURITY DEFINER RPC 驗證權限後執行。公開讀取資料經 `so_public_state` 過濾，顧客只能看到自己的預約與取號紀錄。
- 企業開通及設定：`so_create_tenant`、`so_update_tenant`。
- 員工邀請：`so_invite_staff`、`so_accept_invite`（需已驗證電子郵件）。
- 預約/取號/叫號：`so_book`、`so_cancel_booking`、`so_take_number`、`so_cancel_number`、`so_staff_action`。
- 平台首次啟用：`so_claim_platform_admin`，一次性開通碼儲存在 private schema SHA-256 雜湊，使用後自動刪除。
- PostgreSQL migration 已實際套用到 Supabase：`line_saas_multi_tenant_admin_customer`、`line_saas_one_time_platform_admin_bootstrap`。

## 驗收
- 真實資料庫已執行交易回滾測試：平台開通、新租戶、邀請員工、顧客預約、取號、店員叫號、分店管理查詢。
- 測試資料只使用暱稱，請勿輸入正式顧客個資。
- GitHub Pages 是靜態託管；資料由 Supabase 保存，絕不能將 service_role / secret key 存在前端程式碼中。
- 尚未實作 LINE OA OAuth / Messaging API、多店分店、支付、通知、正式客戶資料告知與隱私條款。
- 若 Supabase Auth 沒有啟用匿名登入，顧客入口將提示連線錯誤；需在 Auth Settings 啟用 Anonymous Sign-ins。

## 安全
- 平台管理權限不會因一般註冊而取得；需在首次啟用頁輸入私下提供的 64 碼一次性開通碼。
- `so_tenants` 的一般讀取僅限 active，敏感 `so_` 表格全啟用 RLS 且不授予匿名用戶直接寫入。
- 生產上線前須完成實機多裝置驗收與資料保護規範確認。

## LINE OA + LIFF 實際整合（2026-11-03）

- 已部署 Supabase Edge Function：`https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge`
- Webhook URL：`https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook`
- 使用 GitHub Actions Workflow：`.github/workflows/line-oa-deploy.yml`，**手動執行**後由 GitHub Secrets 安全同步至 Supabase Edge Functions Secrets。
- 顧客 LIFF 登入後，後端使用 LINE ID token verify API 驗證 LINE 身分，再以 `so_line_links` 連結現有 Supabase Auth 使用者與企業。
- 店員按「叫下一位」後由 Edge Function 驗證店員權限、當日叫號狀態，再呼叫 LINE Messaging API Push 通知。
- Webhook 在處理前先以原始 request body 驗證 LINE HMAC-SHA256 簽章，未設定 Secret 時回應 503，不接受偽造事件。
- **2026-11-03 實際憑證已部署並通過設定檢查**：`line-bridge?action=config` 回傳 `loginReady:true`、`messagingReady:true`；仍需真實手機完成身分驗證、加好友與通知接收測試。
- 需要在 GitHub Actions Secrets 設定以下值，**不能放在 README、公開 GitHub 原始碼或 gh-pages**：
  - `SUPABASE_ACCESS_TOKEN`（可部署此 Supabase 專案的個人存取權杖）
  - `LINE_MESSAGING_CHANNEL_ID`
  - `LINE_MESSAGING_CHANNEL_SECRET`
  - `LINE_MESSAGING_ACCESS_TOKEN`
  - `LINE_LOGIN_CHANNEL_ID`
  - `LINE_LOGIN_CHANNEL_SECRET`
  - `LINE_LIFF_ID`
- Secrets 設定完成後：GitHub Actions 手動執行 `LINE OA 憑證同步與後端部署`，檢查 `?action=config` 是否 ready，再於 LINE Developers 填入上述 Webhook URL 並驗證；最後從 LINE LIFF URL 實際取號與叫號測試。
- LIFF ID 與 Channel ID 本質屬公開識別碼，LIFF ID 會在用戶瀏覽器中曝光；真正的 Channel Secret、Access Token 必須只存在於後端 Secrets。
- LINE 官方帳號可能只會允許向好友或符合 Messaging API 條件的使用者發訊息，最終需用真實手機／LINE 好友關係驗收通知。
- 此程式目前以**單一示範 OA** 的後端 Secrets 綁定，不可直接當作多商家不同 OA 的完整自助綁定產品；多企業使用不同 OA 時，需加入商家級安全的 token 對應表與權限。
- 目前工作流程透過 Supabase 預設的 Service Role / Secret Key 在 Edge Function 執行受權限檢查的資料操作，憑證絕不傳到瀏覽器。

## 2026-11-03 LINE 通知／實測版本

- 正式 SaaS 網頁：https://hub-google.github.io/LINE/saas/
- 顧客取號：https://hub-google.github.io/LINE/saas/?view=customer&merchant=greenfield-salon&tab=queue
- 顧客預約：https://hub-google.github.io/LINE/saas/?view=customer&merchant=greenfield-salon&tab=reserve
- 店員入口：https://hub-google.github.io/LINE/saas/?view=staff&merchant=greenfield-salon
- LIFF URL：https://liff.line.me/2012346974-bmC3fZuf
- LINE Developers LIFF Endpoint URL 應設為顧客取號網址，並啟用 openid scope。
- Messaging API Webhook：https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook；verify_jwt=false 且需 LINE 原始 request body HMAC 驗證。
- GitHub Actions 在 Edge Function 或 Workflow 更新後自動部署，驗證 OA Messaging token、設定 webhook URL（若已有不同 URL 則避免覆寫）、測試 webhook。Use webhook 是否啟用須在 LINE Console 確認。
- LINE 通知已包含預約成功、取號成功、叫號通知。DB 核實本人或店員權限，並用 so_line_push_log 的事件唯一鍵避免重送；Messaging API token 不進前端。
- LINE API 接受發送不表示對方已送達或已讀。顧客須加入對應 OA 為好友且未封鎖。
- 實測前置：同一 Provider 的 LINE Login 和 Messaging API、LIFF openid scope、手機完成 LINE 綁定、已加 OA 好友；叫號需已驗證 Email 的正式店員或平台管理員登入。
- 尚未包含完全獨立於網頁的通知佇列與失敗重試、跨裝置顧客身分整併、多企業獨立 OA Token 自助管理。
