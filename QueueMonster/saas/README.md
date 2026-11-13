# Queue Monster｜排隊怪獸（原 LINE 預約）

> **2026-11-13 最新導覽與連結：** [公開網址／相容性盤點](PUBLIC-ROUTE-AUDIT-20261113.md)。平台「搜尋店家」為獨立 `directory.html`；平台「我的紀錄」為獨立 `my-records.html`（**跨所有店家**的預約／取號／訂餐紀錄同頁呈現）。**個別店家**的「歷史紀錄」仍在 `?view=customer&merchant=<slug>&tab=mine`，兩者不得混淆。舊 `directory.html?mode=mine` 及 `mode=last-board` 皆安全轉向新跨店頁，其他搜尋與服務連結保留。下方較早日期的操作規劃僅供歷史參考，以本節為準。

專案識別名稱：`QueueMonster`。正式英文品牌為 **Queue Monster**；完整專案已更名至 `QueueMonster/`，部署及測試路徑同步更新，公開網址與 LINE LIFF 維持相容。
實際網站：https://hub-google.github.io/LINE/booking/

## 三個入口
- 平台總後台：?view=platform
- 企業管理：?view=staff&merchant=greenfield-salon
- 顧客網頁：?view=customer&merchant=greenfield-salon
- 第二個租戶：?view=customer&merchant=demo-clinic（僅預約）

## 架構
- 前端：GitHub Pages，gh-pages 分支 booking/index.html（過渡期同步保留 saas/index.html；同版原始碼在 main/QueueMonster/saas/index.html）。
- 後端資料：共用 Supabase 專案 `unapiwajmgqqtdkixaab`；實體資料表統一 `qm_` 前綴，既有 `so_*` RPC 名稱維持相容，不修改其他產品資料。
- 所有寫入經 Supabase Auth + SECURITY DEFINER RPC 驗證權限後執行。公開讀取資料經 `so_public_state` 過濾，顧客只能看到自己的預約與取號紀錄。
- 企業開通及設定：`so_create_tenant`、`so_update_tenant`。
- 員工邀請：`so_invite_staff`、`so_accept_invite`（需已驗證電子郵件）。
- 預約/取號/叫號：`so_book`、`so_cancel_booking`、`so_take_number`、`so_cancel_number`、`so_staff_action`。
- 平台首次啟用：`so_claim_platform_admin`，一次性開通碼儲存在 private schema SHA-256 雜湊，使用後自動刪除。
- PostgreSQL migration 已實際套用到 Supabase：`line_saas_multi_tenant_admin_customer`、`line_saas_one_time_platform_admin_bootstrap`。

## 資料表與 RPC 命名規範（2026-11-12 已生效）

正式 Supabase `unapiwajmgqqtdkixaab` 的 QueueMonster **實體資料表全為 `qm_*`**（原 `public.so_*` 39 張、`private.so_*` 3 張已原地改名，另有原存 `qm_admin_pin_guard` 1 張，共 43 張；舊 `so_` 實體表 0 張）。原有資料、外鍵、Trigger、權限保留。

新 SQL、Supabase Client 直接查表、Edge Function、Realtime 表名與測試一律使用 `qm_*`，例如 `qm_tenants`、`qm_members`、`qm_reservations`、`qm_tickets`、`qm_service_sessions`、`qm_schedule_rules`、`qm_schedule_exceptions`、`qm_pickup_orders`、`qm_menu_items`、`qm_line_links`。**既有 `so_*` RPC／資料庫函式名稱保留相容**（例如 `so_public_state`、`so_staff_action`），不得混淆為實體表名。勿改動 Workforce `wm_`、標案 `ti_` 等其他產品表。

依據：[正式 Migration](../supabase/migrations/20261112073327_queue_monster_qm_table_prefix.sql)、[完整命名規範](../supabase/TABLE-NAMING.md)、[主 PRD（DB-NAME-001）](../PRD.md)。

