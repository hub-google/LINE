# RESTful API 規格清單 (API Route List)

> API 前綴統一路徑：`/api/v1`  
> 認證規範：除特定公開狀態外，所有端點皆透過 `Authorization: Bearer <sessionToken>` 傳遞。  
> 冪等規範：所有變更寫入請求支援 `Idempotency-Key: <uuid>` Header。

---

## 1. 認證與租戶資訊 (Auth & Context)

| HTTP 方法 | 路徑 | 存取層級 | 描述 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/line/exchange` | 公開 | 以 LIFF Access Token 交換內部高時效 Session Token |
| `GET` | `/api/v1/me` | 已登入 | 取得當前使用者身分、租戶隸屬與角色權限 |
| `GET` | `/api/v1/me/merchants` | 已登入 | 取得該使用者所屬的所有商家與分店權限 |

---

## 2. 顧客端功能端點 (Customer APIs)

| HTTP 方法 | 路徑 | 存取層級 | 描述 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/branches/:branchId/queue/public-status` | 公開 | 取得門市當前叫號、等待人數與預估時間 |
| `POST` | `/api/v1/branches/:branchId/queue/tickets` | Customer | 現場線上取號 (防重複取號限制) |
| `GET` | `/api/v1/queue/tickets/:ticketId` | 票券擁有者 | 查詢個人號碼牌進度與前方等待人數 |
| `POST` | `/api/v1/queue/tickets/:ticketId/cancel` | 票券擁有者 | 取消尚未被叫號的號碼牌 |
| `GET` | `/api/v1/branches/:branchId/reservation/availability`| Customer | 查詢指定日期可預約之時段容量 |
| `POST` | `/api/v1/reservations` | Customer | 建立新預約 (時段防超賣交易) |
| `GET` | `/api/v1/reservations/:id` | 預約擁有者 | 查詢預約詳細內容 |
| `POST` | `/api/v1/reservations/:id/cancel` | 預約擁有者 | 依門市規定提前取消預約 |
| `GET` | `/api/v1/branches/:branchId/catalog` | 公開 / 顧客 | 瀏覽分店菜單與服務品項 |
| `POST` | `/api/v1/orders` | Customer | 建立點單 (可綁定預約或排隊號碼) |
| `GET` | `/api/v1/orders/:id` | 訂單擁有者 | 查看訂單細項與各 item 付款狀態 |
| `POST` | `/api/v1/orders/:id/items` | 訂單擁有者 | 訂單追加品項 |
| `POST` | `/api/v1/orders/:id/payments/line-pay/request` | 訂單擁有者 | 勾選未付項目發起 LINE Pay 支付 |
| `GET` | `/api/v1/payments/line-pay/confirm` | 公開/網關 | LINE Pay 授權完成重導向確認核銷 |

---

## 3. 店員與管理端端點 (Staff & Management APIs)

| HTTP 方法 | 路徑 | 最低權限 | 描述 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/staff/branches/:branchId/queue` | Staff | 取得當日即時排隊看板 (服務中、等待、過號) |
| `POST` | `/api/v1/staff/queues/:queueId/call-next` | Staff | 叫下一位號碼 (防並發連續跳號保護) |
| `POST` | `/api/v1/staff/tickets/:ticketId/recall` | Staff | 再次呼叫當前號碼 (推播 LINE 提醒) |
| `POST` | `/api/v1/staff/tickets/:ticketId/pass` | Staff | 叫號未到，標記為過號 (移出當前等待順序) |
| `POST` | `/api/v1/staff/tickets/:ticketId/start-service`| Staff | 標記號碼開始接受服務 |
| `POST` | `/api/v1/staff/tickets/:ticketId/complete` | Staff | 標記服務完成 |
| `POST` | `/api/v1/staff/tickets/:ticketId/insert-next` | Staff | 過號顧客返回現場，插入為下一位順序 |
| `POST` | `/api/v1/staff/tickets/:ticketId/reorder` | Manager | 手動拖曳調整等待佇列排序 |
| `POST` | `/api/v1/staff/reservations/:id/check-in` | Staff | 顧客到店 Check-in (自動產生排隊號碼牌) |
| `POST` | `/api/v1/staff/reservations/:id/no-show` | Staff | 預約逾期未到標記 No-show |
| `GET` | `/api/v1/staff/orders` | Staff | 分店訂單清單 (篩選待付款、已付款) |
| `POST` | `/api/v1/staff/orders/:id/items` | Staff | 門市現場為顧客追加服務或餐點 |
| `POST` | `/api/v1/staff/orders/:id/payments/manual` | Staff | 門市現場收取現金/刷卡，標記項目為已付款 |
| `POST` | `/api/v1/staff/payments/:paymentId/refund` | Manager | 針對特定付款發起全額或部分退款 |
| `POST` | `/api/v1/staff/catalog/items` | Manager | 新增菜單/服務項目 |
| `PATCH` | `/api/v1/staff/catalog/items/:id` | Manager | 調整項目價格、說明或上下架狀態 |
| `POST` | `/api/v1/staff/merchants/:merchantId/invitations`| Manager | 產生員工安全邀請 Token (一次性隨機雜湊) |
| `GET` | `/api/v1/staff/invitations/:token/preview` | 公開/登入 | 預覽邀請門市與被賦予之角色 |
| `POST` | `/api/v1/staff/invitations/:token/accept` | 登入者 | 接受邀請加入門市 (建立成員並綁定 Rich Menu)|
| `POST` | `/api/v1/staff/invitations/:token/revoke` | Manager | 撤銷未被接受的邀請 |
| `GET` | `/api/v1/staff/merchants/:merchantId/audit-logs` | Manager | 查詢敏感操作審計日誌 |

---

## 4. LINE Webhook 整合端點

| HTTP 方法 | 路徑 | 描述 |
| :--- | :--- | :--- |
| `POST` | `/api/v1/webhooks/line` | LINE Messaging API Webhook (校驗 HMAC 簽名，處理加好友與關鍵字) |
