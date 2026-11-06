# LINE OA 預約／現場取號／叫號／點餐與服務／LINE Pay 整合系統需求書

> 文件狀態：Draft for Development  
> 文件版本：v1.0  
> 文件日期：2026-09-03  
> 主要語言：繁體中文  
> 目標讀者：產品經理、後端工程師、前端工程師、AI Coding Agent、QA、DevOps  
> 關鍵字：LINE Official Account、LIFF、LINE MINI App、Messaging API、Rich Menu、LINE Pay、Reservation、Queue、Order、RBAC

> **2026-11-04 LINE 多企業 SaaS 現行 PRD 增補（僅規劃、未開發）**：請先閱讀 [DoYouBook 競品對照、完整解法與驗收規格](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md)。本文件原為 2026-09-03 全方位門市架構需求書；涉及現在 SaaS 的預約/叫號分離、編號前綴與手動重置、LINE-first 登入、通知、商家 OA、預約產業模式與防衝突作業，以增補 PRD 最新決策為準。其他未衝突之既有安全、RBAC、金流與稽核要求繼續有效。
> **並行開發注意**：另有對話可能正在更新 GitHub。本次只新增/調整 Markdown 需求，未修改原始碼、資料庫、Secrets、Action、測試資料或部署；實作者須以最新 main/PR 比對需求 ID，避免覆蓋另一個對話工作。

---

# 0. 文件使用方式

本文件不是概念提案，而是可直接交付開發 Agent 執行的「系統需求書」。

開發 Agent 應遵守以下原則：

- `MUST`：必要需求，不得省略。
- `SHOULD`：強烈建議，若未實作需在 PR / 開發紀錄中說明原因。
- `MAY`：可選功能，可依階段實作。
- 若需求文字與程式現況衝突，應以本文件最新版本為準，除非另有 ADR（Architecture Decision Record）覆蓋。
- 不得自行將「權限控制」、「付款一致性」、「叫號歷史」、「Audit Log」等需求簡化為純前端邏輯。
- 所有涉及身份、金流、權限、訂單、叫號狀態變更的寫入操作，MUST 由後端最終判斷。
- 所有資料模型需預留多商家、多分店能力，即使第一版只有單一測試店家。

---

# 1. 產品目標

建立一套以 LINE Official Account 為主要入口的門市服務系統，讓消費者與店家人員盡可能不離開 LINE 即可完成以下行為：

## 1.1 消費者

1. 預約日期與時段。
2. 選擇服務、餐點或商品。
3. 現場掃 QR Code 或從 LINE OA 取號。
4. 查看目前叫號、前方等待人數及預估等待時間。
5. 接收「即將輪到」、「已叫號」、「過號」等 LINE 通知。
6. 查看自己的預約、號碼牌、訂單。
7. 以 LINE Pay 支付全部或部分項目。
8. 到店後追加商品／服務並再次付款。
9. 查詢哪些項目已付款、哪些仍待付款。
10. 取消允許取消的預約或號碼牌。

## 1.2 店家／管理員

1. 查看當日預約。
2. 查看現場排隊名單。
3. 執行「下一號」。
4. 跳過／過號。
5. 重新叫號。
6. 指定某一號為下一位。
7. 將過號客插入下一位，但不破壞正常流水號。
8. 手動調整等待順序。
9. 查看顧客已購買的服務／商品／餐點。
10. 查看 item-level 已付款／未付款狀態。
11. 現場追加項目。
12. 建立補付款。
13. 標記現金／其他付款方式。
14. 管理員工角色與權限。
15. 調整營業時間、預約容量、排隊設定、服務與品項。
16. 查閱重要營運操作紀錄。

---

# 2. 非目標

第一版不以完整 POS、ERP 或會計系統為目標。

以下功能不屬於 MVP 必做：

- 完整電子發票系統。
- 會計總帳。
- 庫存成本會計。
- 薪資與排班。
- CRM 自動化行銷。
- 點數會員制度。
- 複雜優惠券引擎。
- 多幣別。
- 跨境付款。

但資料模型 SHOULD 避免讓未來擴充上述功能時必須整體重寫。

---

# 3. 核心產品架構

## 3.1 高階架構

```text
LINE Official Account
        │
        ├── Default Rich Menu（一般使用者）
        │       ├── 預約
        │       ├── 現場取號
        │       ├── 點餐／服務
        │       └── 我的
        │
        ├── Per-user Rich Menu（Staff / Manager / Owner）
        │       ├── 叫號
        │       ├── 現場
        │       ├── 訂單
        │       └── 管理
        │
        ▼
LINE MINI App / LIFF Web App
        │
        ├── Customer UI
        └── Staff UI
        │
        ▼
Backend API
        │
        ├── Auth
        ├── Merchant / Branch
        ├── Reservation
        ├── Queue
        ├── Catalog
        ├── Order
        ├── Payment
        ├── Notification
        ├── RBAC
        └── Audit
        │
        ├──────── LINE Messaging API
        ├──────── LINE Pay Online API v4
        └──────── PostgreSQL
```

## 3.2 LINE OA 的角色

LINE OA MUST 被視為：

- 使用者入口。
- Rich Menu 容器。
- 通知管道。
- 身分關聯來源之一。

LINE OA MUST NOT 被視為：

- 真正的授權系統。
- 真正的訂單資料庫。
- 真正的排隊狀態來源。
- 真正的付款狀態來源。

---

# 4. 技術選型建議

以下為建議實作，可依團隊語言調整，但資料與安全需求不得改變。

## 4.1 建議 Stack

Frontend：

- Next.js / React
- TypeScript
- Tailwind CSS
- LIFF SDK
- PWA-style responsive layout

Backend：

- TypeScript
- NestJS / Fastify / Next.js API（若規模小）
- REST API 優先
- 可使用 WebSocket / SSE 做即時更新

Database：

- PostgreSQL

ORM：

- Prisma 或 Drizzle

Cache / Lock：

- Redis（正式多節點部署 SHOULD 使用）

Queue / async：

- MVP 可用 DB job table
- 正式環境 SHOULD 使用 Redis Queue / Cloud Tasks / BullMQ 等

Hosting：

- Vercel + Managed PostgreSQL / Cloud Run + Cloud SQL / Render / Railway 均可
- Production MUST HTTPS

---

# 5. LINE 平台整合

## 5.1 LINE MINI App / LIFF

MUST：

- 使用 LIFF SDK 驗證使用者 LINE 身分。
- 前端取得的 LINE profile 資訊不得作為後端授權唯一依據。
- 後端 MUST 驗證 LINE 身分憑證／token。
- 不得相信前端自行提交的 `lineUserId`。

推薦：

```text
Client
  ↓ LIFF login
取得 token
  ↓ Authorization Header
Backend
  ↓ server-side validation
解析可信 line_user_id
  ↓
users / merchant_members
```

## 5.2 Rich Menu

一般使用者使用 Default Rich Menu。

Staff / Manager / Owner 使用 Per-user Rich Menu。

MUST 支援以下同步：

```text
merchant_members role 變更
        ↓
Rich Menu Sync
        ↓
LINE Messaging API
```

重要：

> Rich Menu 是 UI，不是 Permission。

即使使用者取得管理頁 URL，只要沒有後端角色權限，也 MUST 取得 `403 Forbidden`。

## 5.3 Rich Menu 建議

### Customer Menu

```text
預約        現場取號
點餐/服務   我的
```

### Staff Menu

```text
叫號        現場
訂單        我的
```

### Manager Menu

```text
叫號        現場
訂單        設定
```

### Owner Menu

```text
現場營運    訂單
員工        店家設定
```

Rich Menu 內容 MAY 依產品驗證調整。

---

# 6. 多租戶模型

系統從 Day 1 MUST 支援 multi-tenant。

```text
Merchant
  └── Branch
       ├── Catalog
       ├── Staff
       ├── Reservation
       ├── Queue
       └── Order
```

## 6.1 Merchant

代表商家品牌／法人／帳號。

範例：

- XX 美髮
- YY 診所
- ZZ 牛肉麵

## 6.2 Branch

代表實體門市或服務地點。

每個 branch 可有不同：

- 地址。
- 營業時間。
- 預約規則。
- 叫號序列。
- 服務品項。
- LINE Pay 設定（若未來允許）。
- 人員。

所有營運資料 MUST 綁定 `merchant_id`，多數營運資料 SHOULD 同時綁定 `branch_id`。

---

# 7. 使用者角色與 RBAC

## 7.1 角色

至少支援：

### CUSTOMER

一般消費者。

### STAFF

基本營運人員。

允許：

- 查看當日 queue。
- 執行叫號。
- 查看訂單必要資訊。
- 新增現場追加項目。
- 執行店家允許的現場結帳。

不允許：

- 新增管理員。
- 修改 Owner。
- 變更關鍵付款設定。
- 刪除 Audit Log。

### MANAGER

除 Staff 權限外，可：

- 修改 queue。
- 管理預約。
- 管理 catalog。
- 查看較完整營運資訊。
- 管理 Staff。
- 視政策執行退款。

### OWNER

最高店家角色。

可：

- 管理 Manager / Staff。
- 店家設定。
- 分店設定。
- 付款設定。
- 權限設定。
- 查看所有 Audit Log。

## 7.2 Permission 建議

不要只 hard-code role。

至少建立：

```text
queue.read
queue.call
queue.reorder
queue.cancel

reservation.read
reservation.manage

order.read
order.create
order.edit
order.checkout

payment.read
payment.collect
payment.refund

catalog.read
catalog.manage

member.read
member.invite
member.manage

merchant.settings.read
merchant.settings.write

audit.read
```

Role → permissions 可先固定映射，後續可資料化。

---

# 8. 管理員身份與邀請流程

## 8.1 原則

MUST 使用邀請制。

MUST NOT 提供：

- 「自己申請成管理員」。
- 只輸入某個 LINE Display Name 就成為管理員。
- 前端自行宣告 role。
- 以 Rich Menu 是否顯示判斷權限。

## 8.2 Invite Flow

Owner / Manager：

1. 開啟員工管理。
2. 點「新增員工」。
3. 選擇角色。
4. 產生 invitation。
5. 系統生成一次性 token。
6. 可呈現 QR Code 與連結。
7. 被邀請者用 LINE 開啟。
8. LIFF 完成身份驗證。
9. 顯示：

```text
XX 店邀請你加入
角色：Staff

[接受]
[拒絕]
```

10. 接受後建立 `merchant_member`。
11. invitation 標記 used。
12. 背景同步 per-user Rich Menu。

## 8.3 Invitation Token

MUST：

- cryptographically random。
- 不得可猜測。
- 一次性。
- 有 expiry。
- 綁 merchant。
- 綁 branch scope（若有）。
- 綁 role。
- 使用後不可重用。
- 被撤銷後不可使用。

資料：

```text
staff_invitations
- id
- merchant_id
- branch_id nullable
- role
- token_hash
- expires_at
- status
- invited_by_user_id
- accepted_by_user_id nullable
- accepted_at nullable
- created_at
```

Token MUST 只儲存 hash，不儲存明文。

---

# 9. 使用者登入與身份驗證

## 9.1 User

```text
users
- id UUID
- line_user_id VARCHAR UNIQUE
- display_name nullable
- picture_url nullable
- created_at
- updated_at
- last_seen_at
```

`display_name` 僅為展示用途。

權限 MUST 依：

```text
authenticated line_user_id
  + merchant_members
```

而不是 display_name。

## 9.2 Session

後端 SHOULD 建立自己的短期 session。

推薦：

```text
LIFF token
  ↓ backend verify
Internal session/JWT
```

Session MUST：

- 有 expiry。
- 可撤銷。
- server-side 能取得 userId。
- 不接受 client 傳入 userId 覆蓋。

---

# 10. Merchant Member Schema

```text
merchant_members
- id UUID
- merchant_id UUID
- user_id UUID
- role ENUM(owner, manager, staff)
- status ENUM(active, suspended, revoked)
- created_by UUID
- created_at
- updated_at
```

Constraint：

```text
UNIQUE(merchant_id, user_id)
```

若 branch-level：

```text
member_branch_scopes
- member_id
- branch_id
```

沒有 branch scope 可解讀為 merchant 全分店權限。

---

# 11. 預約系統 Reservation

## 11.1 Reservation 功能

Customer：

- 選日期。
- 選時段。
- 選人數（餐飲類）。
- 選服務。
- 選指定人員（若開啟）。
- 備註。
- 預付／全付／現場付。
- 查看。
- 取消。

Staff：

- 查看。
- 新增。
- 修改。
- 取消。
- Check-in。
- No-show。

## 11.2 Reservation 狀態

```text
PENDING
CONFIRMED
CHECKED_IN
COMPLETED
CANCELLED_BY_CUSTOMER
CANCELLED_BY_MERCHANT
NO_SHOW
```

合法轉換 MUST 明確限制。

範例：

```text
PENDING -> CONFIRMED
CONFIRMED -> CHECKED_IN
CHECKED_IN -> COMPLETED

CONFIRMED -> CANCELLED_BY_CUSTOMER
CONFIRMED -> CANCELLED_BY_MERCHANT
CONFIRMED -> NO_SHOW
```

`COMPLETED` 不得回到 `CONFIRMED`，除非以管理修正事件處理並留下 audit。

## 11.3 Slot

```text
reservation_slots
- id
- branch_id
- service_id nullable
- staff_id nullable
- start_at
- end_at
- capacity
- booked_count
- status
```

防止超賣 MUST 使用：

- DB transaction。
- row lock 或 optimistic concurrency。
- 不可只靠 UI 顯示剩餘數。

---

# 12. Queue 現場取號

## 12.1 取號入口

支援：

1. LINE OA Rich Menu。
2. 店門口 QR Code。
3. Staff 代取號。
4. 預約與叫號為獨立模組。預約 Check-in **僅更新預約狀態，不會自動進入 Queue**；若客戶另有取號需求，須由顧客或授權店員在叫號模組獨立操作。

## 12.2 Queue Ticket

```text
queue_tickets
- id UUID
- merchant_id UUID
- branch_id UUID
- queue_id UUID
- user_id UUID nullable
- reservation_id UUID nullable
- order_id UUID nullable
- ticket_number INT
- display_number VARCHAR
- status
- joined_at
- called_at nullable
- service_started_at nullable
- completed_at nullable
- passed_at nullable
- cancelled_at nullable
- priority INT default 0
- notes nullable
```

## 12.3 Ticket 狀態

```text
WAITING
CALLED
SERVING
PASSED
RETURNED
COMPLETED
CANCELLED
NO_SHOW
```

---

# 13. 關鍵規則：號碼與服務順序分離

這是系統核心要求，MUST 遵守。

錯誤設計：

```text
current_number = 50
```

然後若 25 回來：

```text
current_number = 25
```

這會破壞流水號、等待順序、統計及通知。

正確設計：

- Ticket Number：顧客永久號碼。
- Queue Ordering：實際候位順序。
- Serving Ticket：目前服務對象。

例如：

```text
Tickets:
25 PASSED
50 SERVING
51 WAITING
52 WAITING
53 WAITING
```

管理者選擇「25 下一位」：

```text
Service sequence:
50 -> 25 -> 51 -> 52 -> 53
```

Ticket number 不變。

---

# 14. Queue Ordering

推薦使用明確的 Queue Entry / sequence model。

```text
queue_positions
- id
- queue_id
- ticket_id
- sort_key
- inserted_reason
- inserted_by
- created_at
```

或者：

```text
queue_tickets.queue_rank
```

但若頻繁 reorder，SHOULD 使用 fractional ranking / LexoRank 類似策略，避免每次重排大量 rows。

MVP 亦可使用 integer sequence + transaction。

---

# 15. 叫號操作

Staff UI MUST 提供：

- 下一位。
- 再叫一次。
- 開始服務。
- 完成。
- 過號。
- 取消。
- 指定下一位。
- 插入下一位。
- 手動調整順序。

## 15.1 「下一位」

後端：

1. 驗證 staff 權限。
2. lock branch queue。
3. 找下一個 eligible WAITING / RETURNED ticket。
4. 標記 `CALLED`。
5. 記錄 called_at。
6. 建立 queue_event。
7. 發通知。
8. 回傳最新 queue snapshot。

MUST idempotent-safe，避免 double click 連跳兩號。

建議 client 傳：

```http
Idempotency-Key: UUID
```

## 15.2 過號

`CALLED -> PASSED`

MUST 保存：

- 過號時間。
- 操作者。
- 原順位。
- event。

## 15.3 過號回來

`PASSED -> RETURNED`

預設不可自行破壞正常 queue。

店家設定：

```text
return_policy:
- APPEND_END
- INSERT_AFTER_N
- STAFF_DECIDES
```

MVP 建議：

`STAFF_DECIDES`

管理員可：

```text
[排到最後]
[下一位]
[插入第 N 位]
```

## 15.4 指定 25 號先服務

假設：

```text
Serving = 50
Waiting = 51,52,53
Passed = 25
```

操作：

```text
POST /queues/:id/tickets/:ticketId/insert-next
```

結果：

```text
Current = 50
Next = 25
Then = 51,52,53
```

50 完成後叫 25。

25 完成後 MUST 回到 51。

---

# 16. Queue Event Sourcing / Audit

所有關鍵 Queue 操作 MUST 有不可變事件紀錄。

```text
queue_events
- id
- merchant_id
- branch_id
- queue_id
- ticket_id nullable
- event_type
- actor_user_id nullable
- old_state JSONB
- new_state JSONB
- metadata JSONB
- created_at
```

事件例如：

```text
TICKET_CREATED
TICKET_CALLED
TICKET_RECALLED
TICKET_PASSED
TICKET_RETURNED
TICKET_REORDERED
SERVICE_STARTED
SERVICE_COMPLETED
TICKET_CANCELLED
```

---

# 17. 預約與 Queue 的 SaaS 最新決策（2026-11-04 覆蓋舊規則）

> 已由 [現行 SaaS PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md) D-01／FR-001 取代。**預約就是預約，不能因到店報到而跳入叫號管理**。

- Reservation 的 CONFIRMED → CHECKED_IN → COMPLETED 僅修改預約自身狀態。
- 禁止預約報到自動 Create Queue Ticket、加進候位佇列、改叫號排序或通知客戶已取號。
- 雙模組店家仍可讓同一顧客另外「獨立取號」；純預約店不顯示叫號 UI。
- 歷史已有 reservation_id → ticket 的資料需要兼容查詢與稽核，不得直接清除。
- 本需求覆蓋原「Reservation -> Queue check-in」V2 Scope；正式開發須查目前 so_staff_set_reservation_status RPC 的自動產號耦合再修正。

---

# 18. Catalog 商品／餐點／服務

## 18.1 Catalog Item

```text
catalog_items
- id
- merchant_id
- branch_id nullable
- type ENUM(service, food, product, addon)
- name
- description
- price
- currency
- active
- sort_order
- image_url nullable
- duration_minutes nullable
- tax_category nullable
- created_at
- updated_at
```

## 18.2 Service 可額外有

- duration。
- 可預約。
- 可現場排隊。
- 是否需指定 staff。
- capacity。
- buffer time。

---

# 19. Order

## 19.1 Order Header

```text
orders
- id UUID
- merchant_id
- branch_id
- user_id nullable
- reservation_id nullable
- queue_ticket_id nullable
- order_number
- status
- currency
- subtotal
- discount_total
- paid_total
- due_total
- created_at
- updated_at
```

## 19.2 Order Status

```text
DRAFT
OPEN
PARTIALLY_PAID
PAID
COMPLETED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

---

# 20. 核心：Item-Level Payment

MUST 不可只使用：

```text
orders.paid = true
```

因為客人可能：

1. 線上先買 A、B。
2. 現場追加 C。
3. C 另外付款。

## 20.1 Order Item

```text
order_items
- id
- order_id
- catalog_item_id nullable
- name_snapshot
- unit_price
- quantity
- total_amount
- payment_status
- fulfillment_status
- added_source
- added_by_user_id nullable
- created_at
```

`name_snapshot` / `unit_price` MUST snapshot，避免商品改價後污染歷史訂單。

## 20.2 Item Payment Status

```text
UNPAID
PARTIALLY_PAID
PAID
REFUNDED
PARTIALLY_REFUNDED
VOIDED
```

---

# 21. Payment Allocation

因一筆付款可能支付多個 item，應建立 allocation。

```text
payments
- id
- order_id
- provider
- method
- status
- amount
- currency
- external_transaction_id nullable
- idempotency_key
- requested_at
- authorized_at nullable
- paid_at nullable
- failed_at nullable
- metadata JSONB
```

```text
payment_allocations
- id
- payment_id
- order_item_id
- amount
```

如此可以支援：

```text
Payment A = 1400
  -> 剪髮 600
  -> 護髮 800

Payment B = 2500
  -> 染髮 2000
  -> 頭皮護理 500
```

---

# 22. LINE Pay

正式串接使用 LINE Pay Online API v4。

核心流程：

```text
Order / selected unpaid items
       ↓
Create internal Payment
       ↓
POST /v4/payments/request
       ↓
取得 transactionId + payment URL
       ↓
Customer LINE Pay auth
       ↓
Redirect confirmUrl
       ↓
Server verify internal payment
       ↓
POST /v4/payments/{transactionId}/confirm
       ↓
Successful
       ↓
