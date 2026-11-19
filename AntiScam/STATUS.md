# AntiScam 開發狀態（2026-11-19）

## v0.1 已提交到 main

- 防詐規則引擎、網域封鎖、洗版與新成員偵測、反詐新聞減權。
- Gemini AI 選擇性複核（預設關閉，不單獨作為踢人依據）。
- 網頁管理後台：總覽、事件、測試台、社群設定、系統狀態；GitHub Pages 僅展示模式。
- Node.js 22 API：管理密碼登入、簽章 webhook、處置冪等、稽核、Dry Run。
- 本機檔案儲存與 Supabase PostgREST 後端驅動；提供 `supabase/schema.sql`，尚未在正式資料庫執行。
- `npm test` 已在本地執行：**16/16 通過**；GitHub Actions 工作流程已提交，線上執行狀態另驗。
- `release` 未修改。

## 尚未完成／開通條件

- **OpenChat 真實連接器尚未取得**：官方 Messaging API 無法直接完成 OpenChat 監控、刪除他人訊息與踢出；因此尚不可真正自動處置。
- 尚未部署持續運行的 Node API、正式資料庫 migration，也尚未用真實 LINE 社群驗證。
- 正式商用的多租戶權限、資料保留清理與多實例公告限流尚未完成。
- [必備 Token／權限說明](./README.md#需要的-token權限)；[連接器規格](./docs/CONNECTOR.md)。
