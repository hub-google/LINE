# 排隊怪獸：測試版與正式版發布架構

更新：2026-11-16

## 操作規則（不需要 Cloudflare Pages GitHub 授權）

| 操作 | 原始碼分支 | GitHub Pages 測試站 | Cloudflare 網域正式站 |
| --- | --- | --- | --- |
| 平常 Push | `main` | 自動更新 `/LINE/booking/` | 不更新 |
| 說「發布正式版」 | 手動啟動 `.github/workflows/queue-monster-production-release.yml`，輸入 `RELEASE` | 測試站保持原狀 | 新版靜態快照發布至 `/LINE/queue-prod/`，同步推進 `release` |
| 直接 Push `release` | `release` | 不更新 | 觸發正式版回歸測試及快照發布 |

### 兩個入口

- 測試：`https://hub-google.github.io/LINE/booking/`，由 `main` → `line-saas-pages.yml` → GitHub Pages 的 `gh-pages/booking/`。
- 正式：`https://queue.monsterport.com/`，由 Cloudflare Worker `monsterport-queue-bridge` → **獨立正式快照** `https://hub-google.github.io/LINE/queue-prod/`；正式快照由 `queue-monster-production-release.yml` 建置到 `gh-pages/queue-prod/`。

**部署隔離**：`main` 改版不改動 `queue-prod/`。只有有意修改 `release` 或手動發布正式版才更新。這不是 Cloudflare Pages 原生靜態託管，而是 Cloudflare Worker + GitHub Pages **獨立快照**的架構。網址由 Cloudflare 維護，無需 Cloudflare Pages GitHub App，沒有 Pages 的 500 次建置配額問題，但靜態檔案依然依賴 GitHub Pages 可用性。

## 技術設定

- Cloudflare zone：`monsterport.com`；Worker 自訂網域：`queue.monsterport.com`。
- Worker 對外使用 `/` 直接顯示品牌首頁；`/?view=...` 保留顧客、店員、總部入口；`/home.html` 自動導回 `/`。
- Worker 從固定 `/LINE/queue-prod/` 取檔並把已知的舊 GitHub Pages 絕對連結映射回正式網域。
- `release.json` 的 `build` 由來源 commit SHA 生成。對比正式 `https://queue.monsterport.com/release.json` 與測試 `https://hub-google.github.io/LINE/booking/release.json` 可檢查版本是否隔離。
- 發布流程只改寫 `gh-pages/queue-prod/`；日常測試工作流程只改寫 `gh-pages/booking/` 和舊版相容 `gh-pages/saas/`。兩工作流程共用 concurrency group，以免同時推送 `gh-pages` 互相覆蓋。
- 不改動 Supabase、Google/LINE OAuth、LIFF ID、店家 QR Code 或 DNS。
- 正式版發布需通過 JavaScript 語法、關鍵 regression tests、靜態建置及靜態檔案檢查；失敗不應更新 `queue-prod/`。

## 首次切換確認

1. 確認 `release` 分支及 `.github/workflows/queue-monster-production-release.yml` 存在。
2. 觸發**第一次** release 分支發布，確認 `https://hub-google.github.io/LINE/queue-prod/release.json` 真的存在、對應 release commit。
3. 才將 Cloudflare Worker `monsterport-queue-bridge` 的 upstream 固定為 `/LINE/queue-prod`，避免先切造成 404；保留上一個 Worker 版本以便回滾。
4. 確認 `https://queue.monsterport.com/`（品牌首頁）、`/?view=platform`、`/release.json`、HTML／CSS／JS、OAuth 路由、訂單與叫號，並在未發布時確認正式 `release.json` SHA 不變。
5. Google／LINE 真人帳號登入與真實訂單通知仍需實機驗收，切勿以靜態頁面測試代替。

## 已知限制

- GitHub Free + Public Repo 的 GitHub Pages 可照常使用；改成 Private Repo，GitHub Pages 將不能在 GitHub Free 下運作。
- 兩站仍共用正式 Supabase 資料庫；程式部署隔離不等於資料隔離。不要拿正式顧客資料測試。
- Cloudflare Pages 的 GitHub 直連曾在建立專案時失敗，HTTP 401 / code 8000011。此部署方案**不需要**進行該授權。未來如果要完全離開 GitHub Pages 才需另行遷移。
- 回滾：可用舊 `release` SHA 重建 `queue-prod/`；GitHub Pages 版本本身不應隨便重置歷史。回滾網頁不會還原 Supabase 資料庫變更。
