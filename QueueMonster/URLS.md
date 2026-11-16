# Queue Monster 專案網址

原始碼資料夾更名為 `QueueMonster/`；GitHub repository 維持 `hub-google/LINE`，公開網站維持 `/booking/`。

| 用途 | 網址 |
|---|---|
| GitHub 專案 | https://github.com/hub-google/LINE/tree/main/QueueMonster |
| 網站原始碼 | https://github.com/hub-google/LINE/tree/main/QueueMonster/saas |
| 需求文件 | https://github.com/hub-google/LINE/blob/main/QueueMonster/PRD.md |
| 網站需求補充 | https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md |
| 網站入口 | https://hub-google.github.io/LINE/booking/ |
| 正式品牌網域（Cloudflare Worker 過渡版，LINE LIFF 尚待驗收） | https://queue.monsterport.com/ |
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
| 網站部署紀錄 | https://github.com/hub-google/LINE/actions/workflows/line-saas-pages.yml |
| LINE 後端部署 | https://github.com/hub-google/LINE/actions/workflows/line-oa-deploy.yml |
| LINE 圖文選單部署 | https://github.com/hub-google/LINE/actions/workflows/line-rich-menu.yml |

`greenfield-salon` 是既有示範商家代碼；正式商家請換成自己的代碼。後台須有相應權限。

## QueueMonster 新網域（2026-11-16）

- **新首頁：`https://queue.monsterport.com/`（不加 `home.html`）**。訪問新網域根路徑時直接提供品牌首頁，`/home.html` 舊路徑導向 `/`。
- 顧客／店員／總部功能保留原根路徑查詢參數，例如 `/?view=customer&merchant=...`、`/?view=staff&merchant=...`、`/?view=platform`。
- Cloudflare Worker：`monsterport-queue-bridge`；來源 [`cloudflare/monsterport-queue-bridge.mjs`](./cloudflare/monsterport-queue-bridge.mjs)。
- Supabase `line-bridge` 自第 161 版允許 `https://queue.monsterport.com`，仍保留舊 GitHub Pages 與 `qm` 來源。
- 目前是 Worker 轉接 GitHub Pages 的部署方式，不是 Cloudflare Pages 原生託管。舊網址與 Supabase 資料庫保持不變。
- LINE LIFF Endpoint 與 Supabase Auth Redirect URL 須再檢查新網址授權；在認證完成前，不得移除舊 LIFF App／改動現有店家 QR Code。

## MonsterPort 過渡部署（2026-11-16）

- Cloudflare Worker：`monsterport-qm-bridge`，綁定 `qm.monsterport.com`，原始碼存放於 [`cloudflare/monsterport-qm-bridge.mjs`](./cloudflare/monsterport-qm-bridge.mjs)。
- 這是反向代理過渡部署，靜態網站仍從 `hub-google.github.io/LINE/booking/` 取得，不是 Cloudflare Pages 原生託管。
- 現有 GitHub Pages 網址、`gh-pages` 部署、Supabase 與 LINE API 不得直接移除。後端資料庫沒有搬遷。
- Cloudflare Pages GitHub 專案連接目前遭遇 Git 整合 HTTP 401 錯誤；完成原生部署前，不可刪除 Worker 或 GitHub Pages 來源。
- 正式切換前須檢查 Supabase Auth Redirect URLs、Google OAuth、LINE LIFF Endpoint、各店家 QR Code、PWA、預約／取號／訂餐流程，並完成新舊網址的回歸測試。
- `site-auth.js` 與 `app/line-session.js` 允許單頁返回網址使用舊 `/LINE/booking/` 或新網域根目錄路徑。

## 雙網站登入設定（2026-11-16）

- 正式入口：`https://queue.monsterport.com/`（根目錄直接顯示品牌首頁）；原 GitHub Pages `https://hub-google.github.io/LINE/booking/` 同時保留。
- Google 與 Email Auth：同一 Supabase 專案，同時允許 `https://queue.monsterport.com/**`、`https://hub-google.github.io/LINE/booking/**`、既有 `/LINE/saas/**`。登入會回到發起操作的同一網域。
- LINE：保留舊 LIFF ID 的 Endpoint `https://hub-google.github.io/LINE/booking/`，為正式新網域新增**同一 LINE Login Channel 下的第二個 LIFF ID**，Endpoint `https://queue.monsterport.com/`。
- `app/line-session.js` 依當前 hostname 請求對應的 LIFF，後端 `line-bridge?action=config&site=queue` 回傳正式網域的 LIFF ID，未就緒時不錯用舊 ID。
- 自動設定：`.github/workflows/line-oa-deploy.yml` 呼叫 `.github/scripts/sync-queue-auth-domains.py`，只追加 Supabase redirect allowlist、保留原 Site URL，建立或重用第二個 LIFF 並存入 Supabase Edge Secret `LINE_LIFF_ID_QUEUE`。需要既有 GitHub Secrets `SUPABASE_ACCESS_TOKEN`、`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`LINE_LIFF_ID`；無權限時會**明確失敗，不宣稱完成**。
- Google Cloud Console 若使用此專案的 OAuth Web Client，請核對 Authorized JavaScript origins 同時含兩個 origin；Authorized redirect URI 仍為 `https://unapiwajmgqqtdkixaab.supabase.co/auth/v1/callback`，不要改成前端網址。
- 需分別用真人 Google / LINE 帳號在兩站測試登入、登出、跳轉、Email 驗證／重設；CI 與公開設定檢查無法取代使用者端實際授權。