Payment = PAID
PaymentAllocation applied
Order totals recalculated
```

## 22.1 Payment Request

後端 MUST 產生自己的：

- internal orderId。
- payment record。
- idempotency key。
- expected amount。
- expected currency。

不得由前端直接指定可信金額。

## 22.2 Confirm

Confirm MUST 比對：

- transactionId。
- orderId。
- amount。
- currency。
- internal payment status。

不可只因 redirect 回來就標記付款成功。

## 22.3 Payment Idempotency

MUST 防止：

- 使用者 double tap。
- confirm URL refresh。
- retry。
- callback 重複。
- network timeout 後再次送出。

同一付款最多只能成功 allocate 一次。

建議：

```text
UNIQUE(provider, external_transaction_id)
UNIQUE(idempotency_key)
```

## 22.4 Payment State

```text
CREATED
REQUESTED
AUTHORIZED
PAID
FAILED
CANCELLED
REFUND_PENDING
PARTIALLY_REFUNDED
REFUNDED
```

實際 LINE Pay confirm/capture 模式依商家申請與整合方式定義。

---

# 23. 現場付款

支援：

```text
CASH
CARD
OTHER
LINE_PAY
```

現金付款：

Staff 點：

```text
收款
  ↓
選待付款 item
  ↓
付款方式 CASH
  ↓
確認金額
  ↓
Create payment
  ↓
PAID
```

MUST 寫 audit。

若權限設定要求 Manager approval，則 Staff 不得自行修改已完成付款。

---

# 24. 管理端 Order UI

顧客卡片：

```text
A57
王小姐
Queue: WAITING

已付款：$1,400
待付款：$2,500
```

Items：

```text
✅ 剪髮         $600   LINE Pay
✅ 護髮         $800   LINE Pay
⏳ 染髮       $2,000   未付款
➕ 頭皮護理     $500   未付款
```

操作：

```text
[追加服務]
[收取待付款]
[查看付款紀錄]
```

---

# 25. Customer Session / Journey 關聯

系統不必建立單一永久 `customer_session` table，但 MUST 能從資料關聯還原完整 Journey。

至少：

```text
User
 ├── Reservations
 ├── Queue Tickets
 └── Orders
```

以及：

```text
Reservation    Queue Ticket  （平行獨立業務，不自動產號/關聯）
Queue Ticket -> Order       （僅在另開點餐時）
Reservation -> Order        （僅在另開訂單時）
```

若引入 visit：

```text
visits
- id
- user_id
- branch_id
- reservation_id nullable
- queue_ticket_id nullable
- order_id nullable
- checked_in_at
- completed_at
```

此模型 SHOULD 在 V2 評估。

---

# 26. 通知系統

通知來源：

- Messaging API。
- LINE MINI App Service Message（若使用符合條件之 MINI App）。

## 26.1 通知事件

至少：

```text
RESERVATION_CONFIRMED
RESERVATION_REMINDER
RESERVATION_CANCELLED
QUEUE_JOINED
QUEUE_NEAR_TURN
QUEUE_CALLED
QUEUE_PASSED
QUEUE_RECALLED
PAYMENT_SUCCESS
PAYMENT_FAILED
```

## 26.2 防重複

```text
notifications
- id
- user_id
- type
- entity_type
- entity_id
- dedupe_key
- status
- sent_at
- error
```

`dedupe_key` MUST UNIQUE。

例如：

```text
queue-called:{ticketId}:{callSequence}
```

---

# 27. 預估等待時間

MVP 可使用：

```text
平均服務時間 × 前方人數
```

更佳：

最近 N 筆 completed ticket 計算 moving average。

不得對顧客聲稱精準時間。

顯示：

```text
預估約 20–30 分鐘
```

而非：

```text
剩 23 分 17 秒
```

設定：

```text
branch.default_service_minutes
```

---

# 28. QR Code

每個 Branch MUST 可產生 QR Code URL。

例如：

```text
https://app.example.com/q/{branchSlug}
```

開啟後：

1. 初始化 LIFF。
2. 辨識 branch。
3. 顯示目前等待資訊。
4. 允許取號。

QR Code MUST NOT 內含管理員憑證。

---

# 29. 主要 Customer Screens

## C01 首頁

顯示：

- 店名。
- 分店。
- 是否營業。
- 預約。
- 取號。
- 點餐／服務。
- 我的。

## C02 預約列表

- 日期。
- 時段。
- 服務。
- 價格。
- 可預約狀態。

## C03 預約確認

- 日期。
- 時間。
- 服務。
- 人數。
- 金額。
- 取消政策。
- 付款選項。

## C04 現場取號

顯示：

```text
目前叫號 A50
等待 6 組
預估 20–30 分鐘
```

CTA：

```text
取號
```

## C05 我的號碼

```text
A57
前方約 6 組
狀態：等待中
```

## C06 Catalog

分類、品項、價格、數量。

## C07 Cart

顯示：

- item。
- amount。
- subtotal。
- 支付方式。

## C08 LINE Pay Result

- 成功。
- 失敗。
- 取消。
- 處理中。

## C09 我的訂單

顯示 item-level payment。

## C10 我的預約

---

# 30. 主要 Staff Screens

## S01 Dashboard

顯示：

```text
目前服務 A50
下一位 A51
等待 12
過號 3
今日預約 18
待收款 5
```

## S02 Queue Board

分區：

```text
正在服務
等待中
已叫號
過號
完成
```

## S03 Ticket Detail

顯示：

- ticket。
- user。
- reservation。
- order。
- payment。
- notes。

操作依權限顯示。

## S04 Call Control

大尺寸：

```text
[下一位]
[再叫一次]
[開始服務]
[完成]
[過號]
```

次要：

```text
[指定下一位]
[調整順序]
```

## S05 Orders

filter：

- 待付款。
- 部分付款。
- 已付款。
- 已完成。

## S06 Order Detail

item-level 狀態與付款。

## S07 Reservation Board

## S08 Catalog

## S09 Staff

Owner / Manager only。

## S10 Settings

---

# 31. API 設計

Prefix：

```text
/api/v1
```

所有 tenant endpoints MUST 自後端 auth context 判斷權限。

---

# 32. Auth APIs

```http
POST /api/v1/auth/line/exchange
```

Input：

```json
{
  "lineAccessToken": "..."
}
```

Output：

```json
{
  "sessionToken": "...",
  "user": {
    "id": "...",
    "displayName": "..."
  }
}
```

正式實作時應採官方建議的 server-side token validation。

---

# 33. Merchant APIs

```http
GET /api/v1/me/merchants
GET /api/v1/merchants/:merchantId
GET /api/v1/merchants/:merchantId/branches
```

不得僅因 client 傳 merchantId 就回資料。

---

# 34. Queue APIs

```http
GET  /api/v1/branches/:branchId/queue/public-status
POST /api/v1/branches/:branchId/queue/tickets
GET  /api/v1/queue/tickets/:ticketId
POST /api/v1/queue/tickets/:ticketId/cancel
```

Staff：

```http
GET  /api/v1/staff/branches/:branchId/queue
POST /api/v1/staff/queues/:queueId/call-next
POST /api/v1/staff/tickets/:ticketId/recall
POST /api/v1/staff/tickets/:ticketId/pass
POST /api/v1/staff/tickets/:ticketId/start-service
POST /api/v1/staff/tickets/:ticketId/complete
POST /api/v1/staff/tickets/:ticketId/insert-next
POST /api/v1/staff/tickets/:ticketId/reorder
```

---

# 35. Reservation APIs

```http
GET  /api/v1/branches/:branchId/reservation/availability
POST /api/v1/reservations
GET  /api/v1/reservations/:id
POST /api/v1/reservations/:id/cancel
POST /api/v1/staff/reservations/:id/check-in
POST /api/v1/staff/reservations/:id/no-show
```

---

# 36. Catalog APIs

```http
GET /api/v1/branches/:branchId/catalog

POST   /api/v1/staff/catalog/items
PATCH  /api/v1/staff/catalog/items/:id
DELETE /api/v1/staff/catalog/items/:id
```

DELETE SHOULD soft delete / deactivate。

---

# 37. Order APIs

Customer：

```http
POST /api/v1/orders
GET  /api/v1/orders/:id
POST /api/v1/orders/:id/items
```

Staff：

```http
GET   /api/v1/staff/orders
GET   /api/v1/staff/orders/:id
POST  /api/v1/staff/orders/:id/items
PATCH /api/v1/staff/orders/:id/items/:itemId
```

---

# 38. Payment APIs

```http
POST /api/v1/orders/:orderId/payments/line-pay/request
GET  /api/v1/payments/:paymentId
GET  /api/v1/payments/line-pay/confirm
POST /api/v1/staff/orders/:orderId/payments/manual
POST /api/v1/staff/payments/:paymentId/refund
```

Payment request input SHOULD 使用：

```json
{
  "orderItemIds": ["...","..."]
}
```

Amount MUST server-side 計算。

---

# 39. Admin Invite APIs

```http
POST /api/v1/staff/merchants/:merchantId/invitations
GET  /api/v1/staff/invitations/:token/preview
POST /api/v1/staff/invitations/:token/accept
POST /api/v1/staff/invitations/:token/revoke
```

`preview` 不應洩露不必要店家敏感資訊。

---

# 40. LINE Webhook

Endpoint：

```http
POST /api/v1/webhooks/line
```

MUST：

- 驗證 LINE webhook signature。
- 防止偽造 webhook。
- 快速回應。
- 重處理需 idempotent。
- 不得只用 source userId 信任未驗證內容。

可處理：

- follow。
- unfollow。
- postback。
- message（若啟用 chatbot）。

---

# 41. Rich Menu Sync

建立 service：

```text
RichMenuService.syncUser(userId)
```

邏輯：

```text
沒有 merchant member
  -> unlink per-user menu

Staff
  -> staff rich menu

Manager
  -> manager rich menu

Owner
  -> owner rich menu
```

若使用者同時是多店家角色：

MVP 建議以最高系統角色 menu 顯示「管理中心」，進入後再選店家。

不要為每個 merchant 動態建立不同 Rich Menu。

---

# 42. Security Requirements

本章全部為 MUST，除非另註明。

## 42.1 Authentication

- 所有管理 API MUST authentication。
- 所有付款 API MUST authentication。
- 不接受 client-provided user identity。

## 42.2 Authorization

每個管理寫入 API MUST：

```text
authenticated user
        ↓
merchant_members
        ↓
status active
        ↓
branch scope
        ↓
permission
```

## 42.3 IDOR 防護

例如：

```http
GET /staff/orders/123
```

即使 user 是 A 店 Staff，如果 order 123 屬於 B 店，MUST `403` 或 `404`。

任何：

- orderId。
- ticketId。
- reservationId。
- paymentId。
- branchId。

都必須檢查 tenant ownership。

## 42.4 CSRF

若使用 cookie session，MUST 實作 CSRF protection 或 SameSite + token strategy。

若使用 Authorization bearer token，需避免 token 被注入或外洩。

## 42.5 XSS

User note / item name / merchant-defined content MUST escape。

若支援 HTML，MUST sanitize。

## 42.6 SQL Injection

MUST parameterized query / ORM。

## 42.7 Rate Limit

至少：

- auth。
- invitation accept。
- ticket create。
- payment request。
- admin mutation。

## 42.8 Secret

不得 commit：

- LINE Channel Secret。
- Channel Access Token。
- LINE Pay Channel Secret。
- DB password。

使用 secret manager / env。

## 42.9 Logs

不得記錄完整：

- Access Token。
- LINE Pay secret。
- session token。
- invitation plaintext token。

## 42.10 HTTPS

Production MUST 強制 HTTPS。

---

# 43. Audit Log

```text
audit_logs
- id
- merchant_id
- branch_id nullable
- actor_user_id
- actor_role
- action
- resource_type
- resource_id
- before JSONB nullable
- after JSONB nullable
- ip_address nullable
- user_agent nullable
- created_at
```

MUST 記錄：

- 角色新增／移除。
- 角色變更。
- Queue reorder。
- 指定叫號。
- 過號。
- 手動付款。
- 退款。
- 訂單金額人工修改。
- 店家設定修改。

Audit Log MUST 不可由一般 Staff 刪除。

---

# 44. Concurrency

這個系統很容易遇到多店員同時操作。

MUST 處理：

## Case A

兩個 Staff 同時按「下一位」。

預期：

- 不得同時叫兩個不同號。
- 不得把同一 ticket 重複 call。

解法：

- DB transaction。
- queue-level lock。
- Redis lock（多 instance）。
- idempotency key。

## Case B

最後一個預約 slot 同時被兩人選。

預期：

只有一人成功。

## Case C

兩個付款請求同時支付相同 item。

預期：

不可 double pay。

Payment allocation creation MUST transaction-lock selected unpaid items。

---

# 45. Idempotency

以下 endpoint MUST 支援：

- call-next。
- payment request。
- payment confirm。
- reservation create（建議）。
- ticket create（建議）。
- manual payment。

Header：

```http
Idempotency-Key: <uuid>
```

資料：

```text
idempotency_records
- key
- user_id
- endpoint
- request_hash
- response_status
- response_body
- created_at
- expires_at
```

相同 key + 不同 payload MUST error。

---

# 46. Error Model

API 統一：

```json
{
  "error": {
    "code": "QUEUE_TICKET_ALREADY_CALLED",
    "message": "此號碼已被叫號",
    "requestId": "req_xxx"
  }
}
```

不可只回：

```text
Something went wrong
```

主要 error code：

```text
UNAUTHORIZED
FORBIDDEN
TENANT_ACCESS_DENIED
RESOURCE_NOT_FOUND
INVALID_STATE_TRANSITION
RESERVATION_SLOT_FULL
QUEUE_CLOSED
ACTIVE_TICKET_EXISTS
PAYMENT_ALREADY_COMPLETED
PAYMENT_AMOUNT_CHANGED
ORDER_ITEM_ALREADY_PAID
INVITATION_EXPIRED
INVITATION_USED
INVITATION_REVOKED
```

---

# 47. 狀態機驗證

所有狀態轉換 MUST 在 domain/service layer。

不可：

```ts
ticket.status = req.body.status
```

應使用：

```ts
ticket.pass()
ticket.call()
ticket.startService()
ticket.complete()
```

或等價 domain service。

---

# 48. Branch Settings

```text
branch_settings
- timezone default Asia/Taipei
- queue_enabled
- reservation_enabled
- ordering_enabled
- payment_enabled
- default_service_minutes
- queue_open_time
- queue_close_time
- max_active_tickets_per_user
- reservation_cancel_before_minutes
- near_turn_notify_count
- return_policy
```

---

# 49. Business Hours

```text
business_hours
- branch_id
- weekday
- open_time
- close_time
- is_closed
```

例外：

```text
business_hour_exceptions
- branch_id
- date
- open_time nullable
- close_time nullable
- closed
- note
```

國定假日不應 hard-code；由店家覆寫。

---

# 50. 預約與叫號編號規則（2026-11-04 最新）

> 詳細定義見 [現行 SaaS PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md) D-02／FR-002。

- 預約與叫號**各自獨立**設定可編輯編號前綴，最多 3 個可見 Unicode 字元，允許中/英文/特殊符號及空白前綴，**預設空白**。
- 流水數字為 1～9,999,999，**不補前置 0**；不得再預設 A001、A002。
- 預約管理和叫號管理各提供「重置編號」按鈕；按下後新的該模組紀錄從 1 開始，**不是無條件每日重置**。
- 重置只開新 numbering epoch，不改舊資料編號與通知；必須防止舊/新批次相同顯示號碼造成錯叫、錯改或錯通知。
- 唯一性由後端的 tenant + branch + module + epoch + sequence 保護，內部主鍵為 UUID；管理員重置有二次確認與 audit，併發安全。

---

# 51. 使用者重複取號

> 此處一人一張僅為顧客自助取號的可設定預設策略；跨店取號彼此獨立，店員授權的特殊多張號碼操作以最新 SaaS PRD 與既有 RPC 規則為準。預約報到不得占用取號名額。

預設：

同一 user 在同一 branch / queue 同時間只能有一個 active ticket。

Active：

```text
WAITING
CALLED
SERVING
PASSED
RETURNED
```

若 `max_active_tickets_per_user = 1`：

第二次取號：

```text
您已有號碼 A57
[查看號碼]
```

而不是再建立 A58。

---

# 52. 匿名／未登入

若 LINE context 無法取得身份：

- 可以 MAY 顯示公開等待資訊。
- MUST NOT 建立可付款訂單。
- MUST NOT 建立 staff action。
- 取號是否允許匿名由產品決定。

MVP 建議要求 LINE 登入。

---

# 53. Notification Privacy

叫號通知不可暴露其他客戶個資。

允許：

```text
目前叫號 A54
您的號碼 A57
```

不可：

```text
目前王小明正在服務
```

---

# 54. 個資最小化

只儲存業務必要資訊。

預設不要求：

- 身分證字號。
- 完整住址。
- 生日。

電話 SHOULD optional。

若業務需電話，須明確用途。

---

# 55. 刪除／停權

User 封鎖 OA 或刪除 LINE 帳號：

歷史 order / payment MAY 保留以符合法規與帳務要求，但應避免繼續通知。

Merchant member revoke：

- 立即 status = revoked。
- 立即失去 API 權限。
- 觸發 Rich Menu unlink / sync。
- 現有 session SHOULD 於下一次 request 重新驗權，因此不用等 session expire 才失效。

---

# 56. Observability

Production MUST 有：

- request ID。
- structured log。
- error tracking。
- payment error log。
- webhook processing log。
- background job retry log。

建議：

- Sentry。
- OpenTelemetry。
- Cloud logging。

---

# 57. Performance

基本目標：

- 一般 API p95 < 500ms（不含第三方）。
- Queue screen refresh < 2s 感知。
- Staff call-next 操作 < 1s 回 UI（LINE 通知可 async）。
- 不要因 Messaging API 發送失敗回滾已成功的叫號 transaction。

---

# 58. 即時更新

Staff Queue Board SHOULD 即時。

優先順序：

1. SSE。
2. WebSocket。
3. 3–5 秒 polling（MVP）。

Customer My Ticket 可 5–15 秒 polling + LINE notification。

---

# 59. 第三方 API 失敗策略

## Messaging API fail

Queue 狀態照常成功。

notification job retry。

## LINE Pay request fail

Payment = FAILED / REQUEST_FAILED。

Order items 保持 UNPAID。

## LINE Pay confirm timeout

不得直接判定失敗或成功。

標記：

```text
CONFIRMING / UNKNOWN
```

後續查詢 provider 狀態 reconciliation。

---

# 60. Payment Reconciliation

MUST 有機制定期檢查：

- internal = pending 太久。
- provider = paid 但 internal 未更新。
- internal = paid 但 allocation 不一致。

可用 scheduled job。

---

# 61. Queue Lifecycle 與批次（2026-11-04 修訂）

- queue open/close 是營業狀態，不等於自動清空/結案、不等於編號重置；跨午夜仍未完成的號碼必須可查與可操作。
- 每個 merchant/branch 的 queue 獨立；預約編號計數器獨立於 queue 計數器。
- 建議數據欄位：queue_id、branch_id、business_date、status、opened_at、closed_at；另以 numbering counters 保存 module、epoch、prefix、next_value。
- 顯示號碼可重用的「新 epoch」不代表 UUID 或既有記錄被重用；不可用 UNIQUE(branch_id, business_date, prefix) 取代 epoch 交易唯一性。
- 實作以 [現行 SaaS PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md) D-02 為準。

---

# 62. 建議 PostgreSQL Schema 概覽

```text
users

merchants
branches
branch_settings
business_hours
business_hour_exceptions

merchant_members
member_branch_scopes
staff_invitations

catalog_items

reservation_slots
reservations
reservation_items

queues
queue_tickets
queue_positions
queue_events

orders
order_items

payments
payment_allocations

notifications

audit_logs
idempotency_records
```

---

# 63. Database Constraints

至少：

```text
users.line_user_id UNIQUE
merchant_members(merchant_id,user_id) UNIQUE
payment(provider, external_transaction_id) UNIQUE where not null
notifications.dedupe_key UNIQUE
```

以及必要 foreign key。

金額 MUST 用：

```text
INTEGER（TWD 元）
```

或：

```text
DECIMAL
```

不得使用 floating point。

---

# 64. Soft Delete

以下 SHOULD 使用 soft delete：

- catalog_items。
- merchant member。
- branch。

交易資料不得 hard delete：

- order。
- payment。
- queue event。
- audit log。

---

# 65. Repository 建議

```text
/
├── apps/
│   ├── web/
│   │   ├── customer/
│   │   └── staff/
│   └── api/
│
├── packages/
│   ├── db/
│   ├── auth/
│   ├── domain/
│   ├── line/
│   ├── line-pay/
│   ├── ui/
│   └── shared/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docs/
│   ├── PRD.md
│   ├── api.md
│   ├── architecture.md
│   └── adr/
│
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── .env.example
├── docker-compose.yml
└── README.md
```

若 monorepo 太重，可單一 Next.js repo，但 domain module 邊界仍需維持。

---

# 66. Domain Module 建議

```text
auth
merchant
member
reservation
queue
catalog
order
payment
notification
audit
integration-line
integration-line-pay
```

Payment / Queue 不得直接散落在 route handler。

---

# 67. Environment Variables

`.env.example`：

```bash
NODE_ENV=

DATABASE_URL=
REDIS_URL=

APP_BASE_URL=
SESSION_SECRET=

LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=

LINE_MESSAGING_CHANNEL_ID=
LINE_MESSAGING_CHANNEL_SECRET=
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=

LINE_RICHMENU_CUSTOMER_ID=
LINE_RICHMENU_STAFF_ID=
LINE_RICHMENU_MANAGER_ID=
LINE_RICHMENU_OWNER_ID=

