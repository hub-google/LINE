# 角色與權限矩陣規格書 (RBAC Matrix)

> 依據需求書：第 7 節、第 8 節與第 42 節  
> 原則：權限檢驗在後端執行，拒絕依賴前端 state 或 Rich Menu 作為授權依據。

---

## 1. 角色定義

| 角色標識 | 角色名稱 | 適用對象 | 權限範圍簡述 |
| :--- | :--- | :--- | :--- |
| `CUSTOMER` | 一般顧客 | 所有透過 LINE 登入的訪客/消費者 | 預約、現場取號、查看個人票夾、點餐購物車、LINE Pay 自助付款 |
| `STAFF` | 門市基層人員 | 門市一般櫃台、服務人員 | 當日叫號控制、預約核銷、查看必要訂單、現場追加項目、現金結帳 |
| `MANAGER` | 門市店長 / 主管 | 分店主管、營運經理 | 包含 Staff 權限，額外具備佇列強制作業、預約排程管理、品項上下架、管理 Staff |
| `OWNER` | 店家擁有者 / 老闆 | 品牌負責人、法人負責人 | 最高管理權限：包含 Manager 權限，額外具備多門市設定、進階財務與成員管理 |

---

## 2. 細粒度權限清單 (Permissions)

```text
queue.read              # 檢視排隊清單與當前狀態
queue.call              # 執行叫號 (call-next / recall)
queue.reorder           # 調整等待順序 (insert-next / reorder)
queue.cancel            # 取消號碼牌

reservation.read        # 檢視預約列表
reservation.manage      # 新增/異動/核銷/標記 No-show

order.read              # 檢視訂單清單與細項
order.create            # 建立訂單 (消費者自助或店員代開)
order.edit              # 追加項目或調整備註
order.checkout          # 執行現場收款 (現金/刷卡)

payment.read            # 檢視付款流水與對帳狀態
payment.collect         # 建立收款記錄
payment.refund          # 執行退款作業 (僅 Manager / Owner)

catalog.read            # 讀取菜單與服務品項
catalog.manage          # 新增/修改/下架品項與價格

member.read             # 檢視門市成員名單
member.invite           # 產生邀請連結 / 邀請新員工
member.manage           # 修改成員權限或撤銷成員資格

merchant.settings.read  # 檢視營業時間與分店設定
merchant.settings.write # 修改營運規則與分店參數

audit.read              # 檢視敏感操作審計日誌
```

---

## 3. 角色與權限映射矩陣

| 權限項目 | CUSTOMER | STAFF | MANAGER | OWNER |
| :--- | :---: | :---: | :---: | :---: |
| `queue.read` | 僅本人號碼與公開看板 | ✅ | ✅ | ✅ |
| `queue.call` | ❌ | ✅ | ✅ | ✅ |
| `queue.reorder` | ❌ | 僅允許插下一位 | ✅ | ✅ |
| `queue.cancel` | 僅本人號碼 | ✅ | ✅ | ✅ |
| `reservation.read` | 僅本人預約 | ✅ | ✅ | ✅ |
| `reservation.manage` | 僅本人取消 | ✅ (Check-in/No-show) | ✅ (含時段調整) | ✅ |
| `order.read` | 僅本人訂單 | ✅ | ✅ | ✅ |
| `order.create` | ✅ (自助訂單) | ✅ (現場代開) | ✅ | ✅ |
| `order.edit` | 僅允許未付款前追加 | ✅ (現場追加項目) | ✅ | ✅ |
| `order.checkout` | 僅線上 LINE Pay | ✅ (現場現金) | ✅ | ✅ |
| `payment.read` | 僅本人帳單 | ✅ | ✅ | ✅ |
| `payment.collect` | ❌ | ✅ | ✅ | ✅ |
| `payment.refund` | ❌ | ❌ | ✅ | ✅ |
| `catalog.read` | ✅ | ✅ | ✅ | ✅ |
| `catalog.manage` | ❌ | ❌ | ✅ | ✅ |
| `member.read` | ❌ | ❌ | ✅ | ✅ |
| `member.invite` | ❌ | ❌ | 僅能邀請 Staff | 可邀請 Manager / Staff |
| `member.manage` | ❌ | ❌ | 僅能管理 Staff | 可管理所有人 (含指派 Owner) |
| `merchant.settings.read` | 僅公開營業狀態 | ✅ | ✅ | ✅ |
| `merchant.settings.write` | ❌ | ❌ | 僅限排隊開關 | ✅ |
| `audit.read` | ❌ | ❌ | 門市層級 | 全商家 |

---

## 4. 關鍵防護規則 (Security Invariants)

1. **最後一個 Owner 保護原則**：系統禁止刪除或撤銷商家最後一位 Owner，若需移轉擁有者，必須先新增或升級另一位成員為 Owner，方可降級或撤銷原 Owner。
2. **反越權升級 (Privilege Escalation Prevention)**：
   - 請求主體 (Actor) 永遠不能邀請或授權「高於或等於自己角色層級」的人員（例如 Manager 無法邀請 Owner 或 Manager）。
   - 請求 Payload 內的 `role` 欄位必須通過 Role Hierarchy 驗證。
3. **即時撤權 (Immediate Revocation)**：
   - 當成員被標記為 `REVOKED`，下一個 API 呼叫必須因 DB 即時查驗而立即回傳 `403 Forbidden`，不可等待 JWT 過期。
   - 同步觸發 LINE Messaging API 解綁 Per-user Rich Menu，自動還原為預設顧客選單。
