# 工作怪獸 MINI App｜獨立網站、同一後端

更新：2026-11-17

## 不會取代原本 WF 網頁

| 服務 | 網址 | 用途 |
|---|---|---|
| **原本 WF 網頁** | https://hub-google.github.io/LINE/workforce/ | 一般瀏覽器、主管、人資、桌面管理 |
| **工作怪獸 MINI App** | https://hub-google.github.io/LINE/workforce-mini/ | 專用 MINI App 網頁，從 LINE 啟動 |

**兩個獨立網站入口**：各自有自己的 `index.html`、打包部署目錄與版本號；MINI App 多一份專用 `mini.css`，原本網頁不載入它。兩邊共用相同版本的業務邏輯（`app.js`）、Supabase Auth、`wm_` 資料表、RPC、員工資料與角色。部署將同一版本的 JavaScript 複製到兩個不同靜態目錄，不另外建一份資料庫、不增加 Cloudflare Worker。

### LINE Developers 三個 Endpoint URL

進入 [LINE Developers Console](https://developers.line.biz/console/) → 「工作怪獸」的 **LINE MINI App Channel** → **Web app settings**。請把原本的 `/LINE/workforce/?mini=1` 或官方預設 URL 改成：

| LINE 環境 | MINI App 連結 | 必須填寫的 Endpoint URL |
|---|---|---|
| Developing | https://miniapp.line.me/2012649404-nz3TBQdG | **https://hub-google.github.io/LINE/workforce-mini/** |
| Review | https://miniapp.line.me/2012649405-ADWLM7h9 | **https://hub-google.github.io/LINE/workforce-mini/?line_env=review** |
| Published | https://miniapp.line.me/2012649406-KzlLEZT6 | **https://hub-google.github.io/LINE/workforce-mini/?line_env=published** |

LINE Console 的 Review 和 Published 設定是否立即生效，依認證狀態及官方審核／發布同步規則而定；若目前只能改 Developing，先設定 Developing，Review/Published 階段再檢查正確值。

**Scopes**：必須啟用 `openid`（讓 `liff.getIDToken()` 可以取得 ID Token）；`profile` 可保留。`chat_message.write` 非必要，暫時不啟用。MINI App Size 保留 full，Add friend option 保留 Off 即可。請核對 MINI App Provider 與舊 LINE Login/OA Provider 是否一致，否則相同人的 userId 未必相同。 <https://developers.line.biz/en/reference/liff/>

## 系統已完成的部分

1. LINE 前端 SDK 使用每個環境對應的 LIFF ID，`/workforce/` 不會初始化 MINI App。
2. Supabase `wm-line` Edge Function 以 LINE 官方 Verify ID Token 端點驗證 JWT audience、有效期限與使用者 LINE 身分，僅允許已登入且在職的企業成員綁定。
3. 保留既有平台 OA 通知，若新的 LINE 身分和舊綁定不一致，不靜默覆蓋。
4. 公開的 Channel ID、LIFF ID 已寫入專用程式與後端；**不必額外提供 Channel Secret 或 Access Token**。
5. GitHub Actions 分別發布 `/workforce/` 與 `/workforce-mini/`，保留其他 LINE 產品的部署目錄不動。

## 手機實機完整驗收

1. 將測試者 LINE 帳號加入 LINE MINI App Channel 的 Tester／Admin（Developing 只開放授權帳號）。
2. 開啟 [Developing MINI App](https://miniapp.line.me/2012649404-nz3TBQdG)，確認是「工作怪獸」而不是原本 WF 網頁或 LINE 預設頁。
3. 企業帳號登入（Supabase 企業身分），進入「LINE 通知」→「以 LINE 驗證並綁定」。預期只綁到自己所屬公司的在職員工；驗證失敗不得寫入綁定。
4. 用主管、員工各一組帳號操作出勤打卡、排班、請假、補卡、加班、簽核、站內通知、匯出；驗證不同角色權限、不得跨企業查改。
5. iPhone 與 Android 實測 GPS 授權同意／拒絕、室內定位誤差、超出打卡範圍、假定位及 QR 方案。MINI App **不免除定位授權**，也不等於已通過 GPS 防作弊實機驗收。
6. 在 Chrome/Safari 開啟原本 [WF 網頁](https://hub-google.github.io/LINE/workforce/)：檢查預設公開 Demo、企業帳號登入、網頁管理／匯出均無回歸。
7. Developing 驗收通過再依 LINE Console 送 Review，發布 Published。Review 通道預設給 LINE 審核人員使用，Published 通道才是一般使用者入口。

## 尚未完成（需 LINE Console／手機）

- LINE Console 每個環境 Endpoint 改為 **獨立的** `/workforce-mini/`，並確認 `openid` scope。
- LINE 手機端真實身分綁定、GPS、企業全流程 E2E 驗收。
- LINE MINI App 認證及 MINI App Service Messages 審核。原本 `wm-line` 平台 OA 推播**不是**免費 MINI App 服務通知，不會自動切換。

官方參考：[LINE MINI App Console Guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)｜[LINE MINI App Getting started](https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/)。