LINE_PAY_CHANNEL_ID=
LINE_PAY_CHANNEL_SECRET=
LINE_PAY_API_BASE_URL=https://sandbox-api-pay.line.me

SENTRY_DSN=
```

不得把 production secret 放入 `.env.example`。

---

# 68. Development Environments

至少：

```text
local
staging
production
```

LINE Pay：

- local / staging 使用 Sandbox。
- production 使用正式 endpoint。

LINE Webhook staging 與 production SHOULD 分離 channel 或明確設定。

---

# 69. Migration

MUST 使用 migration。

禁止 production：

```text
ORM auto-sync schema
```

每次 schema change：

- migration。
- rollback strategy。
- data backfill 說明。

---

# 70. Seed Data

Dev seed：

```text
Merchant Demo
Branch Taipei
Owner
Staff
Catalog
Queue
Reservation Slots
```

但不得 seed 真實 LINE userId 到 public repository。

---

# 71. Testing Strategy

## Unit

至少：

- queue state transition。
- reservation availability。
- order total。
- payment allocation。
- RBAC。
- return/passed logic。

## Integration

至少：

- concurrent call-next。
- concurrent reservation booking。
- concurrent payment。
- tenant isolation。
- invitation consume。
- payment confirm idempotency。

## E2E

核心 journey：

```text
Customer login
 -> take ticket
 -> staff call
 -> customer notified
 -> service
 -> add items
 -> LINE Pay
 -> paid
 -> complete
```

---

# 72. 資安驗收測試

MUST 建立測試：

## Test S01

一般 Customer 直接開：

```text
/staff/queue
```

結果：

```text
403 / redirect unauthorized
```

## S02

Customer 手動呼叫：

```http
POST /api/v1/staff/queues/x/call-next
```

結果 403。

## S03

A 店 Staff 讀 B 店 order。

結果 403/404。

## S04

Staff 修改 request body：

```json
{"role":"owner"}
```

不能升權。

## S05

邀請 token 第二次使用。

結果 error。

## S06

過期 invitation。

結果 error。

---

# 73. Queue 驗收案例

## Q01 正常

```text
51
52
53
```

call-next：

```text
51 CALLED
```

完成後 call-next：

```text
52 CALLED
```

## Q02 過號

51 called -> passed。

下一號 52。

## Q03 過號回來插下一位

目前 52 serving。

等待：

```text
53,54
```

51 returned。

Staff insert-next。

預期：

```text
52 -> 51 -> 53 -> 54
```

不得：

```text
52 -> 51 -> 52...
```

## Q04 雙擊下一位

兩個相同 idempotency request。

只叫一位。

## Q05 兩個 Staff 同按

最多一次 state transition 成功。

---

# 74. Reservation 驗收

## R01

capacity 1 slot。

兩人同時預約。

只允許 1。

## R02

取消後 capacity 釋放。

## R03

同一 reservation check-in 兩次。

只建立一張 queue ticket。

---

# 75. Payment 驗收

## P01

Order：

```text
A $600
B $800
C $2000
```

Pay A+B：

```text
Payment 1400 PAID
A PAID
B PAID
C UNPAID
Order PARTIALLY_PAID
due 2000
```

## P02

現場加：

```text
D $500
```

due：

```text
2500
```

## P03

支付 C+D：

Order = PAID。

## P04

LINE Pay confirm page refresh 5 次。

不得建立 5 次付款。

## P05

Client 修改 amount：

```json
{"amount":1}
```

後端 MUST 忽略 client amount，重新計算。

---

# 76. 管理員驗收

Owner 邀請 Staff：

1. token 生成。
2. Staff 接受。
3. merchant member 建立。
4. Staff menu sync。
5. Staff 可 call queue。
6. Staff 無法 invite owner。

Owner revoke Staff：

1. status revoked。
2. 下一個 API request 立即 403。
3. Rich Menu sync 回 customer/default。
4. audit log 存在。

---

# 77. UX 邊界案例

MUST 設計畫面：

- 店家休息。
- Queue 未開放。
- Queue 已停止取號。
- 今天號碼已滿。
- 使用者已有號碼。
- 預約已額滿。
- LINE Pay 被取消。
- 付款處理中。
- 網路中斷。
- 服務已下架但歷史訂單仍需顯示。
- 使用者被移除 Staff。
- Invitation expired。

---

# 78. 日期與時區

DB：

- timestamp SHOULD 儲存 UTC。
- branch 儲存 timezone。

UI：

- 依 branch timezone 顯示。

台灣預設：

```text
Asia/Taipei
```

`business_date` 依 branch timezone 判斷，不依 server UTC date。

---

# 79. 金額

台灣 MVP：

```text
currency = TWD
```

所有 order item 計算：

```text
subtotal = Σ unit_price × qty
```

server-side only。

Frontend 顯示值不可信。

---

# 80. 退款

MVP MAY 延後。

若實作：

- 不直接把 Payment delete。
- 建立 refund record 或 payment adjustment。
- 支援 partial refund。
- item payment status 更新。
- audit required。
- 權限至少 manager。

---

# 81. Customer Profile

Customer profile 可顯示：

- LINE display name。
- picture。
- internal user ID。

但店家 staff 不應不必要取得 LINE 平台其他資料。

---

# 82. Search

Staff SHOULD 可搜尋：

- ticket number。
- order number。
- 預約姓名（若有）。
- 電話（若使用者提供）。
- 今日紀錄。

---

# 83. QR Staff Security

禁止建立：

```text
/admin?role=staff
```

這種依 URL 決定權限。

任何 admin QR 也只能做 invitation / login entry，不可包含永久 admin credential。

---

# 84. Webhook Security

LINE Webhook：

- 使用 raw body 驗 signature。
- signature invalid -> 401/403。
- 不進 business logic。
- event webhook id SHOULD 用於 dedupe（若平台提供）。
- retry-safe。

---

# 85. LINE Pay Security

MUST：

- HMAC / 官方規範簽章。
- nonce。
- secret server-side only。
- 驗證 provider response。
- 不將 Channel Secret 送前端。
- request body server-side 產生。
- confirm amount 對 internal expected amount。
- production 使用正式商家憑證。

---

# 86. Admin 操作確認

高風險操作 SHOULD 二次確認：

- 大額退款。
- 取消已付款訂單。
- 將員工升 Owner / Manager。
- 移除 Owner。
- 手動將付款改為 paid。

簡單 call-next 不需二次確認，避免影響營運。

---

# 87. Last Owner Protection

系統 MUST 不允許刪除 merchant 最後一個 Owner。

Owner transfer：

先新增另一 owner，再移除原 owner。

---

# 88. Rich Menu Security Conclusion

即使攻擊者：

- 知道 Staff LIFF URL。
- 複製管理頁網址。
- 看見管理 UI HTML。

也不能取得權限。

API MUST 根據 authenticated user + merchant membership 授權。

---

# 89. MVP Scope

現行 SaaS 驗收目標（2026-11-04 修訂）：

讓店家可以單獨啟用「LINE 預約」或「LINE 取號＋店員叫號」或兩者同時啟用，**兩套業務維持獨立**；即使只啟用預約，也必須可完成 LINE 身分、建立/修改/取消、店員管理及通知，而不依賴叫號模組。

MUST：

- LINE login。
- Customer Rich Menu。
- Staff Rich Menu。
- Owner 邀請 Staff。
- branch。
- queue。
- ticket。
- call-next。
- pass。
- returned / insert-next。
- complete。
- Queue board。
- Messaging notification。
- Audit Log。
- RBAC。
- Tenant isolation。
- 基本 QR 取號。

現行 SaaS 的預約及取號都須有可用的獨立管理模組；Catalog 可先採簡版服務項目，LINE Pay／訂金／複雜 item-level 支付可以留待後期。

> 上述為**現行 SaaS** 的優先範圍；不能把舊版「預約可不做」誤當作省略預約模組的理由。詳細階段與驗收見 [DoYouBook 競品解法 PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md)。

---

# 90. V2 Scope（2026-11-04 SaaS 修訂）

加入：
- 獨立 Reservation 模組與 Catalog；預約報到僅改預約狀態，不合流 Queue。
- 店家可獨立開啟預約、叫號或兩者；共用 tenant/branch/RBAC，但資料流分開。
- 預約的服務時長、營業例外、不可重疊、取消/改期期限與店員代建。
- LINE-first 身分與可靠通知；編號前綴/重置屬於現行 P0，需早於其他進階項目。
- 後續進階預約模式、PWA、客戶簿、Google Calendar 單向同步與品牌頁，依 [現行 SaaS PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md) 的 P1/P2/P3 排程。
- Order、item-level payment、LINE Pay 保留未來領域模型，但**不能**與預約/叫號合流視為必要前置條件。

---

# 91. V3 Scope

加入：

- LINE Pay Online API v4。
- partial payment。
- payment allocation。
- refund。
- reconciliation。
- 更完整通知。
- analytics。

---

# 92. Analytics（未來）

事件 SHOULD 可收集：

```text
queue_joined
queue_wait_time
queue_abandoned
queue_passed
reservation_created
reservation_cancelled
order_created
payment_completed
```

商家 dashboard：

- 平均等待。
- 過號率。
- 完成率。
- 預約 no-show。
- 平均客單。
- 預付比例。

不得因此阻塞 MVP。

---

# 93. 建議開發順序

## Sprint 0

- Repo。
- CI。
- DB。
- Auth。
- Merchant / Branch。
- RBAC。

## Sprint 1

- Queue schema。
- Ticket create。
- Customer queue screen。
- Staff queue board。

## Sprint 2

- call-next。
- pass。
- return。
- insert-next。
- queue events。
- audit。
- concurrency tests。

## Sprint 3

- Messaging API。
- Rich Menu sync。
- Staff invitation。
- QR。

= MVP。

## Sprint 4

- Reservation。
- Catalog。

## Sprint 5

- Order。
- item-level payment。

## Sprint 6

- LINE Pay。
- reconciliation。

---

# 94. Definition of Done

任何 feature 完成需：

- 功能實作。
- auth。
- authorization。
- tenant isolation。
- validation。
- error handling。
- audit（若屬敏感操作）。
- unit test。
- integration test（關鍵 transaction）。
- migration。
- API docs。
- no secrets committed。
- staging 驗證。

---

# 95. Agent 開發禁止事項

開發 Agent 不得：

1. 把管理員判斷只放前端。
2. 用 `isAdmin` 從 client 決定權限。
3. 把 Rich Menu 當權限。
4. 用 display name 當身份。
5. 信任 client amount。
6. 只用 order-level boolean paid。
7. 把 current queue number 當唯一 queue model。
8. 過號回來時修改全局流水號。
9. Payment success 只看 redirect。
10. 付款重試時重複 allocate。
11. 沒做 transaction 就處理最後名額。
12. production secret commit 到 Git。
13. hard delete payment / audit。
14. A tenant 可藉改 ID 看到 B tenant。
15. 用 float 處理金額。
16. 狀態任意 PATCH。
17. 讓 revoked staff 在 session 到期前仍可操作。
18. 把第三方通知失敗當作叫號 transaction 失敗。

---

# 96. 最重要的 Domain Invariants

以下永遠必須成立：

### Invariant 1

每張 Queue Ticket 的 `ticket_number` 建立後不可因 reorder 改變。

### Invariant 2

實際服務順序與 ticket number 分離。

### Invariant 3

同一 Order Item 不可被成功支付超過其應付金額。

### Invariant 4

Order `paid_total` 必須等於有效 payment allocation 合計。

### Invariant 5

任何 Staff operation 都必須通過 backend RBAC。

### Invariant 6

任何 tenant resource 都必須驗 merchant / branch ownership。

### Invariant 7

第三方 redirect 不等於付款成功。

### Invariant 8

任何敏感手動變更可追溯到 actor。

### Invariant 9

同一 invitation token 最多成功 accept 一次。

### Invariant 10

同一 queue 的 `call-next` 在 concurrency 下不得跳號或重複 call。

---

# 97. 現行 UI 文案基準（2026-11-04 修訂）

> 本節以「**編號預設不加前綴、不補 0**」為示例，實際如商家設定了前綴，請由同一後端編號快照生成。以下號碼僅為 UX 示意，不得寫死。

Customer Queue：

```text
您的號碼
57

目前叫號
50

19:50 時，前方還有 6 組
預估等待 20–30 分鐘（僅在具備可靠估計時顯示）

[叫號進度]              （主動查最新狀態，再送一則 LINE 訊息）
[查看即時叫號網頁]      （打開所屬店家的即時進度）
```

Staff：

```text
目前服務
50

下一位
51

[下一位] [過號] [再叫一次]

等待 12｜過號 3
```

過號回來：

```text
25 已回到現場
[安排下一位] [排到最後] [選擇順位]
```

預約頁：

```text
預約編號：12
預約日期：2026/11/04 14:00
狀態：已預約
[改期] [取消預約]
```

- 預約管理不能因「已報到」自動導向叫號管理，也不能從預約自動產生票券。
- 若店家為本店預約設定中文／英文／符號前綴（最多 3 字），顯示如「髮12」；客戶 LINE 卡、後台與網頁須一致。
- 同一門市手動重置後可能出現舊批次與新批次同號，後台需區分批次以免錯誤操作；交易與通知絕不僅依顯示編號定位。
- LINE 卡片不會因後台叫號自動更改原訊息；即時進度以網頁為主，訊息進度是按需更新。

---

# 98. 官方平台事實基準

截至本需求書日期，開發時應以 LINE 官方最新文件為準。

目前設計依據包含：

- LINE Messaging API 支援 per-user Rich Menu。
- per-user Rich Menu 的優先級高於 default Rich Menu。
- Rich Menu 可連結 LINE MINI App / LIFF URL。
- LINE MINI App 使用 LIFF API，server-side 可使用相關 service API。
- LINE Pay Online API v4 提供 payment request：
  `POST /v4/payments/request`
- LINE Pay payment confirm：
  `POST /v4/payments/{transactionId}/confirm`
- LINE Pay request / confirm 採 server-to-server 串接，不可將 merchant secret 暴露前端。

官方參考：

- https://developers.line.biz/en/docs/messaging-api/use-per-user-rich-menus/
- https://developers.line.biz/en/reference/messaging-api/nojs/
- https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/
- https://developers.line.biz/en/docs/line-mini-app/service/line-mini-app-oa/
- https://developers-pay.line.me/online-api-v4
- https://developers-pay.line.me/online-api-v4/request-payment
- https://developers-pay.line.me/online-api-v4/confirm-payment

---

# 99. 最終產品原則

這套系統不是「聊天機器人」。

它是一套：

> 以 LINE OA 作入口、以 LIFF / LINE MINI App 作 UI、以後端作唯一可信狀態來源的門市營運系統。

核心產品模型為：

```text
LINE Identity
   ↓
Merchant / Branch
   ↓
Reservation / Queue
   ↓
Order Items
   ↓
Payments
   ↓
