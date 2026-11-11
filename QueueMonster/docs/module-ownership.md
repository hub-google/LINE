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
