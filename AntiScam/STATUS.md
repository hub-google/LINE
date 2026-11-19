# AntiScam 開發狀態（2026-11-19）

## v0.2（main 測試）

- 原有 v0.1：規則引擎、AI 選擇性複核、管理 UI、Node API、HMAC webhook、稽核、Dry Run、Supabase Schema。
- **新增 `bridge/` 開源 OpenChat LINE.js 轉接器**（Apache-2.0 上游 `mars-tw/anti-scam-helper` 的 WebSocket Bot API）。
- 已寫實際協定轉換：`message` → AntiScam 簽章 webhook；`message:delete`、`member:remove`、`message:send` 的發送與成功回應判定。
- 限制：社群白名單、管理員保護、成員與訊息 ID 配對、重複處置保護、連線斷開降級、所有真實操作預設禁止。
- 上游 `blockMember`（禁止再次入群）與可靠 `readJoin` **不支援／待驗證**，不可宣稱完成。
- 本機：`npm test` **25/25 通過**，含模擬 LINE.js → 真實 AntiScam HTTP API → 模擬 LINE.js 確認的端到端測試。
- `release` 正式分支未修改。

## 尚未完成及實際阻礙

1. 專用 LINE 測試帳號 QR 掃碼登入、測試 OpenChat 邀請／授予共同管理員權限。
2. 上游程式安裝、設定、登入及實機驗證；只有這一步能證實真實刪文、踢人、公告是否可用，且非官方登入可能違反 LINE 條款、導致封號。
3. 在合適運行環境正式部署 Node API + Bridge + 上游 LINE.js；設定所需機密與 Supabase 資料表（尚未部署）。
4. 規則誤判、重新登入、斷線、持久化冪等、圖片 QR 判斷及多管理員權限的正式驗收。
5. 如要禁止重新入群，需另找有經驗證的對應管理介面，現有 Bridge 無此能力。

參考 [`bridge/README.md`](./bridge/README.md) 和 [`README.md`](./README.md)。
