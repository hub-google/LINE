# 系統架構設計規格書 (Architecture Specification)

> 依據需求書版本：v1.0 (2026-09-03)  
> 核心標準：後端作為唯一可信狀態來源、多租戶隔離 (Multi-Tenant)、號碼與服務順序分離、項目級付款狀態。

---

## 1. 系統全域架構拓撲

```text
                                  ┌────────────────────────┐
                                  │      LINE Client       │
                                  │  (iOS / Android / PC)  │
                                  └───────────┬────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     │                                                 │
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │   Customer Rich Menu    │                       │  Per-user Staff Menu    │
        │   (Default OA Menu)     │                       │  (Linked via API)       │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  Customer LIFF Web App  │                       │   Staff / Admin Portal  │
        │  (/c/...)               │                       │   (/s/...)              │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     └────────────────────────┬────────────────────────┘
                                              │ HTTPS / JSON (Bearer Token / Idempotency-Key)
                                              ▼
                    ┌─────────────────────────────────────────────────────┐
                    │            Next.js Full-Stack Application           │
                    │                                                     │
                    │  ┌───────────────────────────────────────────────┐  │
                    │  │      Edge / Middleware & Auth Context         │  │
                    │  │  - Rate Limit  - CSRF / CORS  - LINE Verify   │  │
                    │  └───────────────────────┬───────────────────────┘  │
                    │                          │                          │
                    │  ┌───────────────────────▼───────────────────────┐  │
                    │  │          API Route Handlers (/api/v1)         │  │
                    │  │  - Auth  - Queue  - Reserve  - Order  - Pay   │  │
                    │  └───────────────────────┬───────────────────────┘  │
                    │                          │                          │
                    │  ┌───────────────────────▼───────────────────────┐  │
                    │  │              Domain Service Layer             │  │
                    │  │  - RBAC Guard          - Queue Engine         │  │
                    │  │  - Item Allocator      - Audit Logger         │  │
                    │  └───────────────────────┬───────────────────────┘  │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                     ┌─────────────────────────┼─────────────────────────┐
                     │                         │                         │
                     ▼                         ▼                         ▼
        ┌─────────────────────────┐ ┌────────────────────┐ ┌─────────────────────────┐
        │   PostgreSQL Database   │ │ LINE Messaging API │ │ LINE Pay Online API v4  │
        │   (Prisma ORM)          │ │ - Push Broadcast   │ │ - Request Payment       │
        │   - Tenant Isolation    │ │ - Per-user Menu    │ │ - Confirm Payment       │
        │   - ACID Transactions   │ │ - Webhook Signature│ │ - Server-to-Server HMAC │
        └─────────────────────────┘ └────────────────────┘ └─────────────────────────┘
```

---

## 2. 核心領域模型與邊界 (Domain Boundaries)

系統依據業務內聚性拆分為 10 個核心領域模組：

1. **Auth & Identity (身分認證)**：
   - 負責驗證來自 LIFF 的 LINE Access Token / ID Token。
   - 簽發高時效內部 Session Token (JWT)，拒絕任何客戶端自行傳入的 `userId`。
2. **Multi-Tenant (多租戶與分店)**：
   - `Merchant` (商家法人/品牌) -> `Branch` (實體門市)。
   - 所有資料查詢與操作必須綁定 Tenant 上下文，杜絕 IDOR 橫向越權。
3. **Member & RBAC (成員與權限)**：
   - 支援 `CUSTOMER`、`STAFF`、`MANAGER`、`OWNER`。
   - 嚴格採用安全密鑰邀請機制 (`StaffInvitation`)，拒絕公用登記。
4. **Queue Engine (叫號與排隊引擎)**：
   - 實現**「號碼與服務順序分離」**核心原則。
   - `ticket_number` 為永久展示號；候位順序由 `queue_positions` 與 `sort_key` 動態管理。
   - 具備過號 (`PASSED`)、過號回來 (`RETURNED`)、插單 (`insert-next`) 演算法。
5. **Reservation (時段預約)**：
   - 支援分店時段、人數與服務項目預約。
   - DB Row Lock 防超賣，到店 Check-in 自動轉入 Queue Engine 產生號碼牌。
6. **Catalog (目錄與品項)**：
   - 支援服務項目 (`service`)、餐飲 (`food`)、商品 (`product`) 與加購項目 (`addon`)。
   - 建立訂單時必須快照名稱與單價，防止後續改價污染歷史資料。
7. **Order & Item Allocation (訂單與項目級金流)**：
   - 訂單金額 = 所有項目合計。
   - 付款狀態精確至單一項目 (`order_items.payment_status`)。
   - 支援部分付款、現場追加品項與多次補付。
8. **Payment (支付網關整合)**：
   - LINE Pay Online API v4 伺服器簽署與冪等核銷。
   - 支援現場現金付款 (`CASH`) 與其他方式 (`CARD`)。
   - 每次成功交易產生對應的 `payment_allocations`。
9. **LINE Integration (平台整合)**：
   - Messaging API 即時通知 (叫號、接近到號、預約確認、付款成功)。
   - 防重發 `dedupe_key` 唯一性約束。
   - 角色異動時 Per-user Rich Menu 自動同步切換。
10. **Audit Log (不可篡改審計)**：
    - 針對人員升降職、過號調整、手動結帳、退款進行嚴格不可篡改記錄。

---

## 3. 多租戶資料隔離規範 (Tenant Isolation)

1. 所有業務實體 (Queues, Tickets, Orders, Reservations, Catalog) 均強制具備 `merchant_id`，多數具備 `branch_id`。
2. 後端在每筆 API 請求執行前，先從 Session 解析出使用者關聯的 `merchant_members` 與 `member_branch_scopes`。
3. 即使請求端試圖傳遞未授權之 `orderId` 或 `branchId`，查詢條件一律強制附加租戶過濾：
   ```sql
   WHERE id = :orderId AND merchant_id = :sessionMerchantId
   ```
   不符合者回傳 `403 Forbidden` 或 `404 Not Found`。
