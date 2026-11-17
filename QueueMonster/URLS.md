# Queue Monster 專案網址

原始碼資料夾更名為 `QueueMonster/`；GitHub repository 維持 `hub-google/LINE`，公開網站維持 `/booking/`。

| 用途 | 網址 |
|---|---|
| GitHub 專案 | https://github.com/hub-google/LINE/tree/main/QueueMonster |
| 網站原始碼 | https://github.com/hub-google/LINE/tree/main/QueueMonster/saas |
| 需求文件 | https://github.com/hub-google/LINE/blob/main/QueueMonster/PRD.md |
| 網站需求補充 | https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md |
| GitHub Pages 測試入口（main） | https://hub-google.github.io/LINE/booking/ |
| Cloudflare 正式入口（release 快照；LINE LIFF 尚待真人驗收） | https://queue.monsterport.com/ |
| 舊測試子網域（保留相容，不作新入口） | https://qm.monsterport.com/ |
| 品牌首頁 | https://hub-google.github.io/LINE/booking/home.html |
| 找店家 | https://hub-google.github.io/LINE/booking/directory.html |
| 店家申請 | https://hub-google.github.io/LINE/booking/merchant-register.html |
| 商家中心 | https://hub-google.github.io/LINE/booking/merchant-center.html |
| 平台後台 | https://hub-google.github.io/LINE/booking/?view=platform |
| 店員後台 | https://hub-google.github.io/LINE/booking/?view=staff&merchant=greenfield-salon |
| 顧客入口 | https://hub-google.github.io/LINE/booking/?view=customer&merchant=greenfield-salon |
| 顧客預約 | https://hub-google.github.io/LINE/booking/?view=customer&merchant=greenfield-salon&tab=reserve |
| 顧客取號 | https://hub-google.github.io/LINE/booking/?view=customer&merchant=greenfield-salon&tab=queue |
| 公開叫號看板 | https://hub-google.github.io/LINE/booking/board.html?merchant=greenfield-salon |
| QR 海報 | https://hub-google.github.io/LINE/booking/poster.html?merchant=greenfield-salon |
| 隱私政策 | https://hub-google.github.io/LINE/booking/privacy.html |
| 服務條款 | https://hub-google.github.io/LINE/booking/terms.html |
| LIFF | https://liff.line.me/2012346974-bmC3fZuf |
| 舊版相容入口 | https://hub-google.github.io/LINE/saas/ |
| 後端 | https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge |
| LINE Webhook | https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook |
| Supabase 管理 | https://supabase.com/dashboard/project/unapiwajmgqqtdkixaab |
| 測試站部署紀錄 | https://github.com/hub-google/LINE/actions/workflows/line-saas-pages.yml |
| 正式版手動發布工作流程 | https://github.com/hub-google/LINE/actions/workflows/queue-monster-production-release.yml |
| 正式快照來源（不作對外入口） | https://hub-google.github.io/LINE/queue-prod/ |
| 雙環境發布文件 | https://github.com/hub-google/LINE/blob/main/QueueMonster/docs/DEPLOYMENT-ENVIRONMENTS.md |
| LINE 後端部署 | https://github.com/hub-google/LINE/actions/workflows/line-oa-deploy.yml |
| LINE 圖文選單部署 | https://github.com/hub-google/LINE/actions/workflows/line-rich-menu.yml |

`greenfield-salon` 是既有示範商家代碼；正式商家請換成自己的代碼。後台須有相應權限。

## Cloudflare 正式網域（2026-11-17，現行）

