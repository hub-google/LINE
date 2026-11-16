# Queue Monster｜測試站與正式站發布規則

更新：2026-11-16

## 目標

- **測試站**：`https://hub-google.github.io/LINE/booking/`；`main` 變更由 `.github/workflows/line-saas-pages.yml` 建置並發布到 `gh-pages/booking/`。
- **正式站**：`https://queue.monsterport.com/`；由 `release` 綁定 Cloudflare Pages，只有 `release` 變更才部署。
- 同一個 `hub-google/LINE` Repo，Queue Monster 原始碼位於 `QueueMonster/saas/`，不用複製專案。
- **正式發布**：GitHub Actions 選擇 `Queue Monster｜手動發布 Cloudflare 正式版`、選擇 `main`、輸入 `RELEASE`；工作流程通過核心驗證後，以快轉方式把所選 `main` commit 更新到 `release`。
- **不自動發布正式版**：正常 push `main` 不更動 `release`，CF Pages 應將 production branch 設為 `release`，preview 設為 `none`。

## 現況（請勿誤認為已切換）

- `release` 已建立；GitHub Pages workflow 限定 `main`；手動發布工作流程已加入。
- **Cloudflare Pages Git 整合尚未完成**：使用 Cloudflare API 建立 GitHub 連線專案時，回傳 HTTP 401 / code `8000011`：`There is an internal issue with your Cloudflare Pages Git installation`。需在 Cloudflare Pages 完成對 `hub-google/LINE` 的 GitHub App 安裝或重新授權，再建立專案。
- `queue.monsterport.com` 目前仍綁定 Cloudflare Worker `monsterport-queue-bridge`，由 Worker 讀取 GitHub Pages 的 `/LINE/booking/`，因此**目前暫時仍跟著測試站更新**。未驗收 Cloudflare Pages 前不得宣稱正式站隔離成功，也不應直接刪除 Worker。
- 現有 Google / LINE / Supabase 登入配置、DNS、LIFF 及顧客操作不在本次切分前期修改範圍內。

## Cloudflare 完成 GitHub 安裝後的建立設定

Cloudflare Dashboard → Workers & Pages → Pages → Connect to Git，授權 Cloudflare Pages GitHub App 讀取 `hub-google/LINE`。建立 Pages 專案：

| 欄位 | 值 |
| --- | --- |
| Project name | `queue-monster-prod` |
| GitHub repository | `hub-google/LINE` |
| Production branch | `release` |
| Preview branch deployments | `none`（停用） |
| Root directory | `/`（Repo 根目錄） |
| Framework | `None` |
| Build command | `npm ci --prefix .github/frontend && GITHUB_SHA=${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD)} node .github/scripts/build-line-saas.mjs cf-pages-dist` |
| Build output directory | `cf-pages-dist` |

**注意**：Cloudflare 專案不應設定成 `main` 自動部署；也不要把整個 repo 根目錄當作公開輸出。使用既有建置腳本只輸出 Queue Monster 的網站檔案。

## 正式網站切換檢查

1. Pages 建置成功後，先在專案的 `*.pages.dev` 子網域驗證靜態資源、PWA、品牌首頁、顧客／店員入口，確認 HTML 中的相對路徑與絕對舊網址。
2. 新站根路徑 `/` 的**無參數訪問必須是品牌首頁**，有 `?view=...` 等參數必須是應用程式。既有 Cloudflare Worker 承擔這個路由邏輯；切換時先把它的來源由 GitHub Pages 指向已驗證的 Pages 服務，並確認網址轉換／重導向功能，或在 Pages 端實作等價路由。
3. 正式域名仍保留 `queue.monsterport.com`，必須在網域上驗證 Google 登入、LINE LIFF（既有雙網域設定）、登出、預約、取號、訂餐、回傳通知、看板、PWA。沒有使用者實際登入驗證不能宣稱全部正常。
4. 核對 `release.json` 的 `build` 與 release 分支 SHA 一致、與 main 後續測試 commit 不同；Push 測試分支後確認正式站 `release.json` 不變。
5. 前述驗證完成才正式切換 Worker upstream 或 Pages 自訂網域；保留原 Worker 版本可回滾，不刪除 GitHub Pages。

## 操作

**平常改版**：只推 `main`。測試站更新，`release` 不變；正式站在完成 Cloudflare 隔離之前仍可能跟著變，注意上面的現況。

**重大版本**：先在測試站驗證，再使用手動發布 workflow。它檢查 JavaScript 語法、核心回歸測試、靜態建置，然後執行 `git push origin HEAD:release`；Git 不允許非快轉，因此不會強制覆蓋正式版本。部署開始後應確認 Cloudflare Pages 成功、網站可用。

**回滾**：Cloudflare Pages 使用上一個成功部署版本回滾；單純回退 GitHub release 分支可能有非快轉風險，需由管理者確認。不會回滾 Supabase 資料庫或已發生的預約／訂單資料變更。

**重要**：目前兩站共用 Supabase 正式資料庫；發布隔離不等於資料庫隔離。測試不可對真實顧客產生預約／通知；要真正隔離測試資料需另設 Supabase 測試環境。
