# 排隊怪獸｜功能單一實作與模組歸屬

更新：2026-11-11。目標：同一功能只維護一份核心邏輯；不同場次、帳號與顧客入口只使用設定、共用函式或後端策略差異，不再複製完整畫面。

## 正式網站（GitHub Pages + Supabase）

部署來源：`QueueMonster/saas/`，由 `.github/scripts/build-line-saas.mjs` 建置；發布的 `/booking/` 與相容網址 `/saas/` 為同版產物，不是兩套服務。

| 功能 | 唯一核心／共同實作 | 必要差異 |
|---|---|---|
| 店員叫號管理、紀錄、狀態選取、刪除恢復 | `saas/app/staff/queue.js`（`renderStaffQueue`） | 是否有多場次，只影響目前操作的隊列、叫號 RPC、看板 URL、舊式場次開關 |
| 店員狀態更新與復原 | `saas/app/actions/staff-queue-actions.js` 的 `ticketStatusRpc` 選擇器，`saas/app/form-events.js` 共用 | 一般票券及服務場次票券的後端 RPC 仍保留各自交易限制 |
| 店員清單分頁 | `saas/app/staff-list.js` | 清單 key 可包含選擇中的場次 ID，統一由 `isStaffListKey` 驗證 |
| 顧客預約姓名與聯絡電話欄位 | `saas/app/customer-booking.js` 的 `bookingContactFields` | 一般預約原有 80 字限制、場次預約原有 60 字限制及說明文字維持不變 |
| 預約防重送識別資料 | `saas/app/customer-booking.js` 的 `bookingRequestDetails` 與 `saas/app/data-loading.js` 的 `customerBookingRequestId` | 一般時段／服務場次選擇不同，寫入 RPC 不同 |
| 客戶預約及取號狀態呈現 | `saas/app/customer-records.js`、`saas/app/queue-progress.js` | 顧客只看本人紀錄；店員工作清單在其他模組，權限不同 |
| LINE 身分連結及通知 | `saas/app/line-session.js` | Reply／Push 的使用時機與對應事件不同，不能當成同一交易 |
| 登入錯誤訊息轉換 | `saas/app/auth-errors.js` | 店家註冊頁保留原有的弱密碼提示文字 |
| 商家品牌設定 | `saas/app/merchant-brand.js` | 商家註冊與商家後台是不同使用時機，但品牌資料走同一設定 |

## 必須保留的不同後端規則

- `so_staff_set_ticket_status` 與 `so_unit_set_ticket_status`：不同的隊列衝突及狀態驗證；由同一前端選擇器決定，不能直接刪掉其中一支造成既有功能失效。
- `so_book_with_contact_once` 與 `so_unit_book_once`：一般時段及服務場次有不同名額鎖定方式；共享聯絡資料與 idempotency payload，不擅自合併不同資料庫交易。
- `site-auth.js` 顯示網站頂部登入／登出；`app/line-session.js` 處理 LINE 身分與店家綁定、通知，職責不同。
- `supabase/migrations/` 下同名 `CREATE OR REPLACE FUNCTION` 是歷史遷移，不是多個線上實例；不要任意刪除歷史檔案。

## 非正式 Pages 執行路徑

`QueueMonster/src/`、`QueueMonster/prisma/` 是另一套 Next.js／Prisma 專案程式，不屬於目前 `/booking/` 的部署來源。其訂單、支付、API 等功能與現有 Supabase Pages 版本尚有落差；在未逐項對照、移轉及驗收前保留原碼，避免功能遺失。

## 未來開發規範

1. 新增服務窗口／場次時，擴充現有 `renderStaffQueue` 的隊列上下文，不另建立叫號管理畫面。
2. 新增預約形式時，重用 `bookingContactFields` 與 `bookingRequestDetails`，僅實作必要的名額選擇及資料庫交易差異。
3. 共用錯誤、分頁及狀態修正不得複製新的判斷程式。
4. 每次修改前檢查最新 `main`，提交採用預期 SHA／非強制更新，避免多視窗覆蓋。
5. 跑 `service-units-contract.test.mjs`、`merchant-onboarding-contract.test.mjs`、既有正式部署測試；沒有通過不得視為完成。


