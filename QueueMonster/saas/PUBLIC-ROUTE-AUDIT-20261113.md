# 排隊怪獸｜公開入口網址與歷史紀錄範圍盤點（2026-11-13）

本文件以網站 source code、LINE OA 發布腳本、聊天機器人快捷回覆及 GitHub Pages 發布流程為準。**個別店家歷史紀錄與平台跨店紀錄是不同的資料視圖，不可誤導顧客。**

## 正式網址與範圍

| 入口 | 正式網址（GitHub Pages `/LINE/booking/` 下） | 資料／操作範圍 |
| --- | --- | --- |
| 共用網站頂部「搜尋店家」 | `directory.html` | 公開店家搜尋，可篩選預約、取號、點餐及看板 |
| 共用網站頂部「我的紀錄」 | `my-records.html` | **本人跨所有店家**的預約／取號／訂餐紀錄，同頁顯示三區；須經 LINE 身分核對 |
| 店家 QR Code／直接連結 | `?view=customer&merchant=<店家 slug>` | 店家自己的服務頁，預約、取號、點餐操作照舊 |
| **個別店家**「歷史紀錄」 | `?view=customer&merchant=<店家 slug>&tab=mine` | 以該店畫面與該店脈絡顯示紀錄；不變更既有店家 UI |
| 各店單筆紀錄詳情 | `?view=customer&merchant=<店家 slug>&tab=detail&kind=<類型>&item=<UUID>`，取號可用 `tab=progress&ticket=<UUID>` | 每筆從跨店清單點回所屬門市的單筆預約／訂餐／取號詳情，不混放其他店家資料 |
| 各店叫號看板 | `board.html?merchant=<店家 slug>` | 該店的公開叫號進度，與跨店歷史頁無關 |

## 舊網址相容策略（**不能刪除或改成 404**）

| 已流通舊網址 | 新處理 | 來源 |
| --- | --- | --- |
| `directory.html?mode=mine` | 原網址有效，自動導向 `my-records.html` | LINE 舊圖文選單、Quick Reply、顧客捷徑、瀏覽器書籤 |
| `directory.html?mode=mine&section=reservation` | 導向 `my-records.html`，三種紀錄一頁顯示 | 早期紀錄分類 |
| `directory.html?mode=mine&section=ticket` | 同上 | 早期取號紀錄 |
| `directory.html?mode=mine&section=order` | 同上 | 早期訂單紀錄 |
| `directory.html?mode=mine&section=queue`、`section=board` | 同上 | 合併選單歷史測試版本 |
| `directory.html?mode=last-board` | 導向 `my-records.html` | 已下架「上次預約看板」按鈕 |
| `directory.html?mode=search` | 仍可正常搜尋店家，不需轉址 | 網站首頁、顧客功能介紹、LINE OA |
| `directory.html?mode=search&service=<服務>` | 仍預選服務類型 | LINE OA 線上預約、現場取號、線上點餐 |
| `directory.html?mode=queue` | 仍可查找提供取號的門市，不改成歷史紀錄 | 舊公開取號捷徑 |
| `directory.html?mode=game` | 仍保留原遊戲探索介面入口 | 舊遊戲連結 |

原 `/LINE/saas/` 與正式 `/LINE/booking/` 的前端發布仍一起更新，保留舊 LIFF 及店家入口；**不可**把所有 `directory.html` 網址一律重導到紀錄頁。

## 程式與入口同步盤點

| 來源 | 本次確認／處理 |
| --- | --- |
| `assets/marketing/shared-header.js` | 共用頁首直接顯示「搜尋店家」→ `directory.html` 及「我的紀錄」→ `my-records.html`；桌機／手機共用同一清單 |
| `directory.html` | 移除頁面內的重複雙按鈕，保留搜尋、篩選、遊戲和舊紀錄網址轉址 |
| `my-records.html` + `assets/directory/main.js` | 獨立網頁；查詢同一 LINE 身分的 `reservation`、`ticket`、`order` 三類 RPC，呈現在同一頁 |
| `app/customer-booking.js`、`app/shared-ui.js` | **跨店捷徑**改連 `my-records.html`；店家本身的 `mine`／`detail`／`progress` 導覽與頁面保留 |
| `site-auth.js`、`app/line-session.js` | LINE 登入及 OAuth callback 安全白名單加入 `my-records.html`，避免登入後掉到首頁 |
| `.github/scripts/publish_rich_menu.py` | LINE OA 顧客服務只保留一個「我的紀錄」，直連 `my-records.html`；其他功能維持搜尋及各項服務入口 |
| `supabase/functions/line-bridge/index.ts` | LINE Quick Reply 的「我的紀錄」同樣導向 `my-records.html` |
| `build-line-saas.mjs`、`line-saas-pages.yml`、`sitemap.xml` | 新頁加入編譯、雙路徑部署、搜尋引擎站點清單，確保不是只有 Git 原始碼存在 |
| `app/cross-store.js`、`app/customer-detail.js`、`app/queue-progress.js` | 店家脈絡的歷史與單筆詳情保留原路由，不套用平台全店家視圖 |

### 不可跨越的資料權限

- `so_my_platform_records(p_kind)` 只能經已驗證的 LINE 身分解析本人跨店紀錄，不能從 URL 參數指定其他顧客；每種紀錄各自最多回傳最近 150 筆。
- 個別店家的頁面維持商家 slug 與顧客身分，不能因平台導覽新增而變成其他店家的混合看板。
- 舊版 URL 使用客戶端轉址時，保留非路由查詢參數；不把敏感 OAuth token 放進新公開網址。

### 驗證

`customer-record-category-tabs.test.mjs`、`site-auth-contract.test.mjs`、`marketing-home-contract.test.mjs`、`merchant-onboarding-contract.test.mjs` 及 `.github/frontend/browser-smoke.mjs` 覆蓋新舊連結、跨店紀錄與頁首導覽。正式發布需查 GitHub Actions 網站建置成功，並回讀 `gh-pages` 的兩個頁面。
