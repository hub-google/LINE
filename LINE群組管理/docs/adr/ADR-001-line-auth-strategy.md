# ADR-001: LINE 身分驗證與內部 Session 管理策略

## 狀態 (Status)
Accepted (已採納)

## 背景與問題脈絡 (Context)
系統前端採用 LIFF (LINE Front-end Framework) 作為顧客端與店員端的主要互動容器。
然而在安全性上，常見致命漏洞為：
1. 前端直接將 `liff.getProfile()` 取得的 `userId` 作為 API Request Body 或 Header 傳入。
2. 攻擊者任意偽造 `lineUserId` 即可冒名他人取號、窺探訂單甚至執行店員端特權操作。
3. 外部直接使用 LINE Access Token 作為每次 API 呼叫的 Token，會造成對 LINE 官方 API 頻繁請求，容易撞上 Rate Limit，且無法實作伺服器端即時撤銷 (Revoke)。

## 決策 (Decision)
1. **拒絕信任客戶端直接宣告之身分**：後端所有身分判定一律不接受客戶端傳入之 `lineUserId`。
2. **兩階段憑證交換 (Two-Step Token Exchange)**：
   - 步驟一：前端 LIFF 初始化登入成功後，取得短期 `lineAccessToken`。
   - 步驟二：前端呼叫 `POST /api/v1/auth/line/exchange` 傳送 `lineAccessToken`。
   - 步驟三：後端透過 HTTPS 呼叫 LINE 官方端點 `https://api.line.me/oauth2/v2.1/verify` 驗證 Token 合法性與 Channel ID 歸屬，安全解析出真實可信的 `line_user_id`。
3. **簽發高時效內部 Session Token (JWT)**：
   - 後端在 DB 建立/更新 `users` 記錄後，簽發包含內部 `userId` 的 JWT (有效期間 24 小時)。
   - 後續所有業務 API 一律透過 `Authorization: Bearer <sessionToken>` 訪問。
4. **即時權限查驗 (Stateful RBAC Evaluation)**：
   - 雖然 Session 為 JWT，但所有管理端或涉及租戶資料的請求，必須即時查詢 `merchant_members` 狀態。
   - 若成員已被標記為 `REVOKED`，即便 JWT 仍在有效期間，亦立即回傳 `403 Forbidden`。
5. **本地開發與測試之安全模擬**：
   - 提供 `MOCK_LINE_SERVICES=true` 開關，在測試環境可支援 Mock Token 交換，降低本地與 CI 測試門檻。

## 影響與後果 (Consequences)
- **正面優勢**：杜絕身分偽造與 IDOR 越權；減輕對 LINE 驗證端點的頻繁負擔；支援成員權限被撤銷時立即阻擋。
- **維護成本**：後端需維護 JWT 密鑰 (`SESSION_SECRET`) 與登入交換邏輯。
