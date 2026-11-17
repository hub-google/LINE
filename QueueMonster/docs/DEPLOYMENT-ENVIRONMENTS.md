# 排隊怪獸：正式站／測試站部署架構

更新：2026-11-17（已切換為 Cloudflare Pages 靜態託管）

## 現況（以此節為準）

- **正式網址**：https://queue.monsterport.com/，Cloudflare Pages 專案 `monsterport-queue`，正式來源分支為 `gh-pages`，網站目錄 `queue-prod/`。
- **測試網址**：https://hub-google.github.io/LINE/booking/；平常 `main` 更新測試站，不影響正式版。
- **DNS**：`queue.monsterport.com` 的 proxied CNAME 指向 `monsterport-queue.pages.dev`。
- **Worker**：舊 `monsterport-queue-bridge` 程式暫留作回溯，但已**移除 `queue.monsterport.com` 的 Worker Custom Domain**；此正式網域不再透過 Worker 反向代理 GitHub Pages。
- **Pages Functions**：不使用。HTML／CSS／JS／圖片皆為 Cloudflare Pages 靜態資產，不占 Cloudflare Workers 執行請求。
- **資料庫／登入／通知**：仍沿用原 Supabase 專案 `unapiwajmgqqtdkixaab`、原 LINE OA Webhook、LIFF、Google OAuth 設定，未搬遷資料庫。

## 發布流程

| 操作 | 實際效果 |
|---|---|
| Push `main` | GitHub Actions `line-saas-pages.yml` 更新 `gh-pages/booking/` 測試站；不變動正式版 |
| 手動發布正式版 | 執行 `.github/workflows/queue-monster-production-release.yml`，確認輸入 `RELEASE`，完成測試後更新 `gh-pages/queue-prod/` 並推進 `release` |
| Push `release` | 觸發正式版回歸測試、靜態建置及 `gh-pages/queue-prod/` 快照發布 |
| `gh-pages/queue-prod/**` 更新 | Cloudflare Pages `monsterport-queue` 自動建置 `gh-pages` 的 `queue-prod/` 並部署到正式網域 |

**重點**：Cloudflare Pages 的 Git source 指向 `gh-pages`，而不是 `main`，並使用 include paths `queue-prod/**` 避免測試版更新觸發正式版建置。正式版本的唯一來源仍為通過原工作流程驗證的 `queue-prod/` 快照。

## CF Pages 靜態相容層

Cloudflare Pages build command：`node ../cf-pages-queue-build.mjs`。建置工作目錄 `queue-prod`，發佈目錄 `dist`。

程式存於 `gh-pages` 根目錄的 `cf-pages-queue-build.mjs`，位置獨立於每次更新的 `queue-prod/`，不會被原正式發版流程清除。

建置腳本在靜態部署階段（**非每次訪客請求**）處理：
1. 將原本的 `home.html` 作為正式 `index.html`，因此 `/` 直接顯示品牌首頁，無須 `/home.html`。
2. 將原本應用程式的 `index.html` 複製為 `app.html`；有 `?view=`、`?merchant=`、LINE/OAuth 回呼等參數時，由瀏覽器導向 `app.html` 載入後還原瀏覽器網址為根路徑。
3. 於**建置時**改寫 GitHub Pages 舊的絕對連結為 `https://queue.monsterport.com`，取代舊 Worker 的逐請求改寫。
4. 產生 `_headers`（雜湊靜態資源長快取、HTML／release.json／Service Worker 適當更新），更新 PWA 快取命名。
5. 保留全部正式版 HTML、CSS、JavaScript、圖像與 API 設定；後端仍直接連原 Supabase。

## 2026-11-17 驗證

- Cloudflare Pages 靜態 GitHub build 與 deploy 均為 `success`，`uses_functions=false`。
- 自訂網域狀態、DNS CNAME、憑證驗證皆已 `active`。
- Worker Custom Domain 清單已不含 `queue.monsterport.com`。
- 透過 Cloudflare Browser Rendering 實測正式 `/` 顯示品牌首頁、`/?view=staff` 載入應用程式、`/board.html?merchant=demo-clinic` 載入叫號看板。
- 尚未對實際商家完成真人 Google／LINE 登入、真正訂單建立、LINE 通知收件等端對端操作；**不可把頁面可載入視為上述交易已驗證**。

## 注意事項

- 5 萬人／日的**靜態網頁瀏覽**不占 Workers 請求額度；但 Supabase 的 Auth、Postgres、Realtime、API 流量及 LINE OA 各有不同免費方案限制。不能據此宣稱整套服務可不受限制地免費支援 5 萬位活躍使用者。
- 不要回頭把 `queue.monsterport.com` 綁回 Worker，或將正式 Pages 直接連到 `main`。
- 改動 `cf-pages-queue-build.mjs`（在 `gh-pages` 根目錄）後，因 Pages path filter 僅納入 `queue-prod/**`，請手動觸發 Pages 重新部署。
- 保留 GitHub Pages 原測試入口、既有 LIFF 及 QR Code 兼容，不隨意重設 Supabase 授權及資料庫。正式版網頁回滾不會回滾資料庫 schema。
- 如果 Pages 發生故障，先檢查 Pages Git build、Custom Domains 及 DNS；舊 Worker 仍有原始碼但未綁網域，不應直接恢復以免再次消耗大量 Worker 次數。
