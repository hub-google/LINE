# 排隊怪獸前端架構

主應用使用原生 ES modules，main.js 是唯一啟動入口。每個功能以 import/export 宣告依賴，沒有來源片段串接或隱含的共用詞法作用域。

## 來源結構

- app/state/：登入、路由、預約、候位、跨店紀錄、後台、日曆、回饋訊息等領域狀態。
- app/actions/：帳號／平台、商家設定、預約送出及修改、叫號、服務場次等事件處理。
- app/staff/：工作台、預約、叫號、分析、菜單、員工、分店、服務單位及設定的獨立畫面。
- app/*：LINE 整合、後端資料協調、預約、即時候位、跨店紀錄、歷史查詢、日曆、收據及共用 UI。
- assets/<page>/：各公開頁面的 main.js、page.css 與啟動腳本。

main.js 先初始化各領域狀態，再註冊事件及啟動資料讀取。跨功能呼叫使用匯出的函式；可變資料透過對應領域的 state 物件存取。領域之間可能互相引用函式，因此副作用必須放在明確的初始化函式或使用者操作內，避免在模組載入時讀取尚未初始化的狀態。

click-actions.js 負責導航與事件分派，各 actions/ handler 回傳 true 表示已處理，false 表示交給下一個 handler。不可把原本回呼的 return 與業務 RPC 回傳值混用。

## 建置與預覽（PowerShell，儲存庫根目錄）

    npm ci --prefix .github/frontend
    $env:GITHUB_SHA = git rev-parse HEAD
    node .github/scripts/build-line-saas.mjs ./line-saas-dist
    npx --yes http-server ./line-saas-dist -p 8080 -c-1

開啟 http://localhost:8080/home.html 或 index.html?view=staff。也能以靜態伺服器直接載入來源 HTML 與原生模組，正式驗收則使用建置產物。

frontend-build.mjs 以 esbuild 解析模組依賴，輸出壓縮的 JS／CSS、內容雜湊檔名，並重寫 HTML 引用。正式站不發布 app/、測試、開發文件或 source map。每次版本更新依舊由 version-watch.js 與 release.json 協調；新應用資產不加入敏感資料的離線快取。

## 驗證

    node --test QueueMonster/tests/*.test.mjs
    node .github/frontend/browser-smoke.mjs ./line-saas-dist

Windows 預設使用已安裝的 Edge；Linux CI 設 BROWSER_CHANNEL=chromium 並先以 Playwright 安裝 Chromium。

既有 source contract 透過 tests/helpers/source-fs.mjs 統一名稱後檢查原有業務規則；它只用於詞法契約，不代替原生模組測試。frontend-modules.test.mjs 檢查明確依賴與未宣告的應用全域變數；frontend-build.test.mjs 檢查真正的產物、雜湊路徑、語法及不發布來源檔。

browser-smoke.mjs 執行真正的原生模組、初始化與功能函式；以固定的畫面單元測試資料驗證十個後台分頁與重構前的輸出一致，再以真實網路讀取檢查桌機／手機七個主要入口、遺失資產與執行錯誤。這不代表真實預約、付款或 LINE 推播已完成端到端驗收。

## 資料與安全邊界

瀏覽器程式碼仍可被下載。後端 RPC、Auth 與權限驗證負責保護資料，私密金鑰不應放進任何前端模組。本次重構不改資料庫或權限。
