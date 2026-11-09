# 前端來源與建置

HTML 負責頁面骨架，assets/<page>/ 放頁面專用 CSS、啟動腳本。app/ 放主要應用的功能來源，manifest.json 指定組合順序。

主要功能：
- line-session：LINE 身分與通知；route-state：網址、工作階段與共用畫面狀態。
- service-units：服務單位／場次；customer-booking、booking-edit：預約與修改。
- queue-progress、cross-store：即時候位及跨店紀錄。
- staff-view、staff-history、booking-calendar：後台、歷史紀錄及日曆。
- merchant-brand、platform-view、number-settings：品牌、平台及號碼設定。
- calendar-export、customer-records：行事曆下載、收據及個人紀錄。
- shared-ui、staff-layout：共用畫面；data-loading：RPC 與資料更新。
- click-actions、form-events、startup：事件協調、表單與啟動。

這是保留執行行為的漸進重構。功能來源目前仍在同一個 ES module 作用域中執行，共用狀態尚未改為各自封裝的 import/export 模組。建置時依 manifest 順序組合，不要直接以 script 標籤分別載入這些片段，也不要手動維護一份組合後的大檔案。

## 本機預覽（PowerShell，儲存庫根目錄）

    $env:GITHUB_SHA = git rev-parse HEAD
    node .github/scripts/build-line-saas.mjs ./line-saas-dist
    npx --yes http-server ./line-saas-dist -p 8080 -c-1

開啟 http://localhost:8080/index.html?view=staff 或 home.html。請預覽建置產物；來源 HTML 的主應用資產由建置產生。

## 驗證與部署

    node --test QueueMonster/tests/frontend-build.test.mjs

既有契約測試以 tests/helpers/source-fs.mjs 讀取組合後的內容，仍檢查原有預約、權限、通知、PWA 等契約。新建置測試直接檢查真正產物中的資產存在、JS 語法、版本替換及入口大小。

現有 Pages workflow 會同時發布 assets/ 至 booking/ 與 saas/。HTML 與資產 URL 都帶部署 SHA；service worker 繼續只快取原有明確允許的資源，新應用 JS 由網路取得。正式環境不發布 app/、測試、source map 或開發文件。

分檔並不隱藏瀏覽器程式碼。授權與資料寫入繼續由既有後端 RPC 驗證，本次沒有修改資料庫或權限。
