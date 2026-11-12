# Queue Monster｜排隊怪獸

完整專案由 `store-operations/` 更名為 `QueueMonster/`，包含網站、後端、資料庫遷移、測試與既有 Next.js 程式。

- [正式網站](https://hub-google.github.io/LINE/booking/)
- [網站程式與整合說明](./saas/README.md)
- [專案完整網址清單](./URLS.md)

> 依據 [PRD.md](./PRD.md) 規劃之企業級門市營運系統。

## Supabase 資料表命名規範（2026-11-12 已上線）

排隊怪獸的資料存於共用 Supabase 專案 `unapiwajmgqqtdkixaab`。**所有 QueueMonster 實體資料表一律以 `qm_` 開頭**（Queuing Monster）；新功能不得再新增 `so_` 實體表。

| 範圍 | 已套用命名 |
| --- | --- |
| 原 `public.so_*` 39 張 | `public.qm_*` |
| 原 `private.so_*` 3 張 | `private.qm_*` |
| 原有 `public.qm_admin_pin_guard` 1 張 | 保留 |
| **目前合計** | **43 張 `qm_` 實體表、0 張 `so_` 實體表** |

常用實體表：`qm_tenants`、`qm_members`、`qm_reservations`、`qm_tickets`、`qm_service_sessions`、`qm_schedule_rules`、`qm_schedule_exceptions`、`qm_pickup_orders`、`qm_menu_items`、`qm_line_links`。

**注意：既有 `so_*` RPC／資料庫函式名稱仍保留，供前端與 LINE 呼叫，相容 API 不等於舊資料表。** 新 SQL、直接查表的程式與 Edge Functions 一律使用 `qm_*`；同步檢查 Trigger、RLS、GRANT、Realtime 與測試。其他專案的 `wm_`／`ti_` 表不修改。歷史 Migration 的 `so_` 表名是當時結構，不可當作目前實體表名。

- [正式改名 Migration](./supabase/migrations/20261112073327_queue_monster_qm_table_prefix.sql)
- [完整命名規範](./supabase/TABLE-NAMING.md)
- [PRD 正式需求（DB-NAME-001）](./PRD.md)

**請勿對共用正式 Supabase 直接執行未核對的 Prisma `db:push`、舊版建表或初始化腳本。**

---

## 快速啟動 (Quick Start)

### 1. 安裝相依套件與生成 Prisma Client
```bash
npm install
npx prisma generate
```

### 2. 環境變數設定 (`.env`)
本專案已備妥完整說明與範例設定檔：
- `.env`：本地開發預設配置（預設啟用 `MOCK_LINE_SERVICES=true`，本機可直接測試所有流程）。
- `.env.example`：詳細列出所有 LINE 官方與金流權限申請步驟。

> 💡 **零摩擦上線**：只要您於 LINE Developers 與 LINE Pay 取得憑證，將 `.env` 中的各項 Key 填入並設定 `MOCK_LINE_SERVICES=false`，系統立即無縫對接 LINE 官方真實 API！

### 3. 資料庫遷移與寫入示範資料（以下指令僅適用獨立本機／測試資料庫，勿連正式共用 Supabase）
```bash
# 推送 Schema 至 PostgreSQL 資料庫 (需先設定 DATABASE_URL)
npm run db:push

# 寫入示範門市、菜單品項、營業時間與預約時段
npm run db:seed
```

### 4. 啟動開發伺服器
```bash
npm run dev
```
瀏覽器開啟：`http://localhost:3000`

---

## 核心功能與頁面入口

### 📱 消費者端 (Customer LIFF / Mobile UI)
- **`/c` (首頁)**：門市營業狀態、即時叫號快照、快捷導覽。
- **`/c/queue` (現場取號與看號)**：一鍵領取流水號、前方組數即時更新、預估等待時間。
- **`/c/reserve` (預約時段)**：分店預約日曆、時段容量防超賣即時鎖定。
- **`/c/order` (點餐與 LINE Pay)**：菜單選單、即時購物車、呼叫 LINE Pay Online API v4 支付。
- **`/c/my` (我的票夾與帳單)**：個人號碼牌進度、項目級 (Item-Level) 付款與待付款狀態明細。

### 💻 門市店員與管理端 (Staff & Admin Portal)
- **`/s` (叫號控制台)**：大按鈕觸控面板（叫下一位、再叫一次、開始服務、完成服務、過號）。
- **`/s/orders` (訂單細項與現場收款)**：即時檢視各項目未付款/已付款標籤、現場追加服務、現金收取與自動分配。
- **`/s/reservations` (預約報到核銷)**：客人到店一鍵報到 (Check-in)，系統自動產生號碼牌並合流至叫號佇列。
- **`/s/staff` (員工安全邀請)**：生成 48 小時一次性密碼學隨機 Token 與邀請連結，支援指定角色 (`STAFF` 或 `MANAGER`)。
- **`/s/invite/[token]` (邀請預覽與接受)**：受邀人員以 LINE 登入並接受加入，背景自動同步 Per-user Rich Menu。

---

## 關鍵架構文件 (Section 100 交付物)

- [`docs/architecture.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/architecture.md)：高階架構、領域邊界與多租戶資料流。
- [`docs/rbac-matrix.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/rbac-matrix.md)：角色與細粒度權限映射矩陣。
- [`docs/queue-state-machine.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/queue-state-machine.md)：號碼與服務順序解耦狀態機模型。
- [`docs/payment-state-machine.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/payment-state-machine.md)：項目級支付分配與 LINE Pay v4 簽章架構。
- [`docs/api-routes.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/api-routes.md)：完整 `/api/v1` RESTful 端點規格。
- **ADR 架構決策記錄**：
  - [`docs/adr/ADR-001-line-auth-strategy.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/adr/ADR-001-line-auth-strategy.md)
  - [`docs/adr/ADR-002-queue-ordering-strategy.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/adr/ADR-002-queue-ordering-strategy.md)
  - [`docs/adr/ADR-003-payment-idempotency-strategy.md`](file:///c:/Users/ET/%E6%88%91%E7%9A%84%E9%9B%B2%E7%AB%AF%E7%A1%AC%E7%A2%9F/%E4%BD%9C%E5%93%81/LINE%E7%BE%A4%E7%B5%84%E7%AE%A1%E7%90%86/docs/adr/ADR-003-payment-idempotency-strategy.md)
