# LINE 預約網站自動更新

網站：https://hub-google.github.io/LINE/saas/

- 修改 `store-operations/saas/` 的四個 HTML 頁面或 `version-watch.js`，推送到 `main` 後，GitHub Actions `line-saas-pages.yml` 自動發布到 `gh-pages/saas/`，不覆蓋其他產品。
- 部署時以 `GITHUB_SHA` 替換四頁 `__LINE_SAAS_BUILD__`，產生 `release.json`；`version-watch.js` 腳本本身 URL 也會隨部署版號更動。
- 已開啟的網頁每 60 秒、重新聚焦及回到前景時檢查部署版本，確認新版 HTML 可以取得後自動重新載入，保留所有 URL 查詢參數與片段。
- 使用者正在輸入尚未儲存的資料、焦點在表單或 LIFF 登入跳轉時不強制重載，避免遺失資料；可在提示中自主更新。
- 原有 Supabase/LINE session 不會被清理，不會解除註冊或清除 Service Worker、localStorage。
- GitHub Pages 的 CDN 有快取時間，無法保證部署瞬間所有裝置同步；版本檢查使用每次不同的 URL 與 no-store，避免依賴 Ctrl+F5。
- 必須以 `main` 原始碼為準，不要直接人工修改 `gh-pages/saas/`，否則下次部署將覆蓋人工變更。
