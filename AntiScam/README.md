# AntiScam — LINE OpenChat AI 防詐管理系統

**版本：v0.1 開發測試版（2026-11-19）** ｜ **分支：main 測試／release 正式（本次不更新 release）**

- [產品需求 PRD](./PRD.md)（已先行建立於 GitHub）
- [瀏覽器測試台與展示版](./index.html)（GitHub Pages：`https://hub-google.github.io/LINE/AntiScam/`）
- [OpenChat Connector 契約](./docs/CONNECTOR.md)
- [驗收現況與限制](./docs/ACCEPTANCE.md)


## 開源 OpenChat 橋接器（新增：2026-11-19）

已在 [`bridge/`](./bridge/) 新增獨立的 LINE.js WebSocket → AntiScam Connector。參考原始碼為 [mars-tw/anti-scam-helper](https://github.com/mars-tw/anti-scam-helper)（Apache-2.0）；橋接器本身是新寫的轉接程式，不複製 HAO 私有程式碼。

- 上游具 `message` 訊息事件及 `message:delete`、`member:remove`、`message:send` 機器人 API，可與 AntiScam 的 HMAC webhook 和處置 API 相接。
- 新增同原專案的管理員保護、收件聊天室白名單、實際確認回應、API bearer 身分驗證、冪等鍵、斷線降級。
- **預設完全不會刪文或踢人**：需真實 LINE OpenChat 專用測試帳號實測，雙重開關及主程式 DRY_RUN 都設定完成才會允許操作。
- **無法保證封鎖再次加入**：上游只有移出成員，沒有確認 `blockMember`，功能如實標記不支援。`readJoin` 也還沒實機驗證。
- 測試：`npm test` 目前執行 25 項；包含模擬 LINE.js 幀 → 真正 AntiScam HTTP API → 模擬處置回應的整合測試。**尚未使用真實 LINE 帳號進行驗收。**
- 一鍵抓取釘選的開源程式：`sh bridge/bootstrap-linejs.sh`（會安裝到 Git 忽略的資料夾，不啟動、不登入）。詳細流程見 [bridge/README.md](./bridge/README.md)。

### Bridge 額外設定

- `LINEJS_WS_URL`：開源 LINE.js 本機 WebSocket，預設 `ws://127.0.0.1:3789/api/ws`。
- `LINEJS_API_TOKEN`：開源 LINE.js 在**專用測試帳號登入後**由 CLI 產生；不可寫進 Git。
- `OPENCHAT_CHAT_IDS`：只有列在白名單內的 OpenChat 會轉入 AntiScam。
- `OPENCHAT_BRIDGE_TOKEN`：自產隨機長密鑰，AntiScam 與 Bridge 兩端相同。
- `OPENCHAT_LIVE_VERIFIED`、`OPENCHAT_ACTIONS_ENABLED`：預設 false；通過實機權限驗證並核准後才可開啟。
- `WEBHOOK_SECRET`：AntiScam 主程式與 Bridge 兩端相同的隨機金鑰。

**LINE 風險**：上述上游為非官方 API，可能違反 LINE 條款並導致帳號被限制。請勿用正式 LINE 帳號、未經授權的社群或主帳號測試。


## Windows 本機實機測試（2026-11-19）

不需雲端主機或 GitHub Actions。已新增 [Windows 本機啟動器與操作教學](./bridge/local/README.md)，在你自己的電腦以專用 LINE 測試帳號完成 QR 掃碼登入，並以 **Dry Run／僅監控** 方式驗證真實 OpenChat 訊息。資料、Session 和密鑰留在本機；尚未實測成功前不得聲稱自動刪文／踢人已驗收。

## 已實作

1. **規則引擎**：繁簡／全半形／零寬字正規化、危險語意組合、網址黑名單、短網址、洗版、新成員觀察、正常防詐新聞語境減權。
2. **AI 複核（可選）**：Gemini 分類，伺服器端 API 金鑰，預設關閉；AI 判斷不會單獨觸發踢人。
3. **事件管理**：簽章 webhook、成員匿名識別、AES-256-GCM 加密操作用 ID、事件去重、處置去重、稽核記錄。
4. **處置政策**：預設只監控；全自動須管理員明確確認。Dry Run 預設開啟；沒有驗證連接器就無法做 LINE 實際操作。
5. **管理後台**：總覽、事件列表、訊息試判、逐群規則、封鎖網域、能力與系統狀態；響應式手機／桌面 UI。
6. **後端**：Node.js 22+ 原生 HTTP API（零 npm runtime 依賴）；本機檔案儲存，以及可選 Supabase PostgREST 儲存。
7. **測試**：`npm test`，含防誤判、權限保護、Dry Run、簽章驗證、持久化、重送去重、API 登入等案例。

### 尚未完成（主要阻塞）

LINE 官方 Messaging API **不能直接賦予 OpenChat 的訊息監控、刪除他人訊息與踢出成員能力**。現有程式已經留好獨立 Connector 契約，但**現在已新增一個實驗性開源 Bridge，**但尚未由真實 LINE 帳號驗證社群管理權限**；不能聲稱可以真實自動踢人或刪文**。網頁的 GitHub Pages 版本是展示與本機風險分析，不是已上線的保護服務。

不以破解私有協定、盜用 LINE 憑證或繞過服務限制為安裝方式。若未來取得合法穩定的 Connector，先在測試社群逐項實機驗收。

## 架構

```text
                           GitHub Pages 展示 UI
                                (demo)
                                   │
                           分析規則（瀏覽器）

管理後台（Node 同源頁面） ←HTTPS→ Node API / Sessions
                                     │
             ┌───────────────────────┴──────────────────────┐
             ↓                                              ↓
        AntiScam Service                             Connector interface
       Rules / optional AI                           (尚待授權接入)
             │                                              │
         FileStore                                   LINE OpenChat（未接通）
      or Supabase PostgREST
```

**安全設定**：`NODE_ENV=production` 時必須使用 Supabase 儲存；設定 `DRY_RUN=false` 時必須提供 Connector URL 與 Token。實機能力仍要由 Connector 回報並逐次確認，不可因關掉 Dry Run 就視為成功。

## 本機啟動

```bash
cd AntiScam
cp .env.example .env
# 產生隨機管理密碼、Webhook Secret 和 32-byte 加密金鑰，填入 .env
node --env-file=.env src/server.js
# http://localhost:3000
npm test
```

可用以下方式產生安全亂數：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

建議分別產生 `WEBHOOK_SECRET`（至少 24 字元）及 `DATA_ENCRYPTION_KEY`（64 個十六進位字元）；`ADMIN_PASSWORD` 設至少 12 位長密碼。絕不可把 `.env` 或 GitHub Secrets 的實際內容提交 Repo；正式環境需以主機環境變數注入。

### 一次性資料庫準備（選用）

正式部署前在**指定的測試 Supabase 專案**檢視並執行 [supabase/schema.sql](./supabase/schema.sql)，再設：

```text
STORAGE_DRIVER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...  # server-side ONLY
NODE_ENV=production
```

**尚未在使用者現有 Supabase 執行 SQL 或建立資料表。** Supabase Service Role Key 只能放後端 Secrets，不得寫進 GitHub Pages／網頁 JS。Schema 已開啟 RLS，禁止一般 anon／authenticated 存取。

## 需要的 Token／權限

| 必要程度 | 名稱 | 用途／來源 |
| --- | --- | --- |
| 啟動後端必要（自行產生，非外部 Token） | `ADMIN_PASSWORD` | 後台登入密碼；長度至少 12，需由開發或部署管理者設定 |
| 啟動後端必要（自行產生） | `WEBHOOK_SECRET` | Connector → AntiScam HMAC-SHA256 事件簽章（24+ 字元） |
| 啟動後端必要（自行產生） | `DATA_ENCRYPTION_KEY` | AES-256-GCM 加密成員操作識別碼（64 hex） |
| 正式 PostgreSQL 儲存必要 | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | 後端資料儲存；需在指定 Supabase 專案建 `as_` 表格 |
| 真實 OpenChat 自動操作必要 | `OPENCHAT_BRIDGE_URL` + `OPENCHAT_BRIDGE_TOKEN` | 本專案已新增 Bridge 程式，Token 可自行產生；**實機權限尚未驗證**，沒有官方 OpenChat API Key 可直接替代 |
| 選用 AI | `GEMINI_API_KEY` | Gemini AI 二次判斷；`AI_ENABLED=true` 才會使用 |
| GitHub | Repo `hub-google/LINE` 的程式碼寫入權限 | 已用於本次 main 開發；GitHub Actions 需允許執行測試 |
| LINE OpenChat | **測試群共同管理員**（可刪其他成員訊息、踢出與封鎖、發公告） | 權限需在 OpenChat 實際授予經驗證的專用帳號，再逐項實機測試；不是 LINE OA 的 Messaging API Token |

**不需要**：LINE Pay Token、LINE OA Channel Access Token（用於此 OpenChat 目標）、Cloudflare Workers/R2 Key、LIFF ID。若後續增加 OA 通知等獨立功能，再另外評估相關 Token。

## 安全限制與下階段工作

- 本版為**單一管理員**驗證，尚未提供多管理員 RBAC、密碼重設、多因素驗證或租戶隔離的正式 SaaS 功能。請勿直接公開部署為多租戶商用服務。
- 本機 FileStore 僅適用單進程開發，不適合多台主機併發。多實例公告冷卻目前保存在本機記憶體；需要共享限流後才能正式啟用自動公告。
- AI 分析會把待分析訊息送交外部 AI 供應商，須先確認社群告知與資料處理政策；預設關閉。
- 事件摘要保留期限與刪除排程尚未實作；啟用正式儲存前須補資料留存政策。
- 應先驗收 Connector 的讀取訊息、刪文、移除、封鎖、公告功能，再啟用真實處置；未驗收功能保持關閉。
- `main` 用於測試；**不動 `release`**。使用者要求上正式時直接使 release 對齊 main，不進行手動 merge。