Fulfillment
```

管理員 UI 與一般客人 UI 可以不同，但：

> UI 差異只改善體驗，真正的安全性永遠來自後端 Authentication + Tenant Isolation + RBAC + Audit。

Queue 的核心原則：

> 「號碼」是顧客識別；「順序」是營運狀態。兩者不得混為一談。

Payment 的核心原則：

> 「一張訂單是否已付款」只是計算結果；真正付款狀態必須落在 Payment + Allocation + Item 層。

只要以上三個原則不被破壞，後續才能安全擴充到預約、美髮、美甲、診所、餐飲、寵物美容、維修、洗車等不同場景。

---

# 100. 開發 Agent 第一個任務

第一位開發 Agent 開始 coding 前 MUST 先交付：

1. `architecture.md`
2. PostgreSQL / Prisma schema 初稿
3. RBAC matrix
4. Queue state machine
5. Payment state machine
6. API route list
7. 3 個 ADR：
   - ADR-001：LINE Auth Strategy
   - ADR-002：Queue Ordering Strategy
   - ADR-003：Payment Idempotency Strategy

確認這 7 項與本需求書一致後，再開始建立實際 feature。

不得一上來直接做 UI。


---

<!-- UX-REVIEW-20261104-START -->
# 101. 2026-11-04 LINE 預約與叫號：競品使用者回饋改善 PRD

> 狀態：**需求已整理、待開發、未驗收**。本章是主 PRD 的新增需求，不代表相關功能已完成。  
> 適用專案：https://hub-google.github.io/LINE/saas/；原始碼：https://github.com/hub-google/LINE/tree/main/QueueMonster
> P0：正式對外擴大使用前必須修正；P1：主要使用體驗；P2：後續差異化。  
> 「已確認」只代表 2026-11-04 程式碼可以核對；「部分完成」代表仍欠完整流程；「待實測」不得視作已在正式環境發生事故。第三方評論代表個別使用者陳述，不是競品官方承認的事故。

## 101.1 新規則優先效力與不可破壞的產品決策

**若本章與原第 11、12、15、73、74、77、89、90、97 節的舊版流程互相衝突，針對本 LINE SaaS 預約/叫號產品，以本章下列明確新決策為準；其餘既有安全、付款、權限與稽核規則仍適用。** 不得照舊章「預約 Check-in 自動加入 Queue」進行開發。

1. **預約與叫號完全獨立。** 預約完成、到店報到、結案、取消不得自動生成、改動或刪除叫號票券；取號、叫下一位、服務完成亦不得回頭修改預約狀態。若商家希望從預約另行取號，必須有人工明確按下的獨立動作，不是預設流程。
2. **編號各自獨立。** 每家商家有一組預約流水號和一組現場取號流水號，預設前綴空白，前綴可由店家輸入 0～3 字元中文、英文、數字或特殊符號；數字 1～9,999,999，不補零。兩頁分別有「重置編號」按鈕，按下後下一筆從 1 起，舊資料、舊號碼不變。不同商家互不干擾。
3. **只用一套響應式網站。** 顧客不用另填姓名/密碼、使用驗證過的 LINE 身分；電腦和手機共用相同網址與功能。店員/平台有獨立授權。平台 LINE OA 同時可供顧客搜尋沒有自有 OA 的商家、供商家進入後台；商家自有 OA 的獨立綁定不得假裝已完成。
4. **資料庫為唯一真相。** 不可以本機假資料或前端成功提示取代真實 Supabase 寫入；新增 migration/部署不能刪掉正式與 QA 商家、既有預約、取號、員工與設定。尤其原測試店 qa-84b3ef9297eb470685a91a527ca499ca 必須有經授權的恢復途徑，不得默默另建空白店覆蓋原店。
5. **刪除不是取消。** 後台「預約管理」「叫號管理」保留每筆可勾選刪除（soft delete）；顧客端立刻隱藏，**不發 LINE 通知**，後台可查已刪除並還原。業務取消、取消→恢復屬於另一種狀態轉換，依原通知模板正確發送。
6. **通知版型統一。** 預約從「已取消」改回「已預約」要再次發送「一般預約成功」同一張卡，不另寫一套。取號卡要有商家、號碼、目前叫號、查詢時間「HH:mm 時 前方還有 X 組」、「叫號進度」（點擊重新取最新資料再回覆 LINE）、「查看即時叫號網頁」。舊 LINE 卡不會自行即時改字，不能將其宣稱為動態訊息。
7. **避免顧客看到工程資訊。** 讀取中統一「資料更新中，請稍後」；不顯示冗長 Supabase、token、LINE 通知資格偵錯文字。一般操作提示 5 秒自動消失，但尚在等待中的動作要顯示至完成。LINE Messaging API 接受訊息不等於已送達或已讀，不可誇大狀態。
8. **並行對話保護。** 本次只更新 PRD，不修改前端、SQL、Edge Function、Actions、資料庫、LINE OA、Secrets 或部署。開發者需先讀最新 main/gh-pages 和已部署 migration，再依 UX ID 分工；任何後續實作必須使用專屬 branch/PR、衝突時人工合併、禁止覆寫別人修改、force push、清除 QA 紀錄或重建測試店。

## 101.2 競品來源索引（可直接點開核對）

| 來源 | 使用者反映或競品參考內容 | 網址 |
|---|---|---|
| E01 Dcard inline | 成立後訂位被取消、通知缺漏的個人經驗 | https://www.dcard.tw/f/mood/p/255588899 |
| E02 App Store Lineup | 顯示可約，進入後人數時段不符；舊產品歷史評論，現已轉型 | https://apps.apple.com/tw/app/lineup/id1087283735 |
| E03 App Store 鼎泰豐 | 通知太晚、不能方便查即時進度 | https://apps.apple.com/tw/app/%E9%BC%8E%E6%B3%B0%E8%B1%90/id1108359809 |
| E04 App Store E排客 | 重複登入、取號後無法查看進度、頁面無反應 | https://apps.apple.com/tw/app/e%E6%8E%92%E5%AE%A2/id1239652841 |
| E05 App Store inline | 標籤搜尋不便、手機後台缺乏、登入入口困惑 | https://apps.apple.com/tw/app/inline/id1098167376?platform=ipad&see-all=reviews |
| E06 App Store Anytime 顧客版 | 網頁可改期但 App 只能取消，跨裝置不一致 | https://apps.apple.com/tw/app/anytime-%E9%A0%90%E7%B4%84%E9%99%84%E8%BF%91%E5%BA%97%E5%AE%B6-%E5%AE%A2%E4%BA%BA%E7%89%88/id1561747967 |
| E07 App Store 來美食 | 線上開放的訂位時段太少 | https://apps.apple.com/tw/app/%E4%BE%86%E7%BE%8E%E9%A3%9F/id1614763942 |
| E08 Dcard 饗賓 | 有使用者稱看到非本人資訊、原訂位被改或取消；原因未經獨立證實 | https://www.dcard.tw/f/food/p/241414822 |
| E09 PTT 17FIT 心得 | LINE 人工記錄易錯、日程可視化與前一天提醒的正向參考 | https://www.ptt.cc/bbs/toberich/M.1642213314.A.7BA.html |
| E10 Dcard inline 黑名單 | 一次 no-show 後難以自行重新訂位的個人經驗 | https://www.dcard.tw/f/food/p/256003123 |
| E11 Freetime 官方 App 頁面 | 休假設定、員工排程、異動通知、月曆等競品功能，並非負評 | https://apps.apple.com/tw/app/freetime-%E8%BC%95%E9%AC%86%E7%AE%A1%E7%90%86%E4%BD%A0%E7%9A%84%E9%A0%90%E7%B4%84/id6469409209 |

## 101.3 P0：預約、編號、通知與資料正確性

### UX-01｜預約/叫號獨立（已確認新舊流程衝突）
**問題：** 舊前端仍表示「已報到會產生或恢復候位號碼」，2026-11-04 SQL 則改成報到僅更新預約。  
**解法 MUST：** 清理 UI 舊流程與說明，預約及叫號維持獨立資料/狀態/統計/操作。預約管理不要把跳到叫號管理設定成報到之後的必要下一步；兩種業務動作皆由各自管理頁執行。  
**驗收：** 顧客預約→報到→完成時資料庫 ticket 數不增加；獨立取號→叫號→完成時 reservation 不變；取消任一筆不影響另一筆；顧客與店員文字一致。  
**程式：** https://github.com/hub-google/LINE/blob/gh-pages/saas/index.html#L636-L666 ；https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261104_independent_booking_queue_manual_serials.sql

### UX-02｜獨立編號、前綴和手動重置（SQL 部分完成、前端缺按鈕）
**解法 MUST：** 預約/叫號各自提供前綴設定、重置編號按鈕；前綴預設空白、最多 3 字元並阻擋控制字元；號碼 1～9,999,999 不補 0，店家獨立。重置前顯示尚未完成筆數並二次確認，重置記錄 batch/round、操作人與時間；舊資料不變。發號與重置同時發生時以 transaction/row lock 原子執行。由於手動重置後可能與未結案舊號同號，後台以內部 round/日期輔助辨識，所有 API/通知仍用 UUID 而非顯示號碼定位。  
**驗收：** A 店預約1、2及叫號1、2；僅重置預約後預約下一筆1、叫號下一筆3；B 店完全不受影響；清空前綴、中文/特殊字元 3 字元可行；大量並行不錯號；舊紀錄保留。  
**程式：** https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261104_independent_booking_queue_manual_serials.sql#L1-L134

### UX-03｜LINE Flex 與叫號驗證不再寫死 A001（已確認程式缺陷）
**問題：** line-bridge 目前仍多處把號碼組成 A + 3 位補零，且在叫號發送前以此核對。  
**解法 MUST：** 建立後端唯一 displayNumber 函式，格式為商家該票券的既存 prefix + ticket_no 十進位數；LINE 取號、更新、取消、postback、叫號與顧客網頁共用它。正式發送驗證改以 UUID + 事件 ID + 商家 ID + 後端授權為準，不可只以顯示字串當權限依據。維持既有 Flex 卡版型，不自行另造。  
**驗收：** 空前綴顯示 1、自訂「美」顯示「美1」、不可出現 A001；不同店同號與重置後同號不誤通知；卡片、網頁、API 一致。  
**程式：** https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/functions/line-bridge/index.ts#L233-L274 ；https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/functions/line-bridge/index.ts#L605-L614

### UX-04｜LINE 通知後端 Outbox、重試與冪等（部分完成）
**問題：** 目前網頁先儲存 RPC 再呼叫 Edge Function，網頁中斷可造成成功預約但未推播；部分成立通知存在短時間驗證窗。  
**解法 MUST：** 後端交易時原子寫入通知 outbox：事件 ID、商家、預約/票券 UUID、通知類型、接收人、模板版本、排程時間、發送狀態、重試次數、錯誤與操作時間；受控 worker/排程寄送。API 429/5xx 指數退避與上限、死信/人工補送；使用事件唯一鍵防重覆發送。頁面顯示「預約已成立」與「通知無法送出」分開；Messaging API 接受不能宣稱使用者收到/已讀；不因 LINE 失敗回滾真實預約。  
**驗收：** 交易成功後立即關頁仍可自動推播一次；重複 webhook/按鈕不重送；429/5xx 能重試；未加好友能識別失敗但資料不消失；後台可查錯誤/補送。  
**程式：** https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/functions/line-bridge/index.ts#L616-L651

### UX-05｜可約時段必須考慮人數（已確認前端缺口）
**問題：** 目前時段只在剩餘人數為 0 時禁選，未依顧客輸入人數即時禁用。  
**解法 MUST：** 人數、日期、服務、員工選擇改動即重新計算可約時段；例如剩 1 人而顧客選 4 人，直接禁選並顯示額滿/不足，推薦附近時間。最後一名額由後端原子驗證，避免併發超賣；服務時長擴充列 UX-15。  
**驗收：** 4 人不能點剩 1 人的時段；兩筆同搶最後容量只有一筆成立；資料刷新後有友善提示且不誤顯示成功。  
**來源：** E02；程式：https://github.com/hub-google/LINE/blob/gh-pages/saas/index.html#L962-L970

### UX-06｜狀態異動、取消與恢復一致（部分完成）
**解法 MUST：** 預約及票券各自列出合法轉換，API 驗證 expected-status/version 與商家權限，兩店員競爭時一人成功、一人提示資料已被更新；取消/復原/過號/再叫號均記 append-only audit。取消→已預約須重算容量並在確認成功後發原有預約成立同模板，不產生新預約號碼；任何預約狀態變化都不自動改取號。  
**驗收：** 雙人同按不跳號；復原的 LINE 版型與新成立一致；超額不允許恢復；異動可追溯操作者與前後狀態。  
**來源：** E01；程式：https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261104_independent_booking_queue_manual_serials.sql

### UX-07｜顧客、店家、員工的資料隔離（待實測）
**解法 MUST：** 顧客所有資料讀寫依後端驗證 LINE 身分，員工依當下 role、tenant、必要時分店範圍授權；merchant/ticket/booking URL 參數不能直接當身份；跨店列表僅本人紀錄，刪除不外洩；切換 LINE 帳號、匿名 session、裝置及瀏覽器不能看到別人資料。  
**驗收：** A LINE 不可讀/改 B 預約；甲店員不可動乙店；把 UUID 改成別人的記錄應 403/404；QA 後台不得取得正式店家權限；日誌不輸出 token。  
**來源：** E08；架構：https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/README.md

### UX-08｜無損部署與原測試商家恢復（待實測）
**解法 MUST：** migration 採 additive/backfill，先測試再部署，禁止 truncate/重建正式或 QA 表；保留原測試店 qa-84b3ef9297eb470685a91a527ca499ca 的預約、號碼、設定及授權；新隔離 QA 店必須讓店員明確知道不是原門市；保留資料備份、前後筆數及 ID 校對與 rollback 計畫。  
**驗收：** 部署前後原 QA store 與 reservation/ticket UUID、筆數一致；原授權者能恢復登入；測試帳號不影響正式商家。  
**程式：** https://github.com/hub-google/LINE/blob/gh-pages/saas/index.html#L523-L549

### UX-09｜LIFF/LINE 登入可恢復且不重導向循環（部分完成）
**解法 MUST：** LINE App 內 LIFF、外部瀏覽器或電腦用官方支援的 OAuth；有效已驗證 session 不重覆授權；逾時安全更新，保留原 merchant/tab/ticket/預約管理連結；自動重試最多一次，無限循環須中止，給一鍵重新授權；畫面只提供使用者看得懂的下一步，不顯示底層 token/PKCE 字串。  
**驗收：** iOS/Android LINE 內、Safari/Chrome 外部、Windows/macOS 都可開啟；正常回原門市且資料正確；換 LINE 帳號不串資料。  
**來源：** E04、E05；程式：https://github.com/hub-google/LINE/blob/gh-pages/saas/index.html#L253-L325

## 101.4 P1：預約與叫號體驗、店家營運

### UX-10｜提前 N 組到號提醒
**解法 SHOULD：** 商家可設定提前組數（預設 3，可關閉），依後端實際 WAITING、CALLED、SERVING 等有效候位計算，不從號碼差推算；同一票券在同一階段只提前提醒一次，叫到再正式通知，回復候位時防重複。留意 LINE OA 額度與節流。  
**驗收：** 前方從 4→3 發一次；3→2 不重複；已取消/過號/刪除不發。**來源：** E03。**現況：** 有正式叫號訊息，缺前置提醒。

### UX-11｜叫號即時同步、斷線與背景恢復
**解法 SHOULD：** Supabase Realtime 為主、低頻刷新為保底；頁面切到背景停止高頻讀取，恢復前景立即讀最新快照；斷線顯示最後成功更新時間和手動刷新。跨日、回候位、刪除、手動重置要正確計算前方組數，不以顯示號碼差距計算。  
**驗收：** 已開頁叫下一位後目標 10 秒內可見最新進度；網路中斷再連接不永久顯示舊號；多店獨立。**來源：** E03、E04。**現況：** 有基礎機制，待真機驗收。

### UX-12｜顧客與店員修改預約一致
**解法 SHOULD：** 顧客可從 LINE 卡片或網頁編輯日期、時間、人數、服務，店員後台也應能以授權修改上述欄位，並以後端容量驗證；取消必須確認，保留原預約編號與歷史，修改後用共用 LINE 模板發最新狀態，禁止手機/電腦功能不同。  
**驗收：** 顧客及員工均可修改且不創建新的 booking number；改期後舊提醒被取消，新提醒重排；取消→恢復使用與新預約相同的 Flex 模板。**來源：** E06。**現況：** 顧客端部分完成、店員功能不足。

### UX-13｜預約前提醒、確認與減少 no-show
**解法 SHOULD：** 商家可開關前 24 小時、當日提前 N 小時 LINE 提醒及「確認到店」，不回覆不得無告知直接取消；改期/取消時更新提醒任務。不要新增 Email 客服/通知依賴才能完成 LINE 核心流程。  
**驗收：** 取消/刪除不提醒；改期只依新日期提醒；同事件只發一次；LINE 失敗不變更預約。**來源：** E09、E11。**現況：** 尚未找到完整排程。

### UX-14｜店家搜尋、分頁、日/週/月日曆
**解法 SHOULD：** 管理頁提供「今天/明天/本週」、日期區間、顧客姓名/LINE 暱稱、預約號碼、狀態、服務篩選與後端分頁；增加日/週/月曆、時間軸（可看服務人員/資源）和各時段剩餘容量。行動版是易點擊的日程卡，不必拖動橫向大表。  
**驗收：** 10,000 筆模擬資料可用搜尋直接定位；新增/異動後清單日曆一致；刪除資料不混入一般結果。**來源：** E05、E09、E11。**現況：** 基本列表、無完整搜尋與日曆。

### UX-15｜營業時段、休假、時長與指定員工
**解法 SHOULD：** 每店設定星期幾營業、午休、國定/特別休假、臨時休息、開放/截止預約規則；服務項目有時長與緩衝時間；可選員工/設備容量。餐飲按人數，美業按時長與員工排班，統一由後端計算 slot；現有 15/30/60 分鐘間隔可當預設，不可作所有業種唯一選項。  
**驗收：** 午休不能預約、90 分鐘服務不重疊、休假員工不可選、臨時停約不偷偷取消原預約。**來源：** E07、E11。**現況：** 基礎單一營業區間/容量。

### UX-16｜一個網址在手機與電腦均可用
**解法 SHOULD：** 不製作多個行動/桌面專屬網站；同一響應式頁面保留所有業務操作，按鈕大小適合手指，防止誤觸，管理員在手機也可登入、叫號、處理預約；不依賴 hover 或對裝置猜測導向另一網址。  
**驗收：** 320/375/768/1280 px 皆無核心內容裁切、字體重疊、操作消失；手機/桌面操作相同資料、權限與結果。**來源：** E05、E06。**現況：** 方向正確，需設備回歸測試。

### UX-17｜預約異動有可查狀態與通知歷史
**解法 SHOULD：** 顧客可看到唯一最新狀態與最近更新時間；店家能查由誰、何時更改/取消/恢復，以及 LINE 排程/失敗/API 接受狀態；不要把已送 API 說成已讀；soft delete 的通知必須永遠保持靜默。  
**驗收：** 店員取消/恢復後顧客刷新與 LINE 最新卡一致；通知失敗不導致顧客記錄消失；異動追蹤無空白。**來源：** E01、E08。**現況：** 部分完成。

### UX-18｜首頁、總公司 LINE OA 與錯誤文案精簡
**解法 SHOULD：** 總公司圖文選單須同時有顧客「搜尋店家/我的預約/我的取號」、沒有自有 LINE OA 商家的入口，以及商家後台；未帶 merchant 的正式根網址進平台搜尋或首頁，不預設青禾風格美髮測試店。LIFF 成功時不顯示不必要的 LINE 身分驗證/通知診斷，失敗時才提供處理指引。資料讀取文案簡短、toast 5 秒消失、pending 不提早消失。  
**驗收：** 未帶店家參數不進測試店；具店家連結保持正確店家；未公開商家不在搜尋結果；使用者不會看到 Supabase 原始錯誤。**來源：** E04、E05。**現況：** 已有目錄，根網址/提示需整合。

### UX-19｜多店多號碼、一店一進度、LINE postback 最新查詢
**解法 SHOULD：** 同一 LINE 帳號跨店取多張號碼後，進行中/歷史分頁展示店名、我的號碼、目前叫號、前方組數、查詢時間及詳細進度；每店獨立。取號 Flex「叫號進度」postback 必須現查 DB 再回覆一張更新的訊息，「查看即時叫號網頁」導向票券所屬門市；不可聲稱原 Flex 卡文字會自動修改。  
**驗收：** A/B/C 店同時有號碼不混在一起；A 的卡只會查 A；已刪除票券下次刷新不顯示；重置後同號使用 UUID 綁定。**現況：** 已部分完成，需確認與新前綴一致。

### UX-20｜爽約與黑名單規則透明、可申訴
**解法 SHOULD：** 店家可標記 NO_SHOW，保留異動人與時間；可選較輕的提醒/限制，但不可預設一次 no-show 就永久封鎖。應提供店家主管解除、申訴或更正流程，顧客不應看到其他人的資料。  
**驗收：** 一次未到預設仍能訂；店家可更正記錄及解除限制；解除後立即可訂。**來源：** E10。**現況：** 只有未到狀態。

### UX-21｜預約/取號時間精確到秒
**解法 SHOULD：** 顯示 yyyy/MM/dd HH:mm:ss，DB 保存帶時區 timestamp，以門市營業時區呈現，台灣預設 Asia/Taipei；跨日統計看門市 business_date，不能用用戶端系統日界猜。  
**驗收：** 手機/電腦顯示同一建立時間且有真正秒數；跨午夜紀錄不誤分類。**現況：** formatTaipeiCreated 仍僅到分鐘。**程式：** https://github.com/hub-google/LINE/blob/gh-pages/saas/index.html#L448-L454

### UX-22｜店員刪除、取消、還原不能互相混淆
**解法 SHOULD：** 兩個管理頁都有逐筆刪除 checkbox，soft delete 立即隱藏顧客紀錄、不發 LINE；取消要走獨立業務狀態與通知；刪除可在後台「已刪除」恢復，恢復仍要驗證容量/有效狀態，且不得因舊連動邏輯憑空恢復或新增 queue。  
**驗收：** 刪除不通知、取消依規則通知；刷新顧客看不到被刪資料；恢復不會超賣/意外取號；稽核完整。**現況：** soft delete 已有基礎，解耦後仍需回歸測試。

## 101.5 P2：後續競爭力與營運能力

### UX-23｜統計與通知健康度
**解法 MAY：** 商家可看預約/取消/爽約率、平均等候、過號、時段使用率與通知失敗；平台按租戶聚合，監控 LINE OA 推播配額/成本，不跨商家混用資料。**驗收：** 每項指標定義明確，軟刪除如何計入有規範，統計依 SQL 後端聚合而非全量前端掃描。

### UX-24｜服務/餐點選擇更清晰
**解法 MAY：** 預約、取號各自可設定服務項目必填/選填/關閉、價格、預估時長；複選時計算合計時長與預估金額，未接付款前不得標記「已付款」；下架服務仍保留歷史選擇名稱與費用快照。**驗收：** 必填無選項不可送、選填可直接送、下架不破壞歷史。

### UX-25｜錯誤監控、效能、版本更新
**解法 MAY：** 監控登入成功率、預約 RPC 失敗、LINE 推播失敗/延遲、Realtime 斷線、頁面載入速度；每事件有可追蹤 ID，敏感資料遮蔽。部署使用版本化資源與安全更新，使用者無需 Ctrl+F5，但操作/填表中不可突然刷新丟失輸入。**驗收：** 發布後新訪客看到新版本；舊訪客完成當次操作後可安全更新；不得形成登入循環/重複預約。

## 101.6 實作順序、驗收矩陣、並行作業交接（MUST）

1. **開發前盤點**：逐條 UX-01～25 對 main、gh-pages、已執行 Supabase migrations、實際部署 line-bridge 與真機進行比對，標示「未做、部分完成、已做待驗收、已完成」。本章是 2026-11-04 的規劃基線，不可用於覆蓋其他對話其後完成的新功能。
2. **優先次序**：第一批 UX-01～09；第二批 UX-10～22；第三批 UX-23～25。先處理號碼、通知、容量、狀態與資料保留，不能只看到網頁按鈕就宣稱 P0 完成。
3. **測試矩陣**：iOS/Android LINE 內建瀏覽器、手機 Safari/Chrome、Windows/macOS；兩個不同顧客 LINE 帳號、不同手機、兩個店員同時點擊、A/B/C 三商家、跨日/過號/回候位/編號重置、不同字元前綴、已取消/已刪除/復原、無 OA 好友或封鎖、網路中斷與 LINE 429/5xx。
4. **資料/權限硬性規則**：絕不重置或清空正式與 QA 店家、取號、預約；保留 Supabase RLS、後端驗證、稽核、LINE 共用模板與測試門市恢復。金鑰僅用 Secrets，禁止寫入 Git、PRD 或瀏覽器。
5. **每條交付證據**：修改檔案、關聯 API/SQL、是否需 migration、回滾方式、驗收步驟、測試結果、前後狀態、仍有風險與未完成原因；涉及跨層同步必須同一 PR 驗證前端/DB/LINE，不能一邊用新編號另一邊仍用 A001。
6. **跨對話衝突管理**：另個對話如正在開發，只能透過 feature branch + PR 或明確檔案歸屬協作；更新前讀最新 SHA，衝突需人工合併，禁止用整個舊檔直接覆蓋。**此 PRD 更新不是實作授權，本次不執行開發或部署。**


<!-- UX-COMPLETENESS-AUDIT-20261104-START -->
## 101.7 第二輪完整性稽核：補充兩個先前未明訂的情境（2026-11-04，待開發）

> 稽核原競品負評、UX-01～UX-25、gh-pages 前端、2026-11-04 編號 SQL 及 LINE Edge Function，並對照另一個對話維護的[現行 DoYouBook SaaS PRD](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md)。兩份文件重疊項目只能實作一次；本節只補沒有明確寫出的使用情境，不建立平行服務。
>
> **新增來源：** E12：E排客 App Store 評論「不能連續預約兩天」：https://apps.apple.com/tw/app/e%E6%8E%92%E5%AE%A2/id1239652841?platform=iphone&see-all=reviews 。E13：Lineup App Store 評論「強烈建議要截圖」（2019-10-11）指出系統故障與無法查驗預約：https://apps.apple.com/tw/app/lineup/id1087283735?platform=iphone&see-all=reviews 。這是個別評論，並非本產品事故，Lineup 目前亦已轉型。

### UX-26｜同一顧客可預約不同日期，不因已有一筆預約被誤擋（P0；新增）

- **競品風險 E12：** 使用者抱怨已約今天就不能再約明天。
- **現況：待實測。** 原 PRD 尚未明訂同一 LINE 顧客可保有幾筆不同日期的有效預約，不能據此宣稱目前產品已發生此問題。
- **解決方案 MUST：** 以商家、預約 UUID、日期與時間作為獨立事件；不得設定全平台或全門市「已有任一有效預約就拒絕新增」的硬限制。至少允許同顧客在同一店不同日期分別預約，跨店更不得互相阻擋。店家可另外設定「每顧客每日最多 N 筆」「同時間重複預約提醒或禁止」「同服務每日上限」等明示規則；預設不得阻擋不同日期。建立、改期、取消各自由後端驗證容量與資源衝突，不能只檢查是否已有一筆預約。
- **重送冪等：** 同一次按「確定送出」的請求使用 client request ID 與後端冪等鍵，避免網路卡頓後雙擊建出兩筆；但使用者有意預約不同日期時必須正常成立。不得使用 LINE 暱稱作唯一身份依據。
- **驗收：** A 同顧客約 11/04 後可約 11/05；B 已在甲店預約不影響乙店；C 同一 request ID 重試不重複建單/推播；D 每日限額只阻擋符合規則的當日超額，不錯擋明日；E 取消/改期不會刪掉顧客其他預約。
- **關聯：** UX-05、UX-06、UX-07、UX-12、UX-15；現行 SaaS PRD 的 D-01、FR-101～103。必須共用既有 booking RPC 與容量引擎，不另建預約系統。

### UX-27｜正式預約憑證與短暫故障查證流程（P1；新增）

- **競品風險 E13：** 使用者表示預約完成但系統當機，現場無法查驗，因沒有截圖而被要求重排。
- **現況：待實測。** 現有 LINE 卡與預約紀錄可顯示資料，但原 PRD 沒有明確規定系統短暫無法查詢時如何保障顧客及店員操作。
- **解決方案 SHOULD：** 每筆預約成功提供可再次開啟的預約確認頁/憑證，清楚顯示店家、日期時間、服務、人數、預約顯示號碼、建立時間及不暴露顧客個資的參考碼。既有 LINE「預約已成立」卡連回同一筆紀錄；可供顧客截圖或自行保存，不強制另外註冊。店員可透過門市、日期、編號與授權查詢，若提供 QR，必須防竄改並檢查後端最新預約狀態。
- **故障備援：** 顧客端在同步失敗時顯示最後同步時間、可出示已保存的預約確認；不得把快取/截圖宣稱為仍有效的最新預約，因它可能已取消或改期。店員應有受權限管理的最近同步清單或安全的人工備援核對流程，離線核對加註時間及操作者，恢復連線後對帳，防重複報到與資料衝突。資料庫仍是唯一權威狀態。
- **驗收：** A 預約後關網頁，可由 LINE 卡查到同筆；B 暫時斷線時能出示確認記錄但清楚標示非即時；C 已取消/改期的舊截圖不會繞過最新狀態驗證；D 編號重置前後同號不得認錯人；E 恢復服務後可安全核對備援資料、不產生新預約或重複編號。
- **關聯：** UX-02、UX-04、UX-08、UX-09、UX-17、UX-25；現行 SaaS PRD 的 FR-101 及端到端驗收。不得引入另一套與資料庫競爭的預約真相來源。

### 101.7.1 最終完整性核對與並行安全

- 第二輪確認原分析對應的 UX-01～UX-25 均已存入本文件第 101 章；新增 UX-26、UX-27 後為 **27 項需求**。原 E01～E11 與新 E12、E13 合計 **13 個證據索引**（來源有重覆的 App，但對應不同評論）。P0 開發清單另補 UX-26；P1 另補 UX-27。
- 現行 SaaS PRD 的 FR 編號與本文件 UX 編號不是兩套要重複開發的系統；實作對話應按照對照表分工並取最新 Git SHA，不得覆蓋對方提交。此次不碰那份 DoYouBook PRD，以避免與另一個對話衝突。
- **額外規格差異：** SaaS PRD D-02 定義「最多 3 個使用者可見 Unicode 字元（grapheme clusters）」，目前編號 migration 的 SQL 使用 char_length；帶組合字元的文字或部分 emoji 可能顯示為 1 字卻被判定多碼。UX-02 驗收前，工程實作者必須統一前後端判定，不能私自改成只允許英文。
- **修改範圍：** 本次只編輯主需求書此節，不動前端、SQL、Edge Function、LINE OA、GitHub Actions、Secrets、Supabase/QA 資料或正式部署。需求列入不等於已開發完成。
<!-- UX-COMPLETENESS-AUDIT-20261104-END -->

<!-- UX-REVIEW-20261104-END -->

---

<!-- NEXT-MAJOR-RELEASE-20261104-START -->
# 102. 下一次重大改版統合 PRD：DoYouBook × CallMeBack × 原 LINE SaaS 全功能

> 版次：2026-11-04 / NEXT-R1。狀態：**已列入需求、待開發/待實際驗收**；**本次僅修改 PRD.md，不修改程式、部署、資料庫、Secrets、LINE OA 或測試資料**。
> 主文件：本檔 QueueMonster/PRD.md。原第 0–101 節（含 UX-01～UX-27、訂單/部分付款/LINE Pay/RBAC）**完整保留**，本章只增加「下一次大改版」規格及明確衝突裁決，禁止把它當作功能刪除清單。
> 詳細舊競品需求仍可參考 [DoYouBook 58 項原始增補](./saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md)。以「本文件 §102 最後的使用者決定」覆蓋原文件較早的「不採納/延後/可能不做」結論；未涉及的安全、稽核、付款規則繼續有效。
> 範圍決策：**DoYouBook 官網公開呈現的全部功能 + CallMeBack 官網公開呈現的全部功能 + 原本 LINE 平台功能，全部列入下次改版待開發且最終需驗收的功能。不能因功能多自行刪除；使用者日後可以再自行取消。**
> 比較依據：https://www.doyoubook.com/ 、https://www.doyoubook.com/faq 、https://www.doyoubook.com/explore 、https://www.callmeback.com.tw/ 、https://www.callmeback.com.tw/雲端候位 、https://www.cayintech.com/tw/digital-signage-news/t-2p.php?f=20260629 。需店主後台權限的部分標為「官方公開說明/待實測」，不能虛構真實使用操作。

## 102.1 功能完整性與衝突裁決的原則

- **沒有功能刪除權**：下列 A/B/C 為開發*依賴波次*，不代表 B/C 會被取消。任何「商業上不重要、競品還沒有、成本太高」都不是 Agent 自行移除的理由。真的暫時無法實作的依賴第三方功能需標「待外部驗證/串接」並先開發可獨立使用的本地版本。
- **既有功能不能退化**：預約/叫號獨立、編號前綴 0～3 字（預設空）、數字 1～9,999,999 不補零、兩模組各自按鈕手動重置、歷史保留、軟刪除不通知、LINE 恢復預約同一模板、跨店本人資料/真實 QA 門市、服務/菜單/點餐/訂單/付款/退款/分析、總公司 OA/店家 OA 都要保留。
- **兩產品可共用底層，不能強制合流**：核心資料為 Tenant/Branch/Identity/Services、Reservation、Queue Ticket、Visit/Order、Payment、Notification/Calendar/Display；預約狀態變更**不會**自動生成叫號票，叫號也不會改預約狀態；Order/Visit 是獨立可選關聯。
- **功能先完整做出，再依店家配置開關**：提供純預約、純叫號、預約＋叫號、固定場次、容量/座位、每日上限、多窗口、活動等模式；同店可混用多種服務模式，顧客只看到該店啟用的入口。
- **競品事實 vs 我方需求分開**：下表含「官方確認/官方宣稱/合作夥伴已整合/我方加值」。例如 Google Calendar 首頁說雙向但 FAQ 明說單向，我方仍做可選安全雙向，以達成完整規格，但不得說競品現已雙向；「像素風商店街」即便之前認為低價值，也照使用者最新要求實作。
- **防衝突**：GitHub 另一個對話會持續修改程式，交付前要比對最新 main、部署分支、migrations 實際套用與相關 PR；同一需求只能一個責任人，不要重做既有功能。

## 102.2 DoYouBook 逐項功能清單（58/58 全部納入）

下表原先有「延後/不採納」欄位，保留**原始分析紀錄**供追溯，但其決策一律被 §102.1 最新全功能必做原則取代。來源 S1=首頁/更新、S2=FAQ、S3=搜尋、S4=公開店家頁。不可因 C42、C50 或 C58 直接略過功能：C42 遊戲探店必做；C50 單向＋ICS＋可選安全雙向皆做；C58 金流功能仍沿用原 SRS 完整規格（不虛稱競品目前已有）。

| 編號 | 競品功能／細節 | 來源 | 我們的對應解法／需求編號 | 裁決 |
| --- | --- | --- | --- | --- |
| C01 | LINE OA 內預約與 LINE 身分帶入 | S1/S2 | D-03、FR-003、FR-004 | 保留並強化 |
| C02 | FB/IG/QR 純網頁預約，不一定加 LINE | S1/S2 | FR-207，須可選且驗證聯絡方式 | P2 新增 |
| C03 | 客戶自己選服務、日期、時段、人數 | S1/S4 | FR-101、FR-201、UX-05 | 保留並強化 |
| C04 | 服務不同時長、不可撞期 | S1 | FR-101 | P1 |
| C05 | 多項服務／加購自動計算時長 | S1 | FR-101、FR-202 | P1/P2 |
| C06 | 服務價格與服務說明 | S1/S4 | FR-110、FR-202；沿用 so_menu_items | 保留並強化 |
| C07 | 個別服務不對顧客公開耗時 | S1 05/30 更新 | FR-113 | P1 補入 |
| C08 | 預約送出前可開關的二次確認 | S1 05/29 更新 | FR-112 | P1 補入 |
| C09 | 顧客查自己的預約 | S1/S2 | FR-003、FR-108 | 保留並強化 |
| C10 | 顧客自行改期／取消及限制開關 | S1/S2 | FR-103、UX-12 | P1 |
| C11 | 客戶取消冷卻期（預約前 N 小時） | S2 | FR-103 | P1 |
| C12 | LINE 成立、修改、取消通知 | S1/S2 | FR-004、FR-104、FR-306 | 保留並強化 |
| C13 | 預約前 N 小時提醒 | S1/S2 | FR-104、UX-13 | P1 |
| C14 | 店員代客建立電話或現場預約 | S1/S2 | FR-105 | P1 |
| C15 | 依驗證電話將非 LINE/LINE 顧客關聯 | S2 | FR-117（禁止只靠同名/未驗證電話合併） | P1 補入 |
| C16 | 店員今日/本週預約列表 | S1 | FR-119、UX-14 | 保留並強化 |
| C17 | 日/週/月曆、當日標記 | S1 05/29 更新 | FR-119、UX-14 | P1 補入 |
| C18 | 行事曆顯示各場名額、超收警示 | S1 08/04 更新 | FR-119、FR-201、UX-14 | P1/P2 |
| C19 | 客戶抵達按鈕（已到店） | S1 08/14 更新 | D-01、FR-001、FR-114 | 保留並強化，絕不產生叫號 |
| C20 | 日期經過後顯示完成 | S1 08/14 更新 | FR-114（區分顯示判定與真實完成） | P1 補入 |
| C21 | 每服務每日可接受名額上限 | S1 09/18 更新 | FR-201；授權超收另依 FR-118 | P2 |
| C22 | 固定場次完整起訖與每場名額 | S1 09/10 更新 | FR-201 | P2 |
| C23 | 座位制依同時占用人數計算 | S1 09/11 更新 | FR-201 | P2 |
| C24 | 不限時方案可待到打烊 | S1 09/11 更新 | FR-201 | P2 |
| C25 | 票種／大人小孩／數量計價 | S1 08/27 更新 | FR-202 | P2 |
| C26 | 服務中改項目、加購、換方案 | S1 09/19 更新 | FR-202、FR-118 | P2 |
| C27 | 現場調整項目撞期先提示 | S1 09/19 更新 | FR-101、FR-118 | P1/P2 |
| C28 | 包場、封鎖多個時段 | S1 08/09 更新 | FR-203 | P2 |
| C29 | 一週營業時間、午休／特別休假 | S1/S2 | FR-102、UX-15 | P1 |
| C30 | 依服務人數重複顯示自訂欄位 | S1 08/04 更新 | FR-204 | P2 |
| C31 | 未來漲價、期間優惠、成交價快照 | S1 08/25 更新 | FR-303 | P3 |
| C32 | 顧客簿、歷史紀錄 | S1/S2 | FR-108 | P1 |
| C33 | 店家 LINE 好友但從未預約名單 | S1 09/01 更新 | FR-304（僅自有 OA + 授權可用） | P3 |
| C34 | No-show 警示與黑名單 | S1 | FR-109、UX-20 | P1 |
| C35 | 黑名單可只記錄或攔截預約 | S1 | FR-109 | P1 |
| C36 | 客戶資料 CSV 匯出與可攜 | S1/S2 | FR-111 | P1 |
| C37 | 店家封面／圖示／介紹／主題色 | S1 | FR-110 | P1 |
| C38 | 手機即時預覽品牌頁 | S1 05/29 更新 | FR-110、FR-119 | P1 |
| C39 | 公告、價目表及多圖片滑動 | S1 07/28 更新 | FR-110 | P1 |
| C40 | 預約頁與店家獨立分享網址 | S1/S4 | FR-110、FR-305 | 保留並強化 |
| C41 | 公開找店、搜尋店名、商家分類 | S3 | FR-305 | P3 |
| C42 | 像素風遊戲化找店地圖 | S3 | 第 11 節明確不做，不替代有用搜尋 | 延後/不採納 |
| C43 | 商家開店精靈與測試預約 | S1 09/18 更新 | FR-106 | P1 |
| C44 | LINE OA 設定精靈／通知開關 | S1/S2 | FR-106、FR-306、§5 | P1/P3 |
| C45 | 店主自己的 LINE OA／使用平台 OA | S1 | §5、FR-106；不可宣稱我們已自助綁定 | P1 |
| C46 | LINE OA 1 店限制、多人員管理未完全支援 | S2 | FR-115（我們可做產品差異） | P1 補入 |
| C47 | 店家 PWA 可加主畫面 | S1 06/08 更新 | FR-107 | P1 |
| C48 | 新預約 Web Push、不吃 LINE 訊息額度 | S1 06/08 更新 | FR-107、FR-306 | P1/P3 |
| C49 | Google Calendar 寫入、可選專用日曆 | S1/S2 | FR-205；**僅單向** | P2 |
| C50 | 官方首頁稱雙向，但 FAQ 明說不回讀 | S1/S2 | 不承諾雙向，不接受 GCal 原地變更為訂單更新 | 不採納雙向 |
| C51 | ICS 訂閱取代 GCal 雙向同步 | S2 | FR-205 | P2 |
| C52 | LINE 訊息額度、通知整體開關 | S2 | FR-306 | P3 |
| C53 | 不支援每位顧客個別通知開關 | S2 | 我們可留 FR-118/FR-306 逐事件/目的收件對象設定 | 差異化，不當成競品功能 |
| C54 | 免費試用、未來 299 元/月 | S1/S2 | FR-307（明確分離商家 SaaS 訂閱與顧客付款） | P3 補入 |
| C55 | 店家一鍵匯出資料離開 | S2 | FR-111、FR-307（資料可攜與取消方案不綁死） | P1/P3 |
| C56 | LINE 真人客服入口 | S1/S2 | 現有平台 OA 客服入口；不與顧客的預約/取號流程混用 | 保留 |
| C57 | 網頁不下載 APP、客戶操作精簡 | S1 | §7、D-03、FR-112；手機電腦同一自適應網址 | 保留 |
| C58 | 目前缺明確訂金／線上付款公開實作證據 | S1/S2 | FR-302 金流方案只規劃，不謊稱競品已做 | P3 |

### 102.2.1 舊「不做/非優先」決策已覆蓋的明細

- **遊戲化商店街**：做一般列表/地圖搜尋及 2D 像素風 RPG 探店模式（可切換、支援手機操作與無障礙、商家上架 opt-in）。
- **非 LINE 純網頁預約**：做，但讓店家可開關。LINE 顧客繼續「免填姓名/密碼」；非 LINE 訪客經安全電話驗證/查詢，不得查到其他人。
- **Google Calendar**：支援單向同步、唯讀 ICS 及可選雙向提案審核模式，不允許直接在 Google Calendar 破壞本地資源/付款一致性。
- **每客通知開關與 LINE 好友 CRM**：做；LINE 好友資料仍必須符合 Provider/官方 API 授權及個資合規要求。
- **支付**：保留原 PRD 全套 LINE Pay、信用卡/轉帳可用性評估與合規實作、現場付款、訂金、部分付款、退款、對帳、item-level allocation；不能在未獲准代收/資格下假稱已正式收款。
- **DoYouBook 有而本系統缺的店家預約設定**：預約確認開關、服務分鐘可顯示/隱藏、套餐加購、價量快照、固定場次/不限時/座位、日/週/月曆、包場、臨時假、客戶簿、黑名單、CSV、PWA、新預約推播、LINE OA 導入精靈、品牌公告照片、價格排程、通知配額、預約提醒，全部做完驗收。

## 102.3 CallMeBack 逐項功能/合作能力對照（32 項均納入）

來源：「官網」https://www.callmeback.com.tw/ ；「候位頁」https://www.callmeback.com.tw/雲端候位 ；「鎧應公告」https://www.cayintech.com/tw/digital-signage-news/t-2p.php?f=20260629 。K29–K31 是為了達成產業情境而提出的我方額外工程規格，並非宣稱競品已公開後台細節。合作夥伴展示的能力不等於我們已取得對方私有 API。

| ID | CallMeBack 功能/場景 | 可追溯來源 | 我方下一版必做解法 | 證據等級 |
| --- | --- | --- | --- | --- |
| K01 | LINE 掃 QR Code 使用雲端候位 | 官網/候位頁 | 顧客掃門市 QR 後可由 LIFF 直接取號，LINE 暱稱帶入，無需帳密 | 已公開 |
| K02 | 遠端免排隊取號 | 官網/候位頁 | 店家控制遠端開放、時段與每人可取張數，取號與現場共用後端 | 已公開 |
| K03 | 選候位/用餐人數（如 2–8 人） | 候位頁 | Ticket.party_size，可選店家自訂人數選項、桌型/隊列分流 | 已公開 |
| K04 | 電子號碼牌／隨時查目前進度 | 官網/候位頁 | 即時當前號、前方組數、時間戳、跨店個人持號 | 已公開 |
| K05 | 顧客取消候位 | 候位頁 | 取消確認、釋出名額、單一票券變更，不動 Reservation | 已公開 |
| K06 | 顧客保留候位 | 候位頁 | HOLD/RESUME、到期、退回位置與次數策略，可見公平規則 | 已公開 |
| K07 | 接近到號自動提醒 | 官網 | N 組提前提醒，事件去重、LINE 配額控制與未送達處理 | 已公開 |
| K08 | 叫號自動 LINE 通知進場 | 候位頁 | 後端 outbox；卡片可開即時網頁、主動查最新進度 | 已公開 |
| K09 | 商家查看候位清單 | 候位頁 | 分場次/人數/服務/狀態列表、排序、搜尋、變更紀錄 | 已公開 |
| K10 | 商家點選指定號碼並發通知 | 候位頁 | 下一位、指定叫號、重叫、過號/回候位、操作稽核及防重複 | 已公開 |
| K11 | 商家確認顧客入場 | 候位頁 | CALLED、ARRIVED/ADMITTED、SERVING、COMPLETED 分開 | 已公開 |
| K12 | 早／午／晚／休場次切換 | 候位頁 | 手動切換場次，休息停新號；舊號仍保留，切換不是重置流水 | 已公開 |
| K13 | 免購專用硬體、雲端後台 | 候位頁 | 單一響應式後台，可裝 PWA；看板可直接用電視瀏覽器 | 已公開 |
| K14 | 多裝置即時同步 | 官網 | Realtime/輪詢備援，兩店員併發鎖，跨裝置一致 | 官網宣稱 |
| K15 | 同一平台整合多家店 | 官網 | 總公司 OA、店家自有 OA、跨店本人取號查詢與租戶隔離 | 已公開 |
| K16 | 附近店家搜尋 | 官網 | 依縣市、地區、距離、開放營業、候位及可約服務過濾 | 官網宣稱 |
| K17 | 即時線上預約入口 | 官網 | 完整預約排程模組，但與候位/叫號各自獨立 | 官網宣稱 |
| K18 | LINE OA 入口與圖文選單 | 官網/候位頁 | 平台 OA 和商家自有 OA 均提供入口、設定精靈與測試 | 已公開 |
| K19 | 排隊數據分析 | 官網 | 入隊、入場、未到、放棄、平均等待、分時段與人數統計 | 官網宣稱 |
| K20 | QR Code 立牌/A4 海報推廣素材 | 官網/FAQ | 店家可自行輸出列印 PDF/PNG、LOGO、店名、說明、門市 QR | 已公開 |
| K21 | 可與既有叫號機/系統商合作 | FAQ | 自行提供設備/夥伴 API、授權碼、簽名 webhook、測試環境 | 合作意向 |
| K22 | 點餐與 POS 整合場景 | 候位頁 | 將票券與 Catalog/Order/Payment 可選關聯；不強制預約入隊 | 合作場景 |
| K23 | 政府/診所/捐血/活動/遊樂場場景 | 候位頁 | 多窗口、多隊列、隱私遮罩、無障礙、大量場次模板 | 合作場景 |
| K24 | 數位看板顯示目前號碼 | 鎧應公告 | 全螢幕 TV 看板、更新狀態、門市/窗口隔離，資料延遲標示 | 夥伴已整合 |
| K25 | 單螢幕多組號碼 | 鎧應公告 | 多隊列與窗口顯示排版、獨立排序及品牌設定 | 夥伴已整合 |
| K26 | 號碼與促銷廣告同框 | 鎧應公告 | 看板設計器，圖片/影音/QR/即時叫號資訊同屏輪播 | 夥伴已整合 |
| K27 | 商家代碼快速接看板 | 鎧應公告 | 我們設可撤銷之綁定碼、低權限 device token，而非直接複製競品私有 API | 夥伴已整合 |
| K28 | 14 天試用與專案報價 | 官網 FAQ | 我們的商家 SaaS 試用/訂閱/超額/客服/到期/資料匯出完整流程 | 已公開 |
| K29 | 多櫃檯與分流規則 | 擴充設計 | 指定服務窗口、專屬隊列及號碼看板，不聲稱對手後台已公開 | 我方加值 |
| K30 | 設備/POS 開放 API 與 sandbox | 擴充設計 | 可驗證第三方接口、測試 Key、配額、Webhook 重試；不假稱已與任一廠商正式合作 | 我方加值 |
| K31 | 通知/場次/設備斷線備援 | 擴充設計 | 事件歷史、最後同步、訊息失敗處理，恢復後對帳且不重複叫號 | 我方加值 |
| K32 | 無紙化／ESG 效益統計 | 官網主張＋我方方案 | 統計電子取號張數/平均等待，不虛構減碳量與業績增幅 | 我方加值 |

### 102.3.1 CallMeBack 特別關鍵的功能設計

- **選候位人數**：Ticket 是「一組」，party_size 是人數。「前面 X 組」看候位隊伍有效組數，不用票號相減；另外可顯示前方總人數，桌型/窗口以資源適配，需讓客戶知道跳號理由。
- **保留候位**：不是取消，獨立 HOLD/RESUME；店家可設定保留次數、期限、返回原位/末尾/延後 N 組及通知，未經允許不可長期霸佔順位。
- **早/午/晚/休**：場次切換只影響新取號或當前顯示，不等於「重置編號」；已成立號碼不可在跨場/跨午夜時自動刪除。
- **確認入場**：叫號 CALLED、到場 ARRIVED、進場 ADMITTED、服務中 SERVING、完成 COMPLETED 應有獨立業務事件與報表；Line API 成功不代表客戶已到場。
- **免費瀏覽器看板**：先提供 TV/平板/電腦的 full screen 即時叫號頁、每窗口/隊列號碼/QR/同步時間；再支援多號碼與廣告促銷同屏、看板登入碼與合作設備接口。
- **QR 立牌、A4 海報**：店家自行產生品牌化 PDF/PNG，內容含商家名稱、掃碼連結、注意事項與 LINE 取號說明；印刷服務如要另購，不能影響免費輸出功能。
- **硬體/合作開放接口**：自建 read-only/受控操作 API、可撤銷 token、Webhooks、簽章、沙盒及速率限制；未經廠商認證不能標示與 CAYIN 原廠產品直接相容。

## 102.4 下一版完整子系統及最終頁面

| 模組 | 下一次版本全部要交付的能力 | 可進入的頁面/角色 |
| --- | --- | --- |
| 商家開通 | 商家申請/審核、免費試用、LINE/純網頁模式、通知測試、步驟精靈、QR/圖文選單、服務及時段設定 | 總公司/店主 |
| 預約 | 服務/價格/時長/緩衝、員工/房間、固定場次、座位容量、每日上限、不限時、包場、價量/優惠/加購、預約確認、改期/取消、提醒、客戶自訂問題與憑證 | 顧客/店員/店主 |
| 現場取號 | 多人候位、遠端/掃碼、電子號碼牌、即時前方組數、保留/恢復/取消、跨店追蹤、LINE 更新訊息 | 顧客 |
| 叫號管理 | 下一位、指定號、過號、再叫、返回候位、順序重排、早午晚休、多窗口/桌型、進場/完成、刪除與可恢復 | 店員/店主 |
| 顯示 | 全螢幕 TV 叫號板、多窗口多號碼、品牌主題、廣告+叫號、最後同步時間、看板配對碼、設備 API | 店員/螢幕/合作商 |
| LINE | 平台 OA 或每商家自己的 OA、LIFF、圖文選單、Flex 共用樣板、通知 outbox、提醒/撤銷、各店配額、跨 Provider 權限 | 顧客/商家/平台 |
| 搜尋與品牌 | 公開 opt-in 店家、縣市/位置/距離/類別/營業/容量、地圖/普通列表/像素風商店街、店家 LOGO/封面/公告輪播/SEO 分享頁 | 顧客/店主 |
| CRM | 客戶簿/LINE 好友（授權才可）、未到/黑名單/申訴、驗證電話身分配對、CSV 匯出/資料可攜、客戶改期歷史 | 店主/授權店員 |
| 付款 | 顧客訂金、LINE Pay/信用卡/合規轉帳/現金、部分付款/每品項付款/補款/退款/對帳、方案月費/試用分帳 | 顧客/店主/平台 |
| Calendar/PWA | Google Calendar 單向＋可選安全雙向/ICS、手機可安裝 PWA、新預約 Web Push/站內訊息 | 店員/店主 |
| 營運 | 店員多角色/多分店、營業週期/例外、排班、預約/候位效率、到店/未到率、通知成本、商品營收、CSV、POS/設備整合 | 店主/平台 |
| 維運/客服 | 教學/真人客服入口、問題紀錄、操作 audit、日誌/錯誤、資料備份、權限、裝置撤權、安全更新、原測試商家保留 | 平台/授權店主 |

## 102.5 服務與隊列的正規化資料模型（規劃，不在本次 migration）

- 共用：Tenant、Branch、Owner/Manager/Staff、VerifiedLineIdentity、PhoneVerifiedGuest、BusinessGroup、Brand、OperatingHours/Exceptions、Service/Menu、Audit。
- 預約專用：Reservation、ReservationItems/PriceSnapshot、ServiceDuration/Buffer、AvailabilityAllocation、Staff/ResourceSchedule、FixedSession、DailyCap、Blockout、CustomFields、ReservationEvent、Reminders。
- 叫號專用：Queue、QueueSession(早午晚休)、QueueGroup/Window/TableType、QueueTicket、TicketPartySize、TicketHoldPolicy、QueueEvent、QueueNumberingEpoch、AdmissionEvent。
- 可選跨領域：Visit/Order、OrderItem、PaymentAllocation、PaymentGatewayTransaction、Refund/Reconcile；原本純預約/純叫號不可被迫建 Order。
- 通知/整合：NotificationOutbox/DeliveryAttempt/ChannelBinding、WebPushSubscription、CalendarSync/Proposal/ICS、SignageDisplay/DeviceToken、PartnerApiKey/WebhookDelivery、QrPosterAsset。
- CRM/商業化：CustomerProfile/IdentityLink/Consent/Flag、MerchantPlan/Subscription/Usage、AnalyticsAggregate、CustomerExportAudit。
- 所有資料以 merchant_id + branch_id + UUID 規範隔離，顯示號可在不同 epoch 重複，UUID 永不重用；執行任何 migration 前先查既有 so_ 表，**優先 additive migration + backfill**，不 truncate、不換租戶、不重建測試帳號。

## 102.6 重要邏輯衝突與最終解法（開發 Agent 不得自行改回舊規則）

完整衝突裁決如下。原需求如有同名功能仍保留，將其互相牴觸的實作方式改為本表「最終解決方案」，任何延期/變更要明列風險並由使用者決定。

| 衝突 ID | 明顯衝突 | 產生問題 | 最終解決方案（**不得刪功能**） | 驗收 |
| --- | --- | --- | --- | --- |
| CF-01 | 「預約到店」與「叫號作業」 | 舊 SRS 稱報到自動產號；最新使用者要求完全分離 | Reservation 報到只更新 reservation；Queue 需顧客/員工另行取號，Order/Visit 可以**選擇性**同時關聯兩者但不改任一狀態 | 預約 CONFIRMED→CHECKED_IN→COMPLETED，ticket 數不變；獨立取號不改預約 |
| CF-02 | 「手動重置從 1」與「舊有效號碼仍存在」 | 舊批次與新批次會同號、甚至同店同號 | tenant+branch+module+epoch+sequence 唯一；display_prefix 與 display_no 保存快照；後台遇同號顯示批次/建立時間，所有操作用 UUID+epoch | 重置前後同有 1 號，叫/刪/推播不誤操作；不同模組各自重置 |
| CF-03 | 「早午晚休切換」與「編號重置」 | 若切場就歸零會誤刪或產生混淆 | 營業場次 session 與 numbering_epoch 完全分離；切換只改可取號/顯示範圍，不改舊票；重置僅按獨立按鈕 | 早→午切換後早場待辦仍保留，編號不意外從 1 開始 |
| CF-04 | 「客戶保留原順位」與「排隊公平」 | 保留期間不在場會阻擋其他人或插隊 | 店家明示選原順位/退到末尾/延後 N 組/期限；保留時不佔當前待叫名額，恢復依既定策略插入；策略變更留 audit | 前方組數即時正確，保留票券不會被叫到；同時恢復不跳號 |
| CF-05 | 「叫號通知」與「確認入場」 | 叫到不代表已抵達或完成 | WAITING→CALLED→ARRIVED/ADMITTED→SERVING→COMPLETED；PASSED/HOLD/CANCELLED 各自分支，通知只標已通知 | 叫號後未到不自動入場，服務報表只算實際入場 |
| CF-06 | 「多櫃台/桌型先服務」與「按號先後公平」 | 2人桌與6人桌可用資源不同，單序列難兼顧 | 號碼只作識別，排序獨立；按服務/桌型/窗口設定容量與可調權重；跳過理由透明，主管指定插隊留 audit | 不同桌型能叫合適人數，不會被號碼大小錯誤控制 |
| CF-07 | 「LINE 訊息即時更新」與「LINE 卡片靜態」 | LINE Flex 已送出內容不會自己無限更新，頻繁推播有額度限制 | 網站/看板 Realtime；LINE 卡顯示事件快照、時間戳；「叫號進度」主動查 DB 再回一則新訊息，另有「查看即時叫號網頁」 | 開舊卡不被宣稱即時；點查詢獲最新狀態；各店獨立計數 |
| CF-08 | 「總公司共用 OA」與「店家自有 OA」 | 不同 LINE Provider 可能識別 ID 不通用，錯用會誤發或串戶 | 每筆通知指定唯一 sender/channel/provider；身分加已驗證 mapping；跨 Provider 不用相同 ID 字串硬合併，切換模式提示重新加入/授權 | A 店綁自有 OA 後，B 店通知不從 A 發；不出現跨人資料 |
| CF-09 | 「LINE 一鍵免填姓名」與「非 LINE 網頁預約」 | 強迫顧客填電話會破壞 LINE-first 既定 UX | 兩種路徑並存：LINE 授權自動名稱/身份；非 LINE 訪客啟用姓名/電話 OTP 或安全查詢，商家可獨立開關 | LINE 顧客可零填預約，非 LINE 經驗證可下單且無法查別人的單 |
| CF-10 | 「相同電話配對」與「防身分冒認」 | 姓名/電話字串相同不等於同一個人 | 只有經 OTP 驗證且持有人同意才合併線下/LINE 客戶檔；保留來源及拆分稽核 | 他人輸入相同電話不會取得原顧客歷史 |
| CF-11 | 「服務時長/資源排程」與「只看每時段人數」 | 用全店 slot_capacity 會把座位/固定場次/美業時長算錯 | 統一 availability engine：TIMED_RESOURCE、FIXED_SESSION、CAPACITY_INTERVAL、DAILY_CAP；服務有 duration/buffer、資源與人數占用；交易鎖查真正容量 | 同一資源 90 分鐘不可中途再訂；上午退場不占下午座位 |
| CF-12 | 「店員超收/強制修改」與「不超賣」 | 店員臨時改加購、包場可能擠掉其他預約 | 預設阻止衝突；主管受控 override 需顯示被影響的訂單、提供原因與稽核；物理不可能履行者不能覆寫 | 一般員工無法超額；主管覆寫有完整 log、不能抹掉其他單 |
| CF-13 | 「時間到自動完成」與「實際未報到」 | 時間經過不代表有人到、服務完成或有付款 | 顯示層的『預計結束』與資料庫 COMPLETED 分開；自動完成可選且要求已報到/非取消/非刪除/已超過緩衝並留 audit | 未到者時間過了不會自動標完成，也不會產生叫號 |
| CF-14 | 「取消/改期/恢復」與「名額/通知/付款」 | 改期後舊提醒照發、恢復滿額、付款價差不符 | 交易先檢查 version、容量、時限、付款差額；成功後取消舊通知排程、建立新事件；取消轉已預約使用原樣板並發新成立通知；已付款走退款/補款 | 已額滿不能恢復；改期僅收新提醒；已付款價格保持會計一致 |
| CF-15 | 「Google Calendar 雙向」與「資料庫唯一真相」 | 競品首頁宣稱雙向、FAQ 實際僅單向，第三方事件修改會繞過本地庫存與付款 | 單向+ICS 直接提供；另做**可選安全雙向**：外部變更成為提案，先通過本地版本/容量/權限/收款檢查後才提交，衝突需人審 | 雙向外部撞期時不覆蓋有效預約，單向仍可使用 |
| CF-16 | 「刪除資料讓客戶看不到」與「歷史/稽核/通知」 | 直接硬刪會破壞付款與歷史；軟刪仍存在可能被漏查顯示 | deleted_at 隱藏顧客公開畫面與有效隊列/名額，後台保留可還原與 audit；刪/恢復軟刪**不發 LINE**；業務取消另外處理 | 刪後顧客不見且不收到訊息；付款與歷史稽核仍可查 |
| CF-17 | 「多商家匯總」與「商家資訊隔離」 | 總公司可跨店看，不表示店家 A 可看 B 客戶 | 全平台顧客只看本人所有店的紀錄；各店只看授權的本店/分店；平台客服另依 RBAC 與操作稽核 | 改 URL/UUID 不能讀他店資訊；跨店進度仍可供本人查看 |
| CF-18 | 「候位頁/公開看板」與「個資隱私」 | 電視公播可能洩漏真名、電話、醫療資訊 | 看板僅輸出顯示號/必要窗口/模糊狀態；公開資料 API 最小化、可撤銷 device token；私密聯絡資料不入畫面 | 匿名路人開看板不能取得任何顧客姓名/LINE ID/手機 |
| CF-19 | 「設備接入」與「不依賴外部硬體」 | 若必須合作廠商才能叫號，平台失去低成本優勢 | 優先完成瀏覽器看板；同時提供 vendor-neutral 只讀 API/授權寫入 API、webhook、沙盒；合作品牌必須測試後才宣稱相容 | 無廠商帳號也能以 TV 顯示；API 停機不影響主系統 |
| CF-20 | 「PWA/Push 通知」與「LINE 已有通知」 | 店員推播/LINE 重複，配額與裝置權限不同 | 店員以 Web Push/站內通知為主、顧客以 LINE 為主；商家依事件設定收件渠道/降級策略，離職即撤訂閱 | 同一顧客不因兩種 OA 重複接同事件；店員沒授權 Web Push 仍能作業 |
| CF-21 | 「商家 SaaS 收費」與「顧客交易收款」 | 月費/訂金/LINE Pay 不同帳務與法律責任 | 商家 subscription/invoice/usage 與顧客 order/payment/allocations/refund 兩套總帳邏輯；只有取得通道資格才上線真金流 | 商家扣月費不會視為顧客付款，退款不影響方案 |
| CF-22 | 「找店家公開曝光」與「商家隱私/地理定位」 | 未公開門市被搜到、客戶拒絕定位查不到店 | 店家必須 opt-in 上架；定位屬可選，拒絕時以行政區/名稱搜尋；遊戲化像素地圖和標準列表並存且同權限 | 未公開店不出現在兩種模式，拒絕定位仍可搜尋 |
| CF-23 | 「完整功能都要做」與「大改版風險」 | 一次大規模改資料表/前端易覆蓋正在開發的功能或洗掉 QA 資料 | 全部納入必做範圍，按依賴分 A/B/C 波次交付；小 PR、最新 SHA 合併、Feature Flag、回滾與 DB additive migration，階段不能用刪功能來縮水 | 舊預約/號碼/測試帳號/LINE Flex 樣板不消失，並行 PR 無覆蓋 |
| CF-24 | 「號碼先給 1」與「不同日期反覆預約」 | 同一使用者有明天與後天預約可能被一人一單限制誤擋 | 預約以 UUID 分筆，僅可設定每日筆數/同時間重複規則；後端用 request_id 對單次提交去重，不用 LINE user_id 當唯一預約 | 同一 LINE 顧客可預約兩天，雙擊同一次只建立一筆 |
| CF-25 | 「已送預約憑證」與「臨時網路中斷/後來取消」 | 舊 LINE 圖/截圖可能被誤當最新狀態 | 離線顧客顯示最後同步時間與參考碼；店員核對最近快照與 DB 最新狀態，復線對帳；失效憑證不等於有效新預約 | 斷線有可展示憑證，復線後已取消單不被誤報到 |
| CF-26 | 「價目/時長對客隱藏」與「排程/付款資訊透明」 | 隱藏內部分鐘數若連價格/到店時間都不揭露會誤導 | show_duration_to_customer 只控制顯示，不影響容量；付款前仍呈現實際應付金額與服務範圍/到店時間；歷史快照不覆寫 | 客戶看不到隱藏時長，但不能意外訂到衝突且收費明確 |

### 102.6.1 必須同時成立的 Domain Invariants

1. **預約與叫號分離**；預約 CHECKED_IN/COMPLETED 不能自動增刪/改 Ticket，僅有顧客或授權店員另外明確取號才可建立 Ticket。
2. **顯示號與資料主鍵分離**：店家/分店/模組/epoch/sequence 皆受後端交易約束，重置只影響新資料，舊號保留；同號不導致誤通知/叫號。
3. **排隊順位與號碼分離**：保留候位、過號回隊列、桌型/窗口、主管指定插隊都必須由 queue_ordering 規則和 append-only event 決定，不得只用數字差計算。
4. **實時與 LINE 訊息分離**：網頁/看板 Realtime，LINE 為事件訊息/按需查詢；店家和平台 OA 不能同事件重複推播。
5. **商業真相由資料庫主導**：第三方 Calendar、硬體看板、LINE API、Web Push、付款 redirect 都只是外部訊息，不能替代 DB 交易與狀態。
6. **沒有越權覆寫**：顧客無法改他人資料；店員無法跨店；主管覆寫有原因與審計；交易不可超賣不可重複付款。
7. **刪除不是取消**：soft delete 即時從客戶顯示/有效候位名額隱藏，不發 LINE；取消/恢復依業務事件發共用模板；付款歷史需依法保留。
8. **手機電腦同一入口**：不開兩套不相容的網站，LINE-first 免填資料，非 LINE 走可選獨立驗證。
9. **資料/測試保留**：正式與 QA merchant、歷史票券、已建立的預約、員工與已連 LINE OA 不因上線被重置，版本快取更新不強迫 Ctrl+F5。
10. **功能完整**：原 PRD 第 0–101 節及本第 102 節功能清單全部納入總驗收；不得以技術債、行銷取捨、競品尚未上線為由擅自刪減。

## 102.7 大改版交付順序（所有波次都是必做）

**A 波：正確性與共用底座**
- 盤點並驗收現有預約/叫號完整分離、獨立前綴與重置、LINE/OA、身份與跨店、日/週/休息規則、客戶軟刪除、outbox、測試資料保留；未完成者補齊。
- 統一 service/resource/availability 的時長/座位/固定場次/每日上限計算，最後一個名額後端防超賣；同顧客跨日期預約與單次提交冪等。
- 候位人數、HOLD/RESUME、場次切換、ARRIVED/ADMITTED；完整多店/多窗口狀態機、LINE「叫號進度」查詢。
- TV 看板可用的只讀全螢幕頁與可靠 Realtime；客戶預約確認/恢復同 LINE Flex 及斷線憑證。
- API/資料模型/角色/通知預算與特定缺陷一併有可查自動與手動測試。

**B 波：完整營運與兩競品差異能力**
- 完整商家開店精靈、服務加購/票種/價格快照、預約二次確認、時長可顯示開關、取消/改期與提醒；日/週/月曆、員工/資源、包場及自訂問答。
- 客戶簿、No-show/黑名單、好友名單（授權）、CSV；商家品牌店面、多圖公告、QR 立牌/A4 海報。
- 店家自有 OA 的完整多 Provider 安全連線、WebPush/PWA、ICS 與 GCal 單向、進階大螢幕多組叫號與促銷同框。
- 多分店/商家管理、後台/站內客服與第三方 read-only API、通知配額/錯誤維運。

**C 波：商業化、平台生態及全部加值**
- 搜尋/地圖/像素遊戲商店街三模式全部完成；附近店家、分類、地理與 SEO。
- Google Calendar **可選安全雙向**、完整合作 API/Webhook/POS/硬體 sandbox、導覽/大型活動/醫療/政府窗口模板。
- LINE Pay/信用卡/其他具資格支付、訂金、部分付款、退款對帳；商家 SaaS 訂閱/試用/額度/資料匯出。
- 進階分析/轉換/營收/時段/ESG（可驗證數值）、完整設備與通知健康監控、壓力/負載與災難恢復測試。

**重要**：A/B/C 只為避免互相衝突的技術依賴，**使用者要求的是最終全部交付**。不能只完成 A 波就宣告「所有競品功能已做」。

## 102.8 端到端驗收矩陣（最小可接受集合）

| ID | 測試情境 | 期望結果 |
| --- | --- | --- |
| NR-01 | LINE 授權預約/取號；非 LINE 純網頁預約 | LINE 免姓名/密碼、訪客安全驗證；資料不混人 |
| NR-02 | 預約報到/取消/完成；另外自行取號 | 預約絕不自動加 queue，兩邊互不干擾 |
| NR-03 | 編號空白/3字前綴；手動重置與跨午夜 | 新序列從 1，舊號/原 UUID 不變，同號不誤叫 |
| NR-04 | 同一 LINE 顧客連續兩天預約；重試同請求 | 可約不同日，重試不產重複單 |
| NR-05 | 90 分鐘服務、30 分鐘緩衝、指定員工 | 該資源重疊時段不可約，沒有超賣 |
| NR-06 | 上午離開座位、下午另客入場 | 容量依時間占用，下午不被上午錯誤額滿阻擋 |
| NR-07 | 固定課程、包場、每日總名額、不限時至打烊 | 各自剩餘名額與時段真實、可取消恢復 |
| NR-08 | 人數候位、2人桌/4人桌、多窗口分流 | 一筆 Ticket 是一組，可正確安排資源、顯示前方組數 |
| NR-09 | HOLD/RESUME/取消、逾期、過號回隊列 | 公平規則可見、順序可稽核、不誤叫 |
| NR-10 | 早診→午診→休息；仍有早診有效號 | 不刪舊票，休息不收新號，切場不重置 |
| NR-11 | 已叫號、已通知、已到店、已入場、服務完成 | 每狀態可分辨、統計不同、不自動互相混淆 |
| NR-12 | 雙店/多櫃台/兩店員併發操作 | 後端防重複、跨店資料絕緣，不錯叫 |
| NR-13 | 顧客網頁即時更新、LINE 卡舊快照、按進度更新 | 網頁更新且可讀最後刷新時間，LINE 按需產新訊息 |
| NR-14 | LINE 失敗/額度耗盡/取消後恢復預約 | 預約真實成立；通知失敗可查，恢復同一樣板重送 |
| NR-15 | TV 全螢幕、一畫面多窗口、促銷同屏 | 只顯示允許公開的號碼；離線時間標示、數據不混店 |
| NR-16 | QR/A4 立牌下載；掃描不同門市 QR | 可列印 PNG/PDF，導到正確店家與場次 |
| NR-17 | 店主開店精靈綁平台 OA 或自有 OA | 憑證不外洩，通知只由正確渠道送出 |
| NR-18 | GCal 單向、ICS、雙向衝突變更 | 本地 DB 權威，外部撞期只能提案待審，不破壞預約 |
| NR-19 | PWA/Push 提醒；店員離職/撤權 | 未授權裝置不再收到內部通知，未支援裝置可用網站 |
| NR-20 | 預約改期、取消、刪除、已付款價差 | 容量/提醒/付款/稽核一致，軟刪除不發 LINE |
| NR-21 | 顧客簿跨店、黑名單申訴、匯出 CSV | 店家只能看本店；匯出安全且資料可攜 |
| NR-22 | 搜尋、地圖、像素商店街、拒絕定位 | 三模式都有，未上架店不可見，無定位仍可搜尋 |
| NR-23 | 訂金/付款/退款/分配/方案月費 | 付款冪等、後端確認成功、客戶與 SaaS 帳務分開 |
| NR-24 | 連結外部 POS/設備 API，用看板驗證 | 跨商家 token 不通、撤銷生效、合作失敗不影響叫號 |
| NR-25 | 既有 QA/正式資料及跨版本升級 | 不清空資料、不誤派通知、沒有假資料；多裝置可回歸 |
| NR-26 | 大容量假資料、前端效能與安全 | 後端分頁、RLS/權限/事件冪等/監控、資訊不洩漏 |

## 102.9 開發 Agent 必須採用的並行衝突處理

1. 每次開發前讀最新 main、部署分支、Supabase 已套 migration、LINE Edge 實際版本與另一對話當前 PR；列出需求 ID 的「已做/部分/沒做/已合併/仍未驗收」。
2. 一個功能對應單一模組負責者；整合時使用小 PR/feature branch、最新 SHA、CI/端到端測試與回滾計畫。**不能從過期 PRD 整檔覆蓋**。本章只添加新需求，既有 0–101 節全文保留。
3. 所有可能碰資料表的變更採非破壞 migration、測試商家備份/還原驗證；不能因「重新設計 SaaS」刪除既有客戶預約、取號、員工、商家 OA 綁定、歷史付款或編號。
4. 對外宣稱已支援前要提供 Github commit、migration applied 證據、網頁網址、LINE/裝置端到端驗收與失敗處理；單憑 PRD 或一個按鈕出現不算完成。
5. 未能在未授權第三方端完成的串接，先提供**可用且可驗收的自家 API/看板/沙盒**，把商家特定認證列為依賴追蹤；不得無依據承諾已打通對手設備。
6. 任何是否移除功能的決策，只能由使用者明確要求；工程人員不得用「這個沒必要」「先別做」「UI 太多」自行刪掉任何 Cxx/Kxx 或舊 PRD 功能。

<!-- NEXT-MAJOR-RELEASE-20261104-END -->


---

## 103. 預約與抽號的永久識別碼、首次編號與重置規則（2026-11-04 確認）

> 本節為增量補充，不取代、刪除或縮減第 0–102 節及其他增補 PRD 的功能。若有不同文字敘述，依本節已確認的識別碼與首次顯示規則解讀；原有權限、LINE 通知、歷史資料、測試帳號與分店隔離均繼續有效。

### 103.1 客戶看到的號碼（Display number）

1. **預約**與**現場抽號／叫號**維持彼此獨立的流水號，預設前綴空白，可輸入 0–3 個字元（含中文、英文、特殊符號；控制字元除外）；流水號不補零，範圍為 1–9,999,999。
2. 尚未發出任何號碼時，後台「目前流水號」**畫面顯示 1**，表示第一筆將從 1 開始；資料庫的 `booking_last_number = 0` 或 `queue_last_number = 0` 是「尚未發號」的內部計數器，**不可被當成客戶的第 0 號**。已發號後顯示實際最近號碼，必要時另行註明下一號。
3. **只有獲授權的店家管理員手動重置**才會將下一筆號碼設回 1；重置操作必須有確認與稽核記錄。重置預約不會重置抽號，反之亦然。
4. 重置後，新紀錄可再次出現顯示號 1，但原有預約／票券、已發出的顯示號、狀態、通知、歷史及其他店家資料不變；後端以 merchant/branch、模組、round/epoch 和永久識別碼區分，不以顯示號作為資料主鍵或定位依據。多人同時取號必須在資料庫交易中無重號。

### 103.2 每筆預約及抽號必有兩種不可變識別碼

1. **內部資料庫主鍵 `id UUID`（原生 UUID）**：`public.so_reservations.id` 與 `public.so_tickets.id` 原有 `uuid primary key default gen_random_uuid()` 保留不動。所有既有外鍵、RPC、LINE 通知事件、預約與票券關聯及編輯／取消／重置／軟刪除操作，仍依此 UUID 定位，禁止改用易重複的顯示號。
2. **簡短永久識別碼 `reference_code`（自訂 ID，不是 RFC 標準 UUID）**：在預約與抽號各自新增欄位，供客服查詢與必要的交易追蹤使用。格式固定為 **21 個大寫英數字**：`YYYYMMDDHHmmssSSS`（17 碼，Asia/Taipei 時區、精確到毫秒）＋ **4 碼 Base36（0–9、A–Z）**。例：`20261104132045987K7Q2`。不得用顯示號取代此識別碼，也不得把這個 21 碼的自訂 ID 稱為標準 UUID。
3. 短碼必須由可信任後端／資料庫生成，不由前端直接自行指定；需要資料庫唯一索引、生成碰撞保護／重試策略或可證明在支援範圍內不碰撞的序列策略。可讓預約與抽號共用同一個生成序列，以降低跨類型碰撞風險。若跨資料庫或跨環境有外部整合需求，還須定義環境命名空間與跨庫唯一性策略。
4. 兩種識別碼均**建立後永久不變**；即使商家重置可見流水號、重新報到、改期、取消、恢復、歷史資料重算或跨午夜，也不能改寫或重用原本的識別碼。避免把顧客 LINE userId、顯示號或單獨的毫秒時間戳作唯一鍵。
5. 客戶頁通常顯示簡單預約／抽號號碼；短碼可在客服詳情與稽核查詢顯示。不得未經授權揭露其他顧客或跨商家的識別資訊；短碼只是定位碼，**不是身分驗證憑證或授權 token**。
6. 此次增補採**非破壞性 migration**，既有 UUID、歷史紀錄、LINE OA、正式和 QA 測試資料均保留，既有資料僅補上短碼，不做清空或重建。

### 103.3 已實作／仍待驗證範圍（避免誤報完成）

- GitHub 原有 `20261104_independent_booking_queue_manual_serials.sql`：分開維護兩類流水號，擁有重置函數、round 與歷史資料保留；實際上線仍以資料庫已套用版本為準。
- GitHub 新增 `QueueMonster/supabase/migrations/20261104_compact_booking_queue_reference_codes.sql`：保留 UUID，新增 `reference_code` 與生成 trigger／唯一索引；已於 2026-11-04 套用至 LINE 專案使用的 Supabase。當時檢查到既有預約 4 筆、抽號 7 筆，均有 21 碼短碼，且各類型內不重複。
- `QueueMonster/saas/index.html` 已調整首次尚未發號時後台顯示「1」，不是「0」。**GitHub 程式更新 ≠ GitHub Pages 已部署驗收**；前端部署與新增資料的完整端對端測試須另行驗證。

### 103.4 必須新增的驗收案例

| ID | 測試 | 預期結果 |
| --- | --- | --- |
| ID-01 | 全新商家尚未預約／取號 | 兩個管理面板都顯示第一號為 1；實際第一筆都是 1，絕無 0 號 |
| ID-02 | 連續建立預約與抽號 | 兩套獨立流水號，無補零；每筆分別有 UUID 與固定 21 碼短碼 |
| ID-03 | 快速同毫秒併發、不同商家／分店建立資料 | UUID 與短碼均唯一；不可因毫秒相同或前綴相同而互相覆蓋 |
| ID-04 | 管理員重置預約或抽號並再建立新資料 | 只重置所選類型，新流水號從 1 開始；舊資料、UUID、reference_code、狀態、LINE 關聯不變 |
| ID-05 | 顯示號重複的兩筆舊新紀錄編輯／取消／通知／查詢 | 全部依永久 ID 找到正確單筆，不會錯編、錯刪、錯通知 |
| ID-06 | 非管理員試圖重置／猜測其他商家短碼 | 後端拒絕未授權操作，跨店與客戶資料不可洩露 |
| ID-07 | 既有資料升級與回歸測試 | 原資料與測試帳號不刪除；現有 4 筆預約與 7 筆抽號的 UUID 不變，短碼可用 |
| ID-08 | GitHub Pages 實際發號、重置、查詢與 LINE 流程 | 正式部署後手機與電腦實測通過，才能標記完全完成 |

**非刪除聲明**：本第 103 節是新增需求；所有舊章節、功能清單、歷史、角色／權限、通知、付款與測試相關需求原封保留。往後任何修改須先讀最新 main、比對 SHA 並採最小增量修改，不能以整份舊 PRD 覆蓋其他對話的變更。


## 2026-11-04｜LINE 通知地址一鍵導航（已實作）

- 維持既有預約成功／預約更新／取號等共用 LINE Flex Message 版型與原有操作按鈕，不新增另一套通知。
- 店家後台已有的地址欄位若為有效實體地址，LINE 通知內「地址」文字可點擊，地址下方提供「開啟 Google Maps 導航」連結，使用 Google Maps Directions URL（`api=1`，不需 Google Maps API Key）；以店家地址當目的地，出發地由使用者裝置處理。
- 地址缺漏，或明確標示測試用途、無實體地址、虛擬／示範地址等情況，不出現地圖連結；通知原地址及其他資訊不受影響。
- 測試標準：有效地址可正確 URL 編碼與開啟導航；假地址無連結；編輯與取消預約按鈕保留；不動既有預約或客戶資料。

---

## 104. 開源 GitHub 專案整合：優化既有、補齊舊需求、新增 5 項（2026-11-04）

**本章僅增補，絕不可刪除或覆寫原本 0–103 章、C01–C58、K01–K32、FR／UX／NR 要求。** 所有「已有」是發現原始碼或 PR，與真實 LINE E2E 完成是兩件事。保留預約與叫號獨立、商家／分店隔離、預設空白編號前綴、手動重置與永久 UUID、TEST-HQ／TEST-STAFF、手機電腦同網址與自動更新。

### 104.1 可參考來源、授權

| 開源原始碼 | 借鏡重點 | 授權限制 |
| --- | --- | --- |
| https://github.com/Shudesu/line-harness-oss | LINE OA 多帳號、LIFF、通知、CRM 標籤、自動化、對話收件匣、追蹤連結 | MIT，保留必要授權，原 Cloudflare/D1 架構須改造 |
| https://github.com/aekiratli/appointment-engine | 預約資源排程、PostgreSQL 排他鎖、冪等、outbox | Apache-2.0，保留授權/NOTICE |
| https://github.com/FabianWesner/librenexus | 防雙訂、緩衝時長、時區、測試 | MIT，原系統為 PHP |
| https://github.com/qtrcipher/queue-management-system | 分店／櫃檯／轉號／看板／統計 | Apache-2.0，仍屬早期 MVP |
| https://github.com/Wasiqml/Virtual-Q | 顧客提醒偏好、順位、ETA UX | LICENSE 需複核，瀏覽器提醒不是 LINE 推播 |
| https://github.com/nguyentrungnghia1802/LINE_Smart_Queue_Assistant | 商家申請、分店 QR、角色、多語 LIFF | 根目錄未見 LICENSE，先參考設計，不複製 |
| https://github.com/NickKhunapoj/openQueue | Supabase Realtime、過號回隊、看板 | README 與根目錄 LICENSE 不一致，釐清前不複製 |
| https://github.com/line/line-api-use-case-reservation-Restaurant | LINE 官方 LIFF／Messaging 示範 | 已封存，以現行官方 API 為準 |
| https://github.com/ZiChien/ahyaOrderSystem | 台灣門市 LINE 訂餐與店員介面 | 原始碼授權另查 |

### 104.2 已存在功能，**原位優化，不重複建置**

| ID | 我方已有／初版 | 參考及待優化 |
| --- | --- | --- |
| OSS-O01 | LINE LIFF 身分、暱稱、自動連結 | L Harness：不同 Provider 隔離、token 過期／跨裝置恢復、零輸入顧客 |
| OSS-O02 | 預約／取號／叫號 LINE 通知、outbox 初版 | L Harness、Appointment Engine：交易式通知、429/5xx 重試、去重、配額與送達可觀測 |
| OSS-O03 | 預約時段、人數容量、request-id 冪等 | Appointment Engine、LibreNexus：多資源防超賣／時間重疊 E2E |
| OSS-O04 | QR 取號、保留／恢復、過號與即時頁 | openQueue、Virtual-Q：順位演算、斷線／重連、ETA 估算 |
| OSS-O05 | 多租戶、店家審核、員工角色 | Smart Queue、QMS：多分店並發、權限、稽核 |
| OSS-O06 | TV 叫號看板及 A4 立牌 | openQueue、Smart Queue：設備重連、多窗口安全配對 |
| OSS-O07 | 顧客跨店進度與最後同步時間 | Virtual-Q：依實際服務時間校準 ETA、不誤顯假即時 |
| OSS-O08 | 預約歷史／CSV／日週月曆／單筆 ICS | LibreNexus：大量資料性能與權限、日曆一致性 |
| OSS-O09 | PWA 安裝、靜態離線提示 | openQueue：員工 Web Push／撤權；不可快取即時號碼或他人個資 |

**先驗收而非重寫**：PR #24 HOLD/RESUME、#25 到場/入場、#26 指定號碼叫號、#27 早午晚休、LINE 地址 Google Maps 導航、流水號與永久參考碼。

### 104.3 已列原 PRD、尚未完整交付（使用既有需求 ID）

- FR-101／NR-05／C04–05：員工／房間／設備的服務時長、緩衝、不可重疊，以 Appointment Engine 交易與排他限制為參考。
- FR-201～204／NR-06～07／C21–31：固定場次、座位制、每日名額、包場、排班與休假，以 LibreNexus 資源引擎為參考。
- FR-106／NR-17／C43–46：使用總公司 OA 或商家自有 OA、各自 Provider／Secrets、自助設定及撤權，以 L Harness 為參考。
- FR-104／NR-14／C12–13：提醒前 24h／2h、通知 outbox、取消改期刪除後撤回過期提醒，以 L Harness＋Appointment Engine 為參考。
- K23–27、K29–31、NR-08/15/24：多隊列、多櫃台、數位看板、轉號與設備 API，以 QMS 為參考；不可讓預約報到自動產號。
- FR-107～109、FR-205、C32–36、C47–52、C58、NR-18/19/21/23：客戶簿、黑名單、Calendar、Web Push、營運統計與正式金流，照原 PRD 全部完成；不得以 mock 支付宣稱完成。

### 104.4 **新增功能，全部納入正式 PRD**

**OSS-N01 LINE 對話收件匣（P1）**：在店家現有後台查看其授權 OA 顧客訊息、未回覆狀態、指派店員與真人回覆。Webhook 驗證與去重、商家隔離、權限、資料保存期限、撤權停止同步必備；使用 LINE 真實帳號驗證實際收發。參考 L Harness。

**OSS-N02 顧客標籤與自動回訪（P1）**：各店獨立標籤、未到／長期未回訪條件、指定提醒時段、同意與退訂、頻率限制、重複事件去重、通知配額及結果追蹤；不靠姓名跨店合併。參考 L Harness。

**OSS-N03 顧客自選接近到號 LINE 提醒（P1；第一個開發切片）**：每張本人 WAITING 票券可選「關閉（預設）／前方 3 組／前方 5 組」，以已驗證 LINE 身分和 Supabase 保存；採有效候位的日期、加入隊列時間、票號與 UUID 排序，不能以流水號相減。每票至多推一次，由既有 LINE outbox 非同步送店名、號碼、當下組數、即時叫號頁連結；HOLD／已取消／已叫號／已刪／已關閉均不得發；訊息失敗重試、不重複送。驗收涵蓋別人無權修改、併發、不同商家、門檻邊界、LINE 額度不足與關閉偏好。

**OSS-N04 活動追蹤連結與轉換漏斗（P2）**：本店產生可撤銷追蹤連結，去重統計點擊→進入預約→成立；依匿名化／最小必要原則，保護跨租戶歸因及個資。參考 L Harness。

**OSS-N05 顧客多語言 UI（P2）**：繁中預設，增加英文／日文並預留越文，使用同一 RWD 網址；系統狀態值不變、翻譯缺漏回退繁中，涵蓋錯誤與 LINE 模板。參考 Smart Queue。

### 104.5 開發次序、禁止破壞性操作

第一波先 OSS-N03（設定 RPC、資料庫欄位、排程/outbox、LINE handler、顧客 UI、合約測試），再 OSS-O02／FR-104 通知可靠度與提醒，接著 OSS-O03／FR-101 資源排程；第二波 OSS-N01/N02 與多 OA 及 CRM；第三波 OSS-N04/N05 與其他既存未完成的 Cxx/Kxx/FR/NR。**僅調整優先序，不刪任何需求。**每個切片都先比對最新 main、建立獨立 branch/PR、非破壞式 migration、保留原始測試店家／歷史資料；LINE API 接受不等於收件人已收到，未做真實 E2E 不得宣稱正式完成。

---

## 105. 共用平台 LINE OA 的雙入口顧客預約／取號流程（2026-11-05 確認）

> 本章是使用者確認的**增量需求**，適用於「商家沒有自己的 LINE OA，由平台統一 LINE OA 服務」模式（`oa_mode=PLATFORM`）。商家自有 OA 模式先不改；既有 §0–104、C01–C58、K01–K32、FR/UX/NR/OSS 各項功能與驗收仍完整保留。本章優先定義**入口與身分驗證**，不是要新增「LINE 聊天室逐題問答預約」系統。

### 105.1 產品模式與權威資料

1. 平台一個 LINE OA 可為大量不同商家／門市提供**搜尋、預約／取號入口及通知**；每個商家仍有獨立門市設定、時段容量、訂單、號碼、後台與權限。
2. 兩個入口**都導到相同的顧客網頁及既有 Supabase RPC**；不做第二套預約／取號資料庫、不在前端模擬成功、不讓預約報到自動產生號碼。
3. 每筆資料必須以既有商家／門市及不可變 UUID 為準。顯示號、21 碼 reference_code、歷史、通知、RLS、軟刪除及重置規則全部保留。依 §§103–104 處理。
4. 本章確認的預約入口，不等於強制顧客必須在聊天室中完成全部選項；LINE OA 可開啟店家搜尋／專屬預約網頁，預約結果再由同一平台 OA 通知。

### 105.2 入口 A：從平台 LINE OA 搜尋店家

1. 顧客加入或開啟平台 LINE OA，點選圖文選單「搜尋店家」，進入平台店家搜尋目錄（可在 LINE 內建瀏覽器開啟）。
2. 店家目錄只顯示`ACTIVE` 且`directory_enabled=true` 的正式公開商家；搜尋店名、地區／地址。測試商家可有分離的 QA 入口，不混進正式結果。
3. 顧客找到 A 店，點「立即預約」，應直接進 A 店顧客預約頁並保留 `view=customer&merchant=A&tab=reserve`。點「現場取號」則保留 `tab=queue`。
4. **共用 OA 商家禁止先強制再跳另一個 LIFF URL**，以免繞路、失去商家參數。該店顧客網頁在正式預約／取號前判定是否已有經後端驗證的 LINE 身分；必要時才啟動 LINE Login／LIFF。
5. 未登入也能搜尋公開店家；不得讓未經驗證身分提交預約或取得號碼。再次進入已完成有效驗證的顧客不要無限重新要求授權。
6. 總公司 OA 圖文選單應連向 `/LINE/booking/directory.html?mode=search`；「我的預約／我的取號」必須依使用者已驗證的同一 LINE 身分匯總，禁止只看匿名瀏覽器識別就誤認本人。

### 105.3 入口 B：店家自己的 QR Code／分享網址

1. 每個店家／分店都有**不同、長期可用**的預約與取號網址。例如：
   `https://hub-google.github.io/LINE/booking/?view=customer&merchant=<slug>&tab=reserve`
   和 `...?view=customer&merchant=<slug>&tab=queue`。
