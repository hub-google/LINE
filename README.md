# LINE — 五個獨立產品

這個 repository 不是單一產品，而是五個面向不同客群、可獨立部署與銷售的 LINE 相關產品。其中原「LINE 預約」產品的正式名稱為 **Queue Monster（排隊怪獸）**，專案識別名稱為 [**`QueueMonster`**](./QueueMonster/)。

| 目錄 | 產品 | 主要客群 | 技術 |
|---|---|---|---|
| `group-cleanup/` | LINE 群組清理工具 | 一般 LINE 重度使用者 | Python / Windows UI Automation / LINE Bot |
| `recurring-billing/` | LINE 定期收款對帳小幫手 | 社團、團購、家長群、固定分攤團體 | Next.js / LIFF / Messaging API / PostgreSQL |
| `store-operations/` | LINE OA 門市營運系統 | 餐飲、美容、診所、維修等門市 | Next.js / Prisma / LINE OA / LINE Pay |
| [`store-operations/saas/`](./store-operations/saas) | **Queue Monster（排隊怪獸）** — 原 LINE 預約 | 需要預約、取號、叫號的店家與顧客 | GitHub Pages / LINE LIFF / Supabase |
| `workforce-management/` | [LINE Workforce 人資管理 Demo](https://hub-google.github.io/LINE/workforce/) | 中小企業、連鎖門市、輪班與兼職團隊 | GitHub Pages + Supabase PostgreSQL（部分功能已上線測試） |

各產品維持獨立的資料模型、部署與商業模式，不要求同一使用者同時使用。Queue Monster 目前仍沿用 `store-operations/saas/` 原始碼目錄與 `/LINE/booking/` 網址，以避免破壞既有部署、LINE LIFF 回呼與外部連結。

## 完成標準

本 repo 的「完成」分成兩層：

1. **程式碼完成**：需求書中的流程已實作、可建置、測試可執行、沒有預設樣板頁或明顯 TODO stub。
2. **正式上線完成**：仍需使用者自行提供 LINE Developers / LINE OA / LINE Pay / DB 等正式憑證與商家資格，並完成實機驗收。第三方憑證不會提交到 Git。

既有可執行產品沿用現行 GitHub Actions 驗證；`workforce-management/` 已有獨立 GitHub Actions 部署腳本，並執行前端語法檢查；完整 PRD 尚未全部完成。

## 產品入口

- [Queue Monster（排隊怪獸，原 LINE 預約）](./QueueMonster/)
- [group-cleanup](./group-cleanup)
- [recurring-billing](./recurring-billing)
- [store-operations](./store-operations)
- [workforce-management（員工排班／出勤／請假；PRD、Demo 與開發狀態）](./workforce-management)