## 驗收
- 真實資料庫已執行交易回滾測試：平台開通、新租戶、邀請員工、顧客預約、取號、店員叫號、分店管理查詢。
- 測試資料只使用暱稱，請勿輸入正式顧客個資。
- GitHub Pages 是靜態託管；資料由 Supabase 保存，絕不能將 service_role / secret key 存在前端程式碼中。
- 已完成單一示範 LINE OA 的 LIFF 身分連結與預約／取號／叫號推播。尚未完成每家企業獨立綁定 OA、多店分店、支付、正式客戶資料告知及隱私條款。
- 若 Supabase Auth 沒有啟用匿名登入，顧客入口將提示連線錯誤；需在 Auth Settings 啟用 Anonymous Sign-ins。

## 安全
- 平台管理權限不會因一般註冊而取得；需在首次啟用頁輸入私下提供的 64 碼一次性開通碼。
- `qm_tenants` 等實體表繼續遵守現有 RLS、GRANT 與 private schema 權限規則；改名不可放寬匿名存取。
- 生產上線前須完成實機多裝置驗收與資料保護規範確認。

## LINE OA + LIFF 實際整合（2026-11-03）

- 已部署 Supabase Edge Function：`https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge`
- Webhook URL：`https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook`
- 使用 GitHub Actions Workflow：`.github/workflows/line-oa-deploy.yml`，更新主分支 LINE Edge 程式或 Workflow 後自動執行，也可手動觸發；由 GitHub Secrets 安全同步至 Supabase Edge Functions Secrets。
- 顧客 LIFF 登入後，後端使用 LINE ID token verify API 驗證 LINE 身分，再以 `qm_line_links` 連結現有 Supabase Auth 使用者與企業。
- 店員按「叫下一位」後由 Edge Function 驗證店員權限、當日叫號狀態，再呼叫 LINE Messaging API Push 通知。
- Webhook 在處理前驗證原始 request body 的 LINE HMAC-SHA256 簽章；follow/unfollow 透過僅 service_role 可呼叫的資料庫 RPC 原子化去重，以 webhookEventId 防重送、事件時間防亂序。未設定 Secret 回應 503；偽造簽章回應 401。
- **2026-11-03 實際憑證已部署並通過設定檢查**：`line-bridge?action=config` 回傳 `loginReady:true`、`messagingReady:true`；仍需真實手機完成身分驗證、加好友與通知接收測試。
- 需要在 GitHub Actions Secrets 設定以下值，**不能放在 README、公開 GitHub 原始碼或 gh-pages**：
  - `SUPABASE_ACCESS_TOKEN`（可部署此 Supabase 專案的個人存取權杖）
  - `LINE_MESSAGING_CHANNEL_ID`
  - `LINE_MESSAGING_CHANNEL_SECRET`
  - `LINE_MESSAGING_ACCESS_TOKEN`
  - `LINE_LOGIN_CHANNEL_ID`
  - `LINE_LOGIN_CHANNEL_SECRET`
  - `LINE_LIFF_ID`
- Secrets 設定完成後：GitHub Actions 自動部署並檢查 `?action=config`、LINE Messaging token、Webhook URL 與啟用狀態，及合法／偽造 Webhook 簽章；最後仍須用手機 LINE 好友帳號完成預約、取號及叫號通知實測。
- LIFF ID 與 Channel ID 本質屬公開識別碼，LIFF ID 會在用戶瀏覽器中曝光；真正的 Channel Secret、Access Token 必須只存在於後端 Secrets。
- LINE 官方帳號可能只會允許向好友或符合 Messaging API 條件的使用者發訊息，最終需用真實手機／LINE 好友關係驗收通知。
- 此程式目前以**單一示範 OA** 的後端 Secrets 綁定，不可直接當作多商家不同 OA 的完整自助綁定產品；多企業使用不同 OA 時，需加入商家級安全的 token 對應表與權限。
- 目前工作流程透過 Supabase 預設的 Service Role / Secret Key 在 Edge Function 執行受權限檢查的資料操作，憑證絕不傳到瀏覽器。

