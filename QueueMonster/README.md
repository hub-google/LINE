# 排隊怪獸｜Queue Monster

**正式網站：** https://hub-google.github.io/LINE/booking/

排隊怪獸是以 LINE 為入口的多店家預約、取號與現場叫號平台。商家可使用平台 LINE OA，或自有 LINE OA 的 Messaging API 進行通知；服務包含店家公開搜尋、個別預約／取號網址、公開叫號看板、店員與管理者權限、菜單／服務與場次設定、顧客本人預約與候位紀錄。

> **2026-11-11 已確認的產品範圍：排隊怪獸不開發信用卡、LINE Pay、訂金、收款、退款、帳務對帳或其他金流功能。** 舊原型、PRD 與競品研究中出現的金流段落屬歷史草案，不是目前產品需求。不得據此宣稱已支援付款，亦不得自行建立付款資料表、收費介面、付款 API 或要求金流憑證。點餐／服務項目僅供預約選擇與營運，不含收款。

## 實際部署的程式

- **顧客入口**：[`/booking/`](https://hub-google.github.io/LINE/booking/) 與 [搜尋店家](https://hub-google.github.io/LINE/booking/directory.html)。
- **店家註冊／登入**：[`merchant-register.html`](https://hub-google.github.io/LINE/booking/merchant-register.html)，登入後使用店家後台設定與管理。
- **公開叫號看板**：`board.html?merchant=<店家代號>`，由每間店提供自己的網址。
- **操作說明**：[`merchant-center.html`](https://hub-google.github.io/LINE/booking/merchant-center.html)。
- **前端**：`QueueMonster/saas/`，GitHub Actions 以 versioned assets 發布到 GitHub Pages。
- **後端**：Supabase Postgres、RLS/RPC 與 `QueueMonster/supabase/functions/line-bridge/index.ts`；帳號權限與資料持久化不依賴靜態網頁。
- **回歸測試**：`QueueMonster/tests/`，主要 PR 驗證與正式站部署於 `.github/workflows/line-saas-*.yml`。

`QueueMonster/src/`、`prisma/` 與早期 `docs/` 留有未完整部署的 Next.js 原型。這些原型的 `/c/order`、`/s/orders`、LINE Pay、付款／帳單描述，**不是正式站已上線的功能，也不在這次開發範圍**。不要以 `npm run dev` 原型畫面或本地模擬模式推論 GitHub Pages 已實作的功能。

## 驗收與開發規則

1. 每次修改先查最新 `main` 及同時開發的 PR；使用獨立分支、PR、CI，不覆蓋其他視窗的修改。
2. 任何預約／取號／取消／權限變更都以 Supabase 交易、認證與跨店授權為準；匿名可用的公開看板不代表個人資料可公開。
3. 真實 LINE 收訊、兩個不同顧客／商家帳號的權限驗證、iOS/Android LIFF 與外部服務 OAuth，必須有實際測試證據才算完成。
4. 不清除既有正式與 QA 店家、顧客、預約、號碼及歷史資料。

詳細需求與最新決策見 [PRD.md](./PRD.md)；已完成與尚待驗收部分見 [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)；網址清單見 [URLS.md](./URLS.md)。