2. 共用 OA 商家的 QR Code、A4／PNG 立牌、店家分享按鈕，應產生以上**HTTPS 網頁入口**，不必強制掃碼直接開 LINE OA 聊天室，也不預先跳 LIFF。
3. 掃碼／點連結後第一個畫面應顯示正確店家與操作用途。顧客尚未驗證 LINE 身分才進入 LINE Login／LIFF，完成後**回到原本商家及 reserve/queue 等操作頁**，不回首頁、也不跳到預設示範門市。
4. QR 的店碼只定位商家，**不是授權憑證**。後端仍應查詢該商家是否 ACTIVE、是否開放預約／取號、名額及權限；禁止憑任意商家字串直接建立資料。
5. 店員管理後台繼續提供兩種 QR 立牌與複製連結；未開放的功能不得印出可誤導顧客的有效 QR。商家自有 OA 原本的 LIFF QR 行為維持不變。

### 105.4 LINE 驗證與通知

1. LINE 身分綁定的主要目的：**避免機器人、重複帳號及惡意假預約**；但不能宣稱可完全防止詐用。顧客不需申請本網站帳號／密碼。
2. LIFF 先完成 `liff.init()`，再讀取恢復後的商家、頁籤、登入結果；主／次重新導向過程不得提前清除 `liff.state` 或重播 PKCE code/state。若本次包含 LIFF 回呼參數，**不可因舊 Supabase session 存在而跳過 LIFF 初始化**。
3. 平台 OA 的 LIFF Endpoint 應為中性的 `https://hub-google.github.io/LINE/booking/`，不可預設 `greenfield-salon` 或任何一家 QA 商家。對應 LINE Developers 設定、Login scopes、圖文選單需實際查驗。
4. LINE Login 與成為平台 OA 好友**不是同一件事**。LINE 驗證成功後應檢查平台 OA 是否具通知資格，未加好友引導加入；未同意不得自行加好友或假裝訊息已送達。
5. 預約前要求顧客確認、填寫可修正的**預約姓名與聯絡電話**，資訊應出現在預約確認畫面、個人紀錄、店員後台及 LINE 通知；LINE 顯示名稱本身不等於可撥打電話。
6. 預約建立、取消、修改與恢復通知依 §102 原規格由平台 OA 發送，內容標註**商家名、日期／時間、人數、預約姓名與電話**；取號／叫號則標註商家及對應號碼、時間。LINE API 成功接受不等於顧客已實際收到。
7. 同一 LINE 帳號可預約多店；本人跨店記錄以經驗證的 LINE 識別為準，每張卡片及操作綁定正確的 `tenant_id` 和 UUID；A 店店員不可看到或修改 B 店資料。
8. 手機 LINE 內建 WebView、外部 Android/iOS Chrome/Safari、電腦瀏覽器都要有可用的登入／返回路徑。從手機相機掃 QR 不保證會自動進入 LINE App 內建瀏覽器，必須保留 HTTPS 網頁與登入備援。

