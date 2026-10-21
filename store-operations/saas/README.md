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