## 2026-11-03 LINE 通知／實測版本

- 正式 SaaS 網頁：https://hub-google.github.io/LINE/booking/
- 顧客取號：https://hub-google.github.io/LINE/booking/?view=customer&merchant=greenfield-salon&tab=queue
- 顧客預約：https://hub-google.github.io/LINE/booking/?view=customer&merchant=greenfield-salon&tab=reserve
- 店員入口：https://hub-google.github.io/LINE/booking/?view=staff&merchant=greenfield-salon
- LIFF URL：https://liff.line.me/2012346974-bmC3fZuf
- LINE Developers LIFF Endpoint URL 應設為顧客取號網址，並啟用 openid scope。
- Messaging API Webhook：https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook；verify_jwt=false 且需 LINE 原始 request body HMAC 驗證。
- GitHub Actions 在 Edge Function 或 Workflow 更新後自動部署，驗證 OA Messaging token、設定 webhook URL（若已有不同 URL 則避免覆寫）、測試 webhook 及合法／偽造簽章；2026-11-03 實際 Actions log 已確認 LINE webhook enabled、HTTP 200、偽造簽章 401。
- LINE 通知已包含預約成功、取號成功、叫號通知。DB 核實本人或店員權限，並用 qm_line_push_log 的事件唯一鍵避免重送；Messaging API token 不進前端。
- LINE API 接受發送不表示對方已送達或已讀。顧客須加入對應 OA 為好友且未封鎖。
- 實測前置：同一 Provider 的 LINE Login 和 Messaging API、LIFF openid scope、手機完成 LINE 綁定、已加 OA 好友；叫號需已驗證 Email 的正式店員或平台管理員登入。
- Webhook 已支援 follow/unfollow 防重送且拒收已知取消好友者的推播。通知目前由前端完成預約／取號／叫號資料庫 RPC 後呼叫 Edge Function，尚未包含完全獨立於網頁的通知佇列與失敗重試、跨裝置顧客身分整併、多企業獨立 OA Token 自助管理。
- CI 的 LIFF 設定自動讀取與修正需要額外的 `LINE_LOGIN_CHANNEL_SECRET` GitHub Secret；2026-11-03 13:30（台灣時間）檢查時該值尚未設定，故此項僅警告、不阻擋部署。當日已有一筆成功的 LINE 身分連結紀錄，不能僅憑此警告斷言 LIFF 身分功能失敗。
- 實機測試尚未驗證 LINE 推播已送達；需先加示範 OA 好友且未封鎖。資料庫目前平台管理員與店員權限皆為零，沒有授權帳號之前不能測試店員叫號；勿為驗收隨意授權匿名用戶。

## 真實資料庫／LINE 端到端測試規範（2026-11-03）

- **已撤除** `demo / demo12345` 與 `?demo=1` 的本機模擬後台，正式網址只操作真正 Supabase。不要重建 localStorage 虛擬取號、虛擬員工或虛擬總公司資料，也不能把模擬按鈕點擊當作驗收。
- 顧客用 LINE LIFF 授權，前端由 Supabase 匿名認證建立內部識別（無需顧客填寫帳密），Edge Function 驗證 LINE ID Token、取得 LINE 暱稱並寫入 `qm_line_links`。後端 `so_book` 和 `so_take_number` 以資料庫已驗證的顯示名稱為準，忽略不可信的前端暱稱。
- 顧客預約／取號 RPC 寫入 `qm_reservations`／`qm_tickets`。真實店員以授權 Email 登入，從 `so_staff_state` 讀取同一套資料，按叫號時 `so_staff_action` 更新資料庫，`line-bridge` 根據資料庫真實的剛叫號票券使用 LINE Messaging API 發送通知。預約／取號成功也會觸發相應的 LINE 推播。
- 總公司總覽透過 `so_platform_overview` 即時顯示各企業今日預約、候位、現在叫號、已完成及員工數；平台管理權限必須由 `qm_platform_admins` 授予。員工管理使用真正的 `qm_members` 和 `qm_invites`。
- **管理權限未自動開通**：2026-11-03 查詢時 `qm_platform_admins` 和 `qm_members` 都是 0 筆。第一位平台管理員必須先以真實已驗證 Email 建立帳號，使用既有的一次性開通碼啟用，或由專案管理者確認 Email 後在資料庫授權；不可開放公共 demo 密碼直接獲得管理員權限。
- `line-bridge?action=config` 顯示登入及 Messaging API 憑證已配置，只代表設定就緒，**不等於**真實使用者已收到通知；還需本人在 LINE 授權、加官方帳號為好友，並驗證預約成功、取號成功和店員叫號的實際推播。
- LINE Channel Secret、Messaging Access Token、Supabase service_role 等秘密資料只放後端環境／GitHub Actions Secrets，禁止提交公開原始碼。