## 第二輪重複實作稽核（2026-11-11）

本輪從 GitHub `main` 的完整 `QueueMonster/` 目錄、正式 Pages 入口、GitHub Actions 與**正式 Supabase 的唯讀系統目錄**交叉確認。沒有對既有預約、取號及會員資料執行修改。

### 確認重複，已合併

| 項目 | 原問題 | 單一來源／保留方式 |
|---|---|---|
| Supabase 公開連線資訊 | 前端登入、店家註冊、平台登入、店家搜尋、叫號看板及 LINE 管理模組各自硬編碼同一個 URL/公開金鑰 | `saas/public-config.js`；六個入口共用，**不同登入 Session 仍保持隔離** |
| Demo 正式檔與 live 別名 | `demo/index.html`、`demo/live.html` 完全相同 | `demo/index.html` 唯一實作，live.html 僅保留相容轉址，含 query/hash |

### 有重複職責，但仍必須保留業務差異

| 優先 | 項目／實際程式 | 原因及後續方向 |
|---|---|---|
| P1 | `so_staff_action` 與 `so_unit_call` | 都處理叫號／重叫，但一般叫號對租戶鎖定、多場次依 session 隔離；應先以測試矩陣鎖定每個轉態，才能將共同交易狀態機抽到唯一核心 |
| P1 | `so_staff_set_ticket_status` 與 `so_unit_set_ticket_status` | 都寫入同一 `so_tickets`；保留不同場次與 HOLD 規則，避免以刪除一支 RPC 的方式合併 |
| P1 | `so_queue_session_state` 與 `so_service_sessions` | 前者是早／午／晚／休場開關，後者是可定日期、時段、服務窗口的場次；兩者業務概念不同，應統一表達與 API 契約，而非直接合併資料表 |
| P2 | `saas/app/line-session.js` 與 `saas/assets/directory/main.js` 的 customer URL 建構 | 兩者處理平台 OA／店家自有 OA、跨店 LIFF 的情況不同；應抽出純函式並保留原有 URL 結果 |
| P2 | `saas/assets/directory/main.js`、`saas/assets/board/main.js` 與品牌設定的 LOGO URL 檢查 | 同類型 URL 安全檢查但長度及路徑政策不同；需先補合法／非法 LOGO 案例比對，避免改變原有品牌顯示 |
| P2 | `so_queue_live`、`so_unit_progress`、`so_unit_public_board` 與一般叫號看板讀取程序 | 皆讀取 `so_tickets`，但授權範圍、場次篩選及顯示內容不同；可共用底層排序計算，不可直接互換顧客與公開 RPC |

### 非同一正式執行鏈，暫不刪除

- `QueueMonster/src/`、`QueueMonster/prisma/`：獨立的 Next.js／Prisma 原型，含點餐、付款等 Pages 版未正式整合的功能；目前 `/booking/` 是由 `QueueMonster/saas/` 建置，不應無驗收直接刪除另一套原型。
- `QueueMonster/demo/preview.html`：本地儲存的獨立模擬頁，並非正式 Supabase 客戶端；用途應明確標示，不得以它的測試當成正式後端驗收。
- `supabase/migrations/`：歷史 SQL 版本記錄不能以重複宣告為由刪除。
- `.github/workflows/line-saas-pages.yml` 是 Pages 發布；`line-oa-deploy.yml` 是 Edge Function／LINE 設定；`line-saas-pr-validation.yml` 是 PR 檢查；`queue-monster-mobile-qa.yml` 是截圖稽核，各自職責不同。

### 唯讀資料庫實測

2026-11-11 查詢正式專案 `unapiwajmgqqtdkixaab` 的 `pg_proc`：`public` 下的 `so_*/qm_*` 共 **118 支函式／118 個唯一名稱**，不存在同名多載及完全相同 `prosrc` 主體的函式組。這**不等於**沒有業務邏輯相似的程序，上面兩組叫號 RPC 即是未完成合併的具體案例。正式資料庫中未找到 `so_demo_*` RPC，不應把舊 Demo 的操作視為已連接正式系統。

本輪共用公開設定的發布 commit `037ec913` 已通過 Actions `42966906122`，並核對 `gh-pages/booking/release.json`。
