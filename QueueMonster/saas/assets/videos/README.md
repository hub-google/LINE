# 排隊怪獸品牌介紹影片

首頁 `home.html` 已整合真正的開屏廣告：**首次進入首頁自動彈出影片；按過一次「跳過影片」後便不再自動彈出**。不是首頁單純的「觀看影片」按鈕。

## 影片與部署
- 上傳或替換 `QueueMonster/saas/assets/videos/intro.mp4`，目前使用直式 9:16、H.264 MP4、約 45 秒，單檔上限 25 MiB。
- `main` 的 GitHub Pages 測試站：`https://hub-google.github.io/LINE/booking/home.html`。
- `release` 才用於 Cloudflare Pages 正式站；上傳影片本身不會自動更新正式版。
- GitHub Actions 產生 `assets/videos/intro-video.json`，影片存在且符合檔案檢查即啟用，影片缺失則不自動彈出。
- `version` 使用影片 SHA-256 前 16 碼，便於後續換片追蹤。

## 首頁開屏行為
1. 第一次進入首頁且尚未跳過影片的訪客會自動看到開屏，包含帶有 `__line_build`、`__line_fresh` 等參數、已登入與 LINE 內建瀏覽器。
2. 影片靜音自動播放、手機使用 `playsinline`；瀏覽器若拒絕播放，可使用播放器控制項自行開始。
3. 不會因影片播完自動關閉；點「跳過影片」、按 Escape 或點背景關閉時，都會以 `localStorage` 的 `qm-home-intro-skipped-v1` 記住訪客已跳過。
4. 之後再次進入首頁不會主動彈出；「觀看品牌介紹影片」仍可隨時手動播放。紀錄不設七天期限，也不因更換影片重置；僅限同瀏覽器、同網域，清除網站資料或換裝置會重新顯示。
5. **只在行銷首頁 `home.html` 彈出**。不在取號、預約、點餐、店家管理或 LIFF 直接操作頁插入廣告。
6. `home.html?intro_preview=1` 可強制開啟預覽；沒有影片時會顯示佔位內容。

開屏不依賴 Supabase 身分查詢，也不會等待登入狀態完成，因此登入服務暫時不可用也不影響彈窗顯示。影片本身仍使用原站靜態資源，不新增 Worker、R2、資料庫或第三方播放器。