## 真實 Supabase 一鍵測試登入
- 總公司與門市店員入口皆提供一鍵登入；輸入欄位僅為自動配置的測試身分說明，沒有公開固定管理員密碼。
- 登入會在 Supabase Auth 建立真正的匿名使用者，呼叫 `so_test_login` 開通每個瀏覽器專屬的 QA 企業及真實 `qm_members` 管理權限。
- 總公司測試帳號只可操作自己建立的 QA 企業，不能讀取或修改其他正式企業。總公司列表、員工管理、預約、取號、叫號均直接讀寫 Supabase。
- 店員頁面可複製專屬 LINE 顧客網址，需使用真實 LINE 帳號授權、加好友並取號，再驗證 Messaging API 推播。
- 測試帳號保存在該瀏覽器的 Supabase Auth 工作階段，清除瀏覽器資料或登出後可能需要重新建立新測試企業。


## 2026-11-05 通用服務單位：同一網站支援多服務隊列

本功能只在商家手動啟用後使用，不另外建立醫院／餐廳／櫃台專版。一般店家的預約、取號與叫號流程完全保留。

開啟方式：
1. 以授權店家管理員開啟 [店員後台](https://hub-google.github.io/LINE/booking/?view=staff) →「企業設定」。
2. 在「服務單位與場次」勾選「啟用多服務單位」；需要科別或服務分類再勾選「顯示服務分類」。
3. 若預約報到後需要接入叫號，勾選「預約報到後加入該場次叫號」；必須先有預約與叫號模組。
4. 在**同一個管理位置**新增服務單位（可為醫師、櫃檯、服務組別、區域），設定分類及排序；再指定日期、場次時間與可預約名額。啟用後原「菜單及服務」不再提供第二套資源新增 UI。
5. 顧客使用既有商家網址選單位、場次，預約或現場取號。店員從原「預約管理」篩選單位、在原「叫號管理」切換場次。
6. [公開看板](https://hub-google.github.io/LINE/booking/board.html) 使用原本 `?merchant=<商家代碼>`；同商家有多場次時同頁分卡顯示，也可加 `&session=<場次 UUID>` 僅顯示單一隊列。

資料庫使用 `qm_booking_resources`、`qm_service_sessions`、`qm_reservations`、`qm_tickets`，登入與 LINE OA 使用既有架構。專案 SQL 遷移已套用至原 Supabase，不需另接新資料庫。

**部署與測試說明：** 網站、資料庫及 Edge Function 已更新；已驗證 SQL 交易中雙隊列可同時報到及叫號、重複報到不會重發票券，測試使用回滾交易而未保留假病患資料。真實 LINE 手機收件、付款與各醫院既有 HIS 串接仍須個別驗收。

## 前端分檔

主要應用已改為 `app/` 原生 ES 模組，事件與後台分頁分別放在 `actions/`、`staff/`，領域狀態放在 `state/`。頁面 CSS／JS 放在 `assets/`，正式建置會壓縮並產生內容雜湊檔名。來源結構、初始化順序及驗收指令見 [app/README.md](app/README.md)。
