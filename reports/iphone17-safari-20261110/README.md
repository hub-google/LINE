# 排隊怪獸 iPhone 17 手機版實際畫面驗收

**設備模擬**：402×874 CSS px / DPR 3 / touch，iPhone Safari User-Agent。分別使用 Playwright **WebKit（Safari 瀏覽器核心）**與 **Chromium** 存取已公開部署的 `https://hub-google.github.io/LINE/booking/`。

**畫面性質**：
- 頁面截圖皆為瀏覽器實際開啟正式網站；沒有重繪或 AI 偽造畫面。
- `role-fixtures/` 裡的店員、總部畫面，使用**隔離的合成角色與門市資料**直接渲染。這些**不是**真實登入成功的截圖。
- 沒有用私人 LINE 帳號登入，沒有送出真實預約、取號或變更營業資料；因此不能據此宣稱 LINE OAuth、LINE App 內建瀏覽器、預約送出、訊息實際投遞等服務已通過真實端到端驗收。

## 正式站點畫面對照

| WebKit（Safari 核心） | Chromium |
|---|---|
| **首頁**<br><img src="./webkit-home.png" width="290"> | **首頁**<br><img src="./chromium-home.png" width="290"> |
| **手機主選單**<br><img src="./webkit-home-menu.png" width="290"> | **手機主選單**<br><img src="./chromium-home-menu.png" width="290"> |
| **搜尋店家首屏**<br><img src="./webkit-directory.png" width="290"> | **搜尋店家首屏**<br><img src="./chromium-directory.png" width="290"> |
| **展開進階篩選**<br><img src="./webkit-directory-filters.png" width="290"> | **展開進階篩選**<br><img src="./chromium-directory-filters.png" width="290"> |
| **以「診所」搜尋**<br><img src="./webkit-directory-search-clinic.png" width="290"> | **以「診所」搜尋**<br><img src="./chromium-directory-search-clinic.png" width="290"> |
| **我的預約（未登入）**<br><img src="./webkit-my-records-guest.png" width="290"> | **我的預約（未登入）**<br><img src="./chromium-my-records-guest.png" width="290"> |
| **預約入口／請登入 LINE**<br><img src="./webkit-customer-reserve-guest.png" width="290"> | **預約入口／請登入 LINE**<br><img src="./chromium-customer-reserve-guest.png" width="290"> |
| **店家登入**<br><img src="./webkit-merchant-login.png" width="290"> | **店家登入**<br><img src="./chromium-merchant-login.png" width="290"> |
| **商家操作指南目錄**<br><img src="./webkit-guide-menu.png" width="290"> | **商家操作指南目錄**<br><img src="./chromium-guide-menu.png" width="290"> |
| **公開叫號看板**<br><img src="./webkit-public-board.png" width="290"> | **公開叫號看板**<br><img src="./chromium-public-board.png" width="290"> |

## 後台角色畫面（僅隔離合成資料，非真實登入）

| WebKit（Safari 核心） | Chromium |
|---|---|
| **店員工作台**<br><img src="./role-fixtures/webkit-staff-dashboard.png" width="290"> | **店員工作台**<br><img src="./role-fixtures/chromium-staff-dashboard.png" width="290"> |
| **店員更多選單**<br><img src="./role-fixtures/webkit-staff-more-menu.png" width="290"> | **店員更多選單**<br><img src="./role-fixtures/chromium-staff-more-menu.png" width="290"> |
| **預約管理**<br><img src="./role-fixtures/webkit-staff-bookings.png" width="290"> | **預約管理**<br><img src="./role-fixtures/chromium-staff-bookings.png" width="290"> |
| **叫號管理**<br><img src="./role-fixtures/webkit-staff-queue.png" width="290"> | **叫號管理**<br><img src="./role-fixtures/chromium-staff-queue.png" width="290"> |
| **企業設定**<br><img src="./role-fixtures/webkit-staff-settings.png" width="290"> | **企業設定**<br><img src="./role-fixtures/chromium-staff-settings.png" width="290"> |
| **總部企業列表**<br><img src="./role-fixtures/webkit-headquarters-list.png" width="290"> | **總部企業列表**<br><img src="./role-fixtures/chromium-headquarters-list.png" width="290"> |

其他逐頁 PNG 亦保存在本資料夾。詳細逐項檢查、元素座標、異常狀態參閱 [report.json](./report.json)、[role-fixtures/report.json](./role-fixtures/report.json)。

## 驗收規則

- 全部頁面 document width 不得大於 402px。
- 搜尋輸入框第一屏即可操作、第一個搜尋結果第一屏可見。
- 「診所」搜尋應顯示醫療／診所店家；進階篩選可收合與展開。
- 未登入「我的預約」不得顯示成已登入的 0 筆紀錄；慢速網路時應顯示確認 LINE 身分、非熱門店家排行。
- 顧客進入預約／取號時，未主動授權之前不得自行跳離站點。
- 店家與總部的未授權入口保持獨立。
- 商家操作指南在手機版 8 個章節皆可開啟。
- 角色 UI 以本地、**無 DB 修改** 的合成資料渲染，額外檢查行動選單與頁面寬度。

**保留測試門市名稱與資料，不新增任何硬編碼排除條件。**
