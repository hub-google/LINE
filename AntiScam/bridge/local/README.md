# AntiScam — Windows 本機測試（不使用雲端主機）

這是 **LINE OpenChat 真實環境的本機測試啟動器**，讓 LINE.js 登入工作階段、AntiScam 規則引擎、資料與金鑰只存在你的 Windows 電腦。

**目前交付的是監控驗證流程，不代表已在真實 LINE 成功刪文／踢人。** 這兩項需在取得可驗證的真實訊息後，額外以參與者同意的測試案件逐項開通。預設 `DRY_RUN=true`、`mode=monitor`、`OPENCHAT_ACTIONS_ENABLED=false`，任何詐騙訊息都不會自動踢人。

## 前置條件

- Windows 10/11、PowerShell 5.1 或更新版本、[Node.js 22+](https://nodejs.org/)、[Git for Windows](https://git-scm.com/download/win)。
- 一個**專用** LINE 測試帳號（已獲測試 OpenChat 共同管理員資格）。
- 電腦連網；只需在初次安裝時向 GitHub/npm 下載程式，並與 LINE 伺服器進行登入／訊息收發。**LINE 登入憑證不會上傳到 GitHub Actions、Supabase 或任何自建雲端主機**。
- 請把專案放在自己的 Windows 使用者目錄（例如 `C:\AntiScamTest`），不要放共享硬碟、公用電腦、OneDrive 同步資料夾。勿執行其他人傳來的不明啟動檔。

## 取得程式（只下載 AntiScam；不拉整個大型 LINE Repo）

PowerShell 執行：

```powershell
git clone --depth 1 --filter=blob:none --sparse --branch main https://github.com/hub-google/LINE.git
cd LINE
git sparse-checkout set AntiScam
```

也可以從本次對話提供的 ZIP，解壓縮後直接在該資料夾開 PowerShell；ZIP 不包含任何登入憑證。

## 01. 安裝及登入（只在本機掃碼）

在 `LINE` Repository 根目錄執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\AntiScam\bridge\local\01-install-and-login.ps1
```

此步會安裝固定版本的 Apache-2.0 開源 [`mars-tw/anti-scam-helper`](https://github.com/mars-tw/anti-scam-helper)，本機建置、產生隨機 API 密鑰（只寫入 `.env`），並在本機啟動 LINE.js。

在瀏覽器開啟 **http://127.0.0.1:3789**，點 QR 登入，用**專用測試 LINE 帳號**完成掃碼／PIN 驗證；登入後開啟測試 OpenChat，右鍵該聊天室，取得其 **內部聊天室 ID（以 `m` 開頭）**。這個 ID 與 `line.me/ti/g2/...` 的邀請連結**不同**。

確認成功登入且拿到 ID 後，在啟動視窗按 `Ctrl+C` 正常結束 LINE.js。登入憑證留在 `AntiScam/bridge/.runtime/anti-scam-helper/session.json`；**絕不可複製到 GitHub、聊天內容或其他人電腦**。

## 02. 啟動五小時本機監控測試

將 `m...` 替換成上一步看到的真實聊天室 ID：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\AntiScam\bridge\local\02-run-monitor.ps1 -ChatId m你的聊天室ID
```

此步會將 LINE.js Bot API 限縮到指定社群、產生本機 Bot API Token（仍留在 `.env`）、啟動三個本機進程：

- LINE.js：`http://127.0.0.1:3789` — 已授權的 LINE 帳號與訊息接收
- AntiScam：`http://127.0.0.1:3000` — 繁體中文後台、偵測紀錄
- Bridge：`http://127.0.0.1:3010` — 本機轉接器，不對外開放

登入 AntiScam 後台的密碼由安裝器隨機產生，**只在你的電腦** `AntiScam/.env` 的 `ADMIN_PASSWORD` 這一行。不要拍照、分享檔案或將它貼到聊天中。

在測試 OpenChat 使用第二個**已同意測試**的帳號發送一般訊息及**不含真實釣魚網址**的模擬詐騙訊息，確認後台有收到來源事件及風險判斷；第一階段**只監控，不執行刪文、踢人**。之後再用明確確認的人工測試步驟驗證管理員操作。

5 小時後程序自動停止；也可以隨時在 PowerShell 視窗按 `Ctrl+C`。電腦睡眠、斷線或關閉視窗都會中斷測試，不保證持續 5 小時。

## 安全與限制

1. 這次測試不需要 GitHub Actions、不需要 VPS、不需要 Cloudflare、不需要 Supabase，也不必提供 LINE 密碼或 Session。
2. 首次 Git/npm 下載與 LINE 帳號登入仍需要連線到第三方網路服務；**「本機執行」不等於離線**。
3. `AntiScam/.env`、`AntiScam/bridge/.env`、`.runtime/.../session.json` 都只保存在本機。請勿透過 Git commit、雲端同步、遠端桌面分享或螢幕截圖外傳。
4. 使用非官方 LINE.js 可能受到 LINE 服務條款與風控限制，建議只用專用測試帳號。
5. `readJoin` 與禁止被踢成員重新加入仍不是已驗證功能；不要把既有的「移除成員」誤認為永久封鎖。
6. 本機安全碼若遺失，可在你自己的電腦重新產生；請勿將實際金鑰貼給 ChatGPT。

測試狀態記錄：[../../STATUS.md](../../STATUS.md)。
