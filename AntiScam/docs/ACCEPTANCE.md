# 目前交付與真實限制（2026-11-19）

| 項目 | 狀態 | 測法／後續工作 |
| --- | --- | --- |
| 規則引擎、繁簡／零寬字、網址比對 | 已實作 | `npm test` |
| 釣魚網址封鎖清單、社群模式 | 已實作 | API 與測試案例 |
| Gemini AI 二次判斷 | 已實作、預設關閉 | 需 `GEMINI_API_KEY`；不能單獨決定踢人 |
| 新成員觀察、洗版計分、管理員保護 | 已實作 | 輸入 Connector 已簽章事件 |
| 防重複事件、處置稽核、限流公告 | 已實作 | Node tests；單機公告冷卻（多實例待改） |
| 本機檔案與 Supabase 兩種儲存 | 已實作 | 本機測試；Supabase 真實連線待提供密鑰和執行 SQL |
| 管理員登入與 API | 已實作 | 安全 Cookie、基本限速，生產仍需專業部署和防護 |
| 手機與電腦網頁後台 | 已實作 | GitHub Pages 僅展示模式、真正管理需部署 Node API |
| 取得 OpenChat 訊息 | **待 Connector** | 官方 OA API 不適用於 OpenChat |
| 從 OpenChat 刪他人訊息、踢人、封鎖 | **待 Connector** | 必須經測試帳號與測試群實機成功才可說已完成 |
| 正式 SaaS 上線與多管理員權限 | 未完成 | 需要正式伺服器、身份驗證提升、營運監控 |

## 手動驗收

1. 在 GitHub Pages 進入 `LINE/AntiScam/`，確認畫面明確標註「示範模式」及未連 LINE。
2. 輸入「我在研究保證獲利詐騙新聞」不應得到自動踢人的決策。
3. 使用「官方客服請立即轉帳並輸入驗證碼 https://fraud.example」應產生高風險分析；網域需另行確認封鎖才可自動處置。
4. 本地 Node API 新增 `test-community`，以 HMAC 發送 message.created，查看事件頁。
5. 開啟自動模式但 `DRY_RUN=true`，確認動作結果為 `dry_run` 且不會顯示「已踢出」。
6. 重送相同 `eventId`，確認 `duplicate:true` 且未重做動作。
7. 登入失敗、錯誤 webhook 簽章、未知群、管理員白名單案例必須拒絕或保護。
8. Supabase migration 先在**測試專案**執行；不要直接對共用正式 DB 未驗證地建表。