- 正式：**https://queue.monsterport.com/**（品牌首頁為根路徑）。
- 顧客、店員、平台維持原有查詢參數路由 `/?view=customer&merchant=...`、`/?view=staff&merchant=...`、`/?view=platform`；由 Cloudflare Pages 靜態建置腳本完成客戶端路由兼容。
- Cloudflare Pages 專案：`monsterport-queue`；來源 GitHub `hub-google/LINE` 的 `gh-pages/queue-prod/`，由 `gh-pages` 根目錄 `cf-pages-queue-build.mjs` 建置成靜態 `dist/`。
- DNS：`queue.monsterport.com` → CNAME `monsterport-queue.pages.dev`（Cloudflare Proxy 開啟）。
- **不再使用 Worker 中轉**：舊 `monsterport-queue-bridge` 保留程式但已移除網域綁定。Cloudflare Pages 專案不使用 Functions，靜態資源不消耗 Workers requests。
- `main` 更新 GitHub Pages 測試站，只有正式發布到 `release` 並更新 `gh-pages/queue-prod/` 後，Cloudflare Pages 才更新正式站。
- 資料庫、Supabase Auth、LINE LIFF 與 LINE OA 通知全部沿用原後端，沒有搬遷。
- 詳細部署流程與注意事項：[`docs/DEPLOYMENT-ENVIRONMENTS.md`](./docs/DEPLOYMENT-ENVIRONMENTS.md)。
- Google、LINE 真人登入及實際預約／訂餐／通知仍需由具權限的測試帳號做端對端驗收，不能只依網頁 HTTP 200 判定完成。

## 雙網站登入設定（2026-11-16）

- 正式入口：`https://queue.monsterport.com/`（根目錄直接顯示品牌首頁）；原 GitHub Pages `https://hub-google.github.io/LINE/booking/` 同時保留。
- Google 與 Email Auth：同一 Supabase 專案，同時允許 `https://queue.monsterport.com/**`、`https://hub-google.github.io/LINE/booking/**`、既有 `/LINE/saas/**`。登入會回到發起操作的同一網域。
- LINE：保留舊 LIFF ID 的 Endpoint `https://hub-google.github.io/LINE/booking/`，為正式新網域新增**同一 LINE Login Channel 下的第二個 LIFF ID**，Endpoint `https://queue.monsterport.com/`。
- `app/line-session.js` 依當前 hostname 請求對應的 LIFF，後端 `line-bridge?action=config&site=queue` 回傳正式網域的 LIFF ID，未就緒時不錯用舊 ID。
- 自動設定：`.github/workflows/line-oa-deploy.yml` 呼叫 `.github/scripts/sync-queue-auth-domains.py`，只追加 Supabase redirect allowlist、保留原 Site URL，建立或重用第二個 LIFF 並存入 Supabase Edge Secret `LINE_LIFF_ID_QUEUE`。需要既有 GitHub Secrets `SUPABASE_ACCESS_TOKEN`、`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`LINE_LIFF_ID`；無權限時會**明確失敗，不宣稱完成**。
- Google Cloud Console 若使用此專案的 OAuth Web Client，請核對 Authorized JavaScript origins 同時含兩個 origin；Authorized redirect URI 仍為 `https://unapiwajmgqqtdkixaab.supabase.co/auth/v1/callback`，不要改成前端網址。
- 需分別用真人 Google / LINE 帳號在兩站測試登入、登出、跳轉、Email 驗證／重設；CI 與公開設定檢查無法取代使用者端實際授權。

## Google 登入（雙網域、Google Identity Services，2026-11-16）

- Google OAuth 網頁用戶端公開 Client ID 在 `saas/public-config.js`（不是 Client Secret），JavaScript 來源已加入 `https://queue.monsterport.com` 和 `https://hub-google.github.io`。
- 店家登入頁優先使用官方 GIS 按鈕、Google ID Token → Supabase `signInWithIdToken`，使用 SHA-256 nonce 保護；店家資料、帳號、權限、Supabase sessions 仍共用原專案。
- GIS 載入失敗或憑證交換失敗時才顯示原本的 Supabase Google OAuth 按鈕作為手動備援；此備援仍可能顯示 `unapiwajmgqqtdkixaab.supabase.co`，不宣稱 Google 主畫面的文字已經全部消失。
- 此修改未變更 Google OAuth 品牌審核設定，也未修改 LINE LIFF 設定；Chrome/Safari 真實 Google 帳號登入必須由帳號持有人完成驗收。
