# AntiScam 開發狀態（2026-11-19）

## v0.2（main 測試）

- 原有 v0.1：規則引擎、AI 選擇性複核、管理 UI、Node API、HMAC webhook、稽核、Dry Run、Supabase Schema。
- **新增 `bridge/` 開源 OpenChat LINE.js 轉接器**（Apache-2.0 上游 `mars-tw/anti-scam-helper` 的 WebSocket Bot API）。
- 已寫實際協定轉換：`message` → AntiScam 簽章 webhook；`message:delete`、`member:remove`、`message:send` 的發送與成功回應判定。
- 限制：社群白名單、管理員保護、成員與訊息 ID 配對、重複處置保護、連線斷開降級、所有真實操作預設禁止。
- 上游 `blockMember`（禁止再次入群）與可靠 `readJoin` **不支援／待驗證**，不可宣稱完成。
- 本機：`npm test` **25/25 通過**，含模擬 LINE.js → 真實 AntiScam HTTP API → 模擬 LINE.js 確認的端到端測試。
- `release` 正式分支未修改。


## v0.3 Windows 本機測試工具（2026-11-19）

- 已新增 `bridge/local/`：Windows `01-install-and-login.ps1`、`02-run-monitor.ps1`、本機憑證初始化及五小時監控啟動器。
- 無需 GitHub Actions、雲端主機、Supabase；Node API 以 `HOST=127.0.0.1` 綁定本機，FileStore 留在本機。
- 首次登入須由使用者在本機瀏覽器掃 QR Code，無法從 ChatGPT 對話直接遠端操控其 Windows 電腦。
- **此版只開通真實訊息的監控驗證，絕不自動刪文／踢人**；在實機人工測試通過前不得標記處置功能驗收完成。
- 本機測試未執行在使用者 Windows 電腦；QR 登入、讀取 OpenChat、刪文與踢人均待真實帳號驗收。

## 尚未完成及實際阻礙

1. 專用 LINE 測試帳號 QR 掃碼登入、測試 OpenChat 邀請／授予共同管理員權限。
2. 上游程式安裝、設定、登入及實機驗證；只有這一步能證實真實刪文、踢人、公告是否可用，且非官方登入可能違反 LINE 條款、導致封號。
3. 在合適運行環境正式部署 Node API + Bridge + 上游 LINE.js；設定所需機密與 Supabase 資料表（尚未部署）。
4. 規則誤判、重新登入、斷線、持久化冪等、圖片 QR 判斷及多管理員權限的正式驗收。
5. 如要禁止重新入群，需另找有經驗證的對應管理介面，現有 Bridge 無此能力。

參考 [`bridge/README.md`](./bridge/README.md) 和 [`README.md`](./README.md)。

## 2026-11-20｜Windows 實機驗收進度

- Windows 本機使用 Git 2.55.0.windows.3、Node.js 24.19.0、npm 11.17.0。AntiScam API 與 LINE.js 分別在 `127.0.0.1:3000`、`127.0.0.1:3789` 啟動。LINE.js 已提供 QR 登入頁，需專用測試帳號掃碼。
- Windows 安裝器保留固定上游原始碼版本，更新 undici 與 Vite。更新後 npm audit 回報 0 個已知弱點。LINE.js 的 Windows 本機組態只接受預期的 loopback Host，實測正確 Host 回應 200，其他 Host 回應 403。
- 監控模式可顯示 LINE.js 回報的登入狀態。管理員操作會重查最新白名單，刪文及移出成員的確認回應會比對原聊天室與訊息。
- 真實登入、社群 ID 與管理權限、收訊、刪文、踢人、公告、實機防詐判斷／保護、重連和五小時運作均待驗收。LINE Bridge 暫不支援封鎖重新加入。