### 105.5 非破壞性實作與驗收

- **此次改版優先只調整導流、登入返回邏輯、QR 來源及文件；若現有 Supabase 表格/RPC 足以支持，不新增 migration。** 不清理、不重置既有正式／QA `so_` 商家、顧客、預約、取號、號碼、編號、通知及權限。
- 兩種入口使用相同預約 RPC `so_book_with_contact_once`、既有 LINE 身分關聯和店員後台；不要繞過安全檢查、服務容量、重複預約的冪等防護。
- 修改應走獨立 branch/PR、既有測試與部署工作流程。需區分「原始碼已合併」、「Pages 已部署」、「LINE Developers 設定已更新」、「實際手機與通知 E2E 已驗收」。

| 測試 ID | 必須驗證 | 預期 |
| --- | --- | --- |
| HQ-ENTRY-01 | 從平台 OA 圖文選單搜尋 A 店並按預約 | 進 A 店 HTTPS 預約頁，不強制先跳第二個 LIFF |
| HQ-ENTRY-02 | 掃 B 店專屬預約 QR 或分享連結 | 網頁保留 B 的 `merchant` 與 `tab=reserve`；未登入才要求 LINE 授權 |
| HQ-ENTRY-03 | 掃 B 店取號 QR | 保留 `tab=queue`，不自動跳預約或測試商家 |
| HQ-ENTRY-04 | 首次 LINE 授權及含 `liff.state` 的主／次重新導向 | 保留原商家、用途、個人操作目標；無重導循環 |
| HQ-ENTRY-05 | 同一 LINE 使用者再進 A、B 店 | 符合驗證條件則免重複登入；跨店記錄只屬本人 |
| HQ-ENTRY-06 | 不同 LINE 使用者與不同店員測試 A、B、C 店 | 商家隔離、容量、預約 UUID、記錄、QR 與通知不可串店 |
| HQ-ENTRY-07 | 顧客填／修姓名電話、取消及恢復預約 | 正確存入資料庫並於店員端、LINE 通知一致呈現 |
| HQ-ENTRY-08 | 未加平台 OA 好友、封鎖／LINE Push 失敗 | 顧客得到適當引導或失敗提示，不虛報送達 |
| HQ-ENTRY-09 | iOS／Android LINE、手機相機、桌面瀏覽器 | 掃碼→網頁→必要時 LINE 綁定→回到原店完成預約 |
| HQ-ENTRY-10 | 正式 Pages、OA 圖文選單及 LINE LIFF Endpoint | 已部署，真實帳號完成 E2E 後才可標記完全驗收 |

