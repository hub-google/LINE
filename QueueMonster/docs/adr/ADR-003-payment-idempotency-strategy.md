# ADR-003: 支付冪等性與項目級金流一致性防護策略

## 狀態 (Status)
Accepted (已採納)

## 背景與問題脈絡 (Context)
在門市點餐與預約付款場景中，金流常見的嚴重風險包括：
1. **Double Tap / 重複扣款**：使用者在網路不穩定或卡頓時重複點擊支付按鈕。
2. **Confirm URL 重整攻擊**：完成 LINE Pay 授權後跳轉回 `confirmUrl`，若使用者手動重新整理頁面，可能導致系統重複向 LINE Pay 請款或多次將未付款項目標記重複已付。
3. **金額篡改**：惡意用戶竄改前端發送的請求金額（例如將 $2000 改為 $1）。
4. **部分項目追加付款**：客人可能先結清部分項目，現場追加其他服務後再次付款，若僅靠全單 boolean `is_paid` 無法表達正確財務狀態。

## 決策 (Decision)
1. **伺服器端唯一計價 (Server-Side Price Authority)**：
   - 前端發起支付請求時，僅傳遞 `orderId` 與待支付的 `orderItemIds` 清單。
   - 應付總額一律由後端查詢資料庫快照單價加總計算，嚴格忽略任何客戶端傳入之金額欄位。
2. **雙重唯一約束保證冪等 (Idempotency Key & External Transaction ID)**：
   - 建立 `idempotency_records` 資料表：所有寫入操作支援 `Idempotency-Key` Header。若相同 Key 在 24 小時內重發，且 Request Hash 一致，直接回傳既有回應。
   - 在 `payments` 資料表建立複合唯一約束：`UNIQUE(provider, external_transaction_id)`。保證同一筆 LINE Pay `transactionId` 絕不可能在系統內被核銷二次。
3. **資料庫交易與項目級行級鎖 (Item Row Lock & Allocation)**：
   - 在建立 `Payment` 與呼叫 LINE Pay 請求前，使用 `SELECT ... FOR UPDATE` 鎖定所有被選中的 `order_items`。
   - 確保該品項狀態目前為 `UNPAID` 或 `PARTIALLY_PAID`，防止兩個並發請求同時支付同一項目。
   - 核銷成功時，在同一 Transaction 內寫入 `payment_allocations` 並更新項目狀態為 `PAID`。
4. **LINE Pay Online API v4 簽章規範**：
   - 嚴格採用 Server-to-Server HMAC-SHA256 簽名，所有 API Secret 永不外洩至瀏覽器。

## 影響與後果 (Consequences)
- **正面優勢**：杜絕重複扣款、杜絕重整漏洞、杜絕金額竄改，支援精確到單一品項的退款與追加款記帳。
- **維護成本**：每筆支付需要建立明確的分配紀錄 (`payment_allocations`)，退款時需針對分配扣減。
