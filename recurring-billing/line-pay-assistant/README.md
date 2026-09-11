# LINE 定期收款對帳小幫手

這是一個以 LINE OA + LIFF 為入口的固定收費提醒與人工對帳工具。

## 產品邊界

本產品**不代收款、不保管資金，也不自動從付款人帳戶扣款**。發起人提供自己的 LINE Pay／其他轉帳連結，付款人在第三方支付服務完成轉帳後回到本系統回報，發起人再人工確認。

## 已實作

- LIFF idToken 後端驗證與自有 JWT。
- 建立固定收費專案（金額、每月繳款日、收款連結）。
- 專案成員加入。
- LINE Share Target Picker 分享邀請 Flex Message。
- 每月帳款紀錄。
- 「未繳 → 待確認 → 已完成」雙向確認流程 API。
- 每月前三日提醒，31 日遇短月會自動校正。
- Asia/Taipei 日期判斷。
- follow / unfollow Webhook 同步推播可用狀態。
- CRON_SECRET 保護排程端點。
- LINE Webhook signature 驗證。
- Prisma/PostgreSQL 唯一鍵避免同月份重複帳款。

## 啟動

1. 複製 `.env.example` 為 `.env.local` 並填入 LINE/DB 參數。
2. `npm ci`
3. `npm run db:push`
4. `npm run dev`
5. 將 LINE Developers 的 LIFF Endpoint URL 指到網站首頁，Messaging API Webhook 指到 `/api/webhook`。
6. 排程服務每日呼叫 `GET /api/cron/remind`，Header 帶 `Authorization: Bearer <CRON_SECRET>`。

正式部署前需自行建立 LINE OA、LIFF、PostgreSQL 與 HTTPS 網址；憑證不得提交至 Git。