**本章不得被解讀為移除商家自有 OA、LINE 聊天互動、跨店管理或原 PRD 任何功能；只是將此模式的兩個正式顧客入口及優先改版邏輯明確化。**


---

## 2026-11-05 通用服務單位／多場次預約與獨立叫號（現行增補）

**最新產品決策：同一套網站、同一組預約／叫號功能，由店家勾選啟用多服務單位，不另開診所／醫院專版。** 本節覆蓋先前 D-01 對「任何連動均禁止」的限制；獨立模式仍為預設，其他原有需求保留。

### A. 開關與共用介面
- 原本 reservation/queue/calling 模組開關保留，另外由管理者設定三個可組合選項：
  1. multi_unit_enabled：啟用多服務單位。關閉時沿用單一預約／單一叫號介面。
  2. grouped_units_enabled：顯示服務分類（科別、櫃台類型、服務區等）。
  3. checkin_queue_enabled：預約報到後進入所屬場次叫號；要求啟用多單位、預約及叫號。
- 同一商家只有一個網站、一個商家身分與原有 OA 發送方式；醫師、診間、設計師、餐廳候位區、服務櫃台皆以「服務單位」表示。
- 服務單位沿用 so_booking_resources 加入分類與排序設定；場次以 so_service_sessions 儲存單位、日期、起迄時間與容量。同醫師不同診次為獨立場次。
- 顧客流程：商家首頁→選分類（若開啟）→選單位→日期→場次→預約或取號；LINE 身分驗證與通知共用既有架構。無多單位時不多一個操作步驟。
- 店員後台與企業設定仍是原網站；增加單位與場次管理、叫號場次切換及同店多隊列。
- 公開 board.html：單隊列沿用原大號碼版；多單位自動顯示多欄卡片，指定 session=UUID 可只看單一場次。禁止公開顧客姓名、聯絡資訊及 LINE 身分。

