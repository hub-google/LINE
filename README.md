# LINE — 三個獨立產品

這個 repository 不是單一產品，而是三個面向不同客群、可獨立部署與銷售的 LINE 相關產品。

| 目錄 | 產品 | 主要客群 | 技術 |
|---|---|---|---|
| `group-cleanup/` | LINE 群組清理工具 | 一般 LINE 重度使用者 | Python / Windows UI Automation / LINE Bot |
| `recurring-billing/` | LINE 定期收款對帳小幫手 | 社團、團購、家長群、固定分攤團體 | Next.js / LIFF / Messaging API / PostgreSQL |
| `store-operations/` | LINE OA 門市營運系統 | 餐飲、美容、診所、維修等門市 | Next.js / Prisma / LINE OA / LINE Pay |

三個產品維持獨立的資料模型、部署與商業模式，不共用 UI，也不要求同一使用者同時使用。

## 完成標準

本 repo 的「完成」分成兩層：

1. **程式碼完成**：需求書中的流程已實作、可建置、測試可執行、沒有預設樣板頁或明顯 TODO stub。
2. **正式上線完成**：仍需使用者自行提供 LINE Developers / LINE OA / LINE Pay / DB 等正式憑證與商家資格，並完成實機驗收。第三方憑證不會提交到 Git。

每次 push 到 `main` 都會由 GitHub Actions 同時驗證三個產品。

## 產品入口

- [group-cleanup](./group-cleanup)
- [recurring-billing](./recurring-billing)
- [store-operations](./store-operations)
