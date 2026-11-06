# ADR-002: 號碼與排隊服務順序解耦策略

## 狀態 (Status)
Accepted (已採納)

## 背景與問題脈絡 (Context)
門市排隊最常遭遇的情況是「過號客回歸 (Returned)」或「VIP / 預約到店插單」。
傳統簡易系統常採用單一指標 `current_number`：
- 例如目前叫到 50 號，若 25 號過號客回來，若將 `current_number` 設回 25，流水號即時倒退，會導致 26~49 號的客人誤以為系統錯亂，且前方等待人數、預估時間全數崩壞。
- 若直接在關聯資料表大批更新每一筆 ticket 的 `rank` 欄位（例如 `rank = rank + 1`），在並發叫號與排隊量大時會造成頻繁的 Row Lock 競態與資料庫效能低落。

## 決策 (Decision)
1. **號碼與順序完全解耦 (Decouple Number from Order)**：
   - `queue_tickets.ticket_number`（展示如 A025）：為顧客永久唯一取號標識，一經發行終身不變。
   - `queue_positions.sort_key`：獨立資料表管理等待中客人的叫號先後順序。
2. **採用微小重排成本之排序鍵演算法 (Fractional Index / LexoRank)**：
   - 每個排隊票券在等待佇列中擁有一個浮點數值 `sort_key` (預設間距為 1000.00，例如 1000, 2000, 3000...)。
   - 當過號客（例如 25 號）返回現場被指定為「下一位」時：
     - 取得目前第一順位待叫號票券之 `sort_key` (如 1000.00)。
     - 25 號的新 `sort_key` 設為 `1000.00 / 2 = 500.00`。
     - 僅需更新 25 號單一筆記錄，其餘 51, 52, 53 號完全毋需改動！
   - 當進行任意位置拖曳插入時，取目標位置前後兩筆 `sort_key` 之平均值 `(prev_key + next_key) / 2`。
3. **並行叫號原子保護 (Atomic Concurrency Control)**：
   - 叫號邏輯使用 `SELECT ... FROM queue_positions ORDER BY sort_key ASC LIMIT 1 FOR UPDATE`。
   - 確保多位店員同時按下「叫下一位」時，僅有一位能成功取出第一順位並標記為 `CALLED`。

## 影響與後果 (Consequences)
- **正面優勢**：過號客插單不破壞原有號碼序列；顧客端介面不會看到號碼倒退；插單與重排僅需更新極少數 Row，效能卓越。
- **邊界維護**：若在同一間隙內連續插入極多次導致浮點精度極限時，系統應於離峰或自動觸發空間重新均分 (Rebalance)。