### B. 共用資料與交易規則
- 延用 so_reservations、so_tickets 各自 UUID、流水號、prefix 及重置；新增 service_unit_id、service_session_id，票券使用既有 reservation_id 連結。
- 場次預約 RPC so_unit_book_once 必須驗證 LINE 身分、名額和同請求去重；容量以未取消的預約人數計算，不能因同時送出而超賣。
- 報到 RPC so_unit_checkin 在同一交易內將預約改為已報到並建立一張關聯票券，重複點擊不再發新號；一般商家報到仍不自動產號。
- 現場抽號 so_unit_take_number 依指定場次處理，重複抽號只限制同場次。
- 叫號 RPC so_unit_call、so_unit_set_ticket_status 只在相同場次檢查服務中的票券；不同場次可同時叫號。
- 進度 so_unit_progress 依所屬場次計算；公開看板 so_unit_public_board 僅輸出號碼和等候數等無個資。
- 所有寫入的商家權限、LINE 身分、場次與容量均由資料庫驗證；不能靠前端，且不得清除既有商家/QA資料。
- 舊預約、叫號 RPC 不得因新增模式被改成全部自動連動；舊設定未勾選的店家行為必須相容。

### C. 目前交付範圍與驗收
- SQL 遷移：20261105_unified_service_queues.sql、20261105_unified_service_queues_records.sql；以前端 index.html 和 board.html 沿用既有 GitHub Pages 工作流程部署。
- 尚須驗收真實 LINE OA 送達、不同裝置、多人同時掛號、過號插回、取消/改期關聯狀態。不得將單次 SQL/建置成功宣稱為完整端到端驗收。
- 醫療病歷、診斷、處方與醫院 HIS 整合不納入這次共用預約／叫號模板。

### D. 驗收情境
1. 一般單隊列商家不勾選任何新選項，原預約/取號/叫號及看板保持一致。
2. 一家商家有多分類、多單位、同單位不同時段，仍在同一網站完成全部操作。
3. 同場次只有 1 名額時兩人同時預約，不能超賣；重送同 id 只能回傳原筆。
4. 同一筆預約報到兩次只有一張票；不同單位可以同時叫號，不互相阻擋。
5. 公開看板顯示分隊列號碼但不顯示姓名、電話或 LINE ID；指定場次看板也必須正確。
6. 跨商家資料完全隔離，店員不能操作沒有權限的企業；手機與桌機版沿用相同網址。



---

## 2026-11-05 公開找店家改版：清單探索與遊戲逛街（已實作）

### 使用入口與定位
- 沿用公開 `/booking/directory.html`，提供 `?mode=search` 清單、`?mode=queue` 現場取號店家、`?mode=mine` 我的紀錄，以及 `?mode=game` 遊戲逛街。首頁、手機選單與頁尾連結可直達遊戲模式。
- 參考 DoYouBook `/explore` 的「找店家／像素商圈／商店街」互動概念，以自有原創視覺、CSS 建築／角色及 JS 程式開發；不使用其他網站的素材、商標、原始碼或模擬店家資料。
- 使用者可切換清單與遊戲視圖，不新增網站帳密。**公開看板可直接查看，預約、取號及個人紀錄仍執行原有 LINE 驗證。**

### 清單探索
- 支援關鍵字（店名／地址）、店家類別、縣市或線上商圈、服務類型（預約／取號／看板）、排序（名稱／類別），並以可點擊卡片提供各服務入口。
- `so_tenants.directory_category` 新增為公開店家分類欄位；企業設定可修改，後端 `so_update_tenant` 驗證並保存；`so_staff_state` 回填選取值；`so_public_directory` 僅回傳 `status=ACTIVE` 且 `directory_enabled=true` 的正式店家所需非敏感欄位。
- 由已公開地址解析縣市，不能將遊戲商圈當成真實定位、實體店家地圖、導航或距離資訊；不編造評分、價格或尚未上架的店家。
- 店家的平台共用 OA／自有 OA 預約和取號路由沿用既有 `customerUrl` 機制；公開看板連結直達唯讀頁面，不跳 LINE 登入。

### 遊戲逛街
- 在 `mode=game` 先顯示商圈選擇地圖，再進入像素商店街，顯示店面、店名和移動角色；可點店面、用上一家／下一家按鈕，桌面支援方向鍵，手機支援觸控／橫向捲動；選店後直接使用既有預約、取號和看板入口。
- 正式商圈由公開 `so_public_directory` 回傳的真實店家建立；另用 `so_public_explore_demo` 提供**固定三間現存測試門市**的非敏感展示資料，全部明確分隔於「測試商圈」，不混入正式店家清單，不能把測試店家數當成正式商家數。
- 新增 `explore-game.js`、`explore-game.css`，由既有 Pages 工作流程同時部署 `/booking/` 和 `/saas/`，不影響其他 LINE 子專案。

### 驗收與限制
- 自動化檢查：腳本語法、部署資產、資料投影、店家分類、頁面切換、商圈選擇、店面移動、連結與測試商圈分離；Supabase 以未登入角色檢查公開資料函式。
- 功能交付不等於真實 LINE 推播或到店服務全面驗收。若目前無正式公開店家，清單應如實顯示 0 家，仍可用測試商圈操作體驗，不得填假商家佔位。


---

## 2026-11-05 全站登入識別與 LINE 登出（已實作）

- `/booking/` 的 `home.html`、`directory.html`（含遊戲模式）、`board.html`、`index.html`、`poster.html`、`merchant-center.html`、`merchant-register.html`、`privacy.html`、`terms.html` 在頁首右側共用登入元件。相容路徑 `/saas/` 亦同。
- **顧客未完成 LINE 綁定**：顯示實際可點的「使用 LINE 登入」，前往既有的 LINE LIFF 授權程序。匿名 Supabase session 不能被視為已綁 LINE。
- **LINE 已驗證**：由 `so_site_header_identity()` 僅取得本人 30 日內伺服器驗證的 LINE 顯示名稱，呈現名稱與「登出」。不能僅信任瀏覽器快取字串、LINE UID 或可偽造的前端旗標。
- **店員／管理員**：管理頁優先呈現正式登入帳號，測試管理員需已有授權 membership。顧客與管理員 Supabase 工作階段分離，不以顧客 LINE 登入冒充店員權限。
- **登出**：操作對應工作階段的 Supabase `auth.signOut()`，對於原有測試管理員一併清除本機測試識別，重新載入以停止顯示已授權資料。登出不刪除預約與叫號紀錄。
- **原頁返回**：公開頁觸發 LINE 登入後，只有當實際 LINE 綁定驗證通過才返回原 `home/directory/board/poster/merchant-center/merchant-register/privacy/terms` 頁面；回跳僅允許相同網域與指定檔案，防止任意網址重導。
- **相容性**：保留既有預約流程、LIFF callback、公開看板與多企業 OA 模式。共用腳本採用 `site-auth.js` 和 `site-auth.css`，由原本 Pages Action 同時發布正式與舊版路徑；原始 JS 自動測試覆蓋登入按鈕、顯示名稱、登出動作及跨頁整合。
- **E2E 限制**：目前以資料庫權限、DOM 互動測試及 GitHub Pages 部署檢查驗收；真實 LINE 帳號授權與跨裝置登出須另做實機測試，不得僅以 CI 成功聲稱已確認真人 LINE OAuth 送達／登入結果。


### 2026-11-05 通用公版實際入口與展示（UI 交付修正）

- 商家後台「營運與設定」下必須有獨立的「服務單位與場次」選單，手機後台「更多」也可進入；不得只藏在企業設定深處。
- 同一頁設定多服務單位、顯示分類、預約報到後連動叫號，並管理服務單位及場次；不可重複增加第二套資源管理。
- 顧客開啟多單位時，須呈現可點選、響應式服務單位卡片，沿用原預約與取號流程；沒有啟用時維持原簡單頁面。
- 提供可直接開啟的通用公版互動預覽：https://hub-google.github.io/LINE/booking/template.html，可切換醫院、餐飲、美髮與服務櫃台，也能操作功能勾選。預覽資料不進入 Supabase，不可冒充正式預約與發號。
- 正式 /booking/ 及相容 /saas/ 網址都要部署；須核對 GitHub Pages 發布檔案，不能僅以原始碼 commit 當作網站上線。

---

## 2026-11-05｜商家探索頁：首頁熱門 Top 50 與真實搜尋（已實作）

**適用頁面**：`/LINE/booking/directory.html`（舊路徑 `/LINE/saas/directory.html` 同版）；不影響獨立的「我的預約」、叫號看板、遊戲逛街或雙 OA 模式。

1. **初始列表**：上方顯示搜尋框與店家類別／地區／服務／排序；尚未輸入關鍵字或調整篩選時，下方顯示「熱門店家排行」，取近 30 天真實有效預約數與獨立取號數相加，依次數由高至低排序，最多 50 家。公開候選不足 50 家就只顯示實際家數；0 家顯示空狀態，禁止填入假店家或假交易。
2. **正式搜尋**：排序選單預設「熱門排行」，也可切換「店家名稱／店家分類」；使用者輸入關鍵字或調整類別、地區、服務類型、排序後，切成「搜尋結果」，呼叫資料庫 `so_public_store_search` 查詢**全體符合公開條件的店家**，不得只在 Top 50 內找。每頁 50 家，可按上一頁／下一頁；清除關鍵字及重置所有篩選後返回熱門榜。僅搜尋測試門市的既有明確查詢入口維持獨立，測試門市不得混入熱門榜或正式搜尋。
3. **熱度公式**：`30 天有效預約數 + 30 天獨立取號數`。統計以紀錄 `created_at` 換算 Asia/Taipei 的自然日，共當日及前 29 日。取消狀態 `CANCELLED`、`deleted_at IS NOT NULL` 不算；`so_tickets.reservation_id IS NOT NULL` 為預約衍生號碼，不重複加分。保留非取消且曾經發生的預約及獨立抽號，即使該服務日已經結束亦納入 30 天內交易次數。
4. **統計來源**：`so_reservations` 與 `so_tickets`，透過資料庫 Trigger 增量更新不可公開寫入的 `private.so_store_activity_daily`，依 `private.so_store_popularity_30d` 彙總。由 `so_public_popular_stores('all',50)` 只提供正式上架的商家公開資訊及統計數字，不傳顧客資料。插入、取消、還原、soft delete、切換來源預約都應與排行自動同步，不靠前端排程。
5. **可被搜尋的範圍**：必須 `so_tenants.status='ACTIVE'` 且 `directory_enabled=true`，排除所有 `qa-%`、`greenfield-salon`、`demo-clinic` 測試資料。取號分頁僅列支援取號的正式商家。店家卡保留預約／取號／看板／Google 地圖既有連結與雙 OA 導向；熱門卡額外顯示名次、近 30 天預約數及取號數。
6. **空資料與安全**：無正式上架店家時顯示真正的空資料，不以 QA 交易充數；客戶未登入仍能讀取經資料庫限制的公開排行。統計表位於 private schema、禁止匿名／驗證使用者直讀直寫；僅提供 aggregate 和商家基本公開欄位。
7. **驗收**：首次開啟顯示熱門榜；關鍵字與任何非預設篩選都觸發真實後端搜尋；搜尋結果可以超過 50 並翻頁；取消或刪除單筆資料後排行扣除，恢復後加回；匿名 RPC 可查無顧客資訊；測試資料不混正式榜；手機可順暢使用搜尋、排序、分頁及店家操作按鈕。

**本期資料現況**：2026-11-05 檢查時正式公開門市為 0 家，因此熱門榜是空狀態，此為資料現況，並非排行故障。

---

## 2026-11-05 共用 LINE OA 圖文選單與文字客服實作規格（增量）

**適用：平台共用 OA**，不應覆寫店家自有 OA 的圖文選單、Provider、Messaging API token、LIFF 和 Webhook。店員同時可以是其他商家的消費者，不能以「是否店員」決定永久顯示哪一種 LINE 圖文選單。

1. **圖文選單**：平台預設「顧客服務」，透過 LINE rich menu alias + richmenuswitch 讓使用者切換「商家服務」，每頁六格。顧客選單為找店家預約、現場取號、我的紀錄、遊戲逛街、即時叫號及客服中心；商家選單為商家開通、管理後台、預約與叫號、QR 立牌、操作教學及聯絡平台。禁止導到特定示範店、不存在的 #activate 或無權限的內部網址。網站後端既有 LINE 身分與 RBAC 檢查完全保留。
2. **訊息導流**：共用 OA Webhook 在 HMAC-SHA256 簽章驗證後接受一對一 LINE 文字訊息，提供預約、取號、本人紀錄、叫號進度、商家開通與客服指引；回應使用 Reply API 與 Quick Reply。文字訊息不改資料庫預約或號碼，不得以聊天文字宣稱完成預約／取號、付款或人工客服處理。商家自有 OA 文字訊息維持原有店家處理，不由平台聊天機器人接管。
3. **歡迎訊息**：新的 follow 事件完成既有原子化去重後，平台 OA 可在 LINE_PLATFORM_WELCOME_REPLY=true 使用 Reply API 發送一次歡迎訊息；自有 OA 不使用平台歡迎語。OA Manager 自動歡迎與 Webhook 歡迎不得同時啟用，以免重複推送；必要時改設 false。
4. **品牌資料**：建議共用平台名稱為「LINE 預約服務平台」，頭貼及封面以深綠／米白、日曆與號碼牌組成，避免某一產業或門市意象。OA Manager 的名稱、頭貼、封面及自動回覆開關需具 OA 管理權才能修改，不得因原始碼完成而宣稱已改好。
5. **通知**：沿用既有預約／取號／叫號 Flex Message、商家 ID、場次 ID、內部 UUID 及 outbox；新增聊天導流不得複製既有發送或引入重複 Push API 費用。多門診／多服務單位的叫號卡仍需顯示正確門市與場次；LINE API 接受與真人實收分開驗收。
6. **上線驗收**：線下 Python 圖片與路徑契約測試、Node Webhook 導流契約測試、既有 domain regression；合併 main 後 Actions 實際發布兩個 alias、回讀預設 menu ID、Supabase Edge Function 配置成功；最後以真實 LINE 好友驗收手機圖文選單、歡迎／文字回覆、LINE 身分、跨店個人紀錄和通知，且不影響店家自有 OA。

實作與人工操作清單見 [LINE-OA-REFRESH-20261105.md](./saas/LINE-OA-REFRESH-20261105.md)；本次只新增上述規格，原有 §0–105 及其他需求不刪除。
