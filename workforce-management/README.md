# LINE Workforce｜員工排班、打卡與請假管理

> **2026-11-17 main 測試版**：持續完善靜態網站、登入、換班、LINE 發送監控及手動企業資料匯出。`release` 為 Cloudflare 正式版，**不因 main 修改而部署**。本 README 不表示 LINE 實際送達、全項法遵或完整災難復原已驗收。

**[開啟 GitHub Pages 人資測試站](https://hub-google.github.io/LINE/workforce/)**  
[獨立「工作怪獸」MINI App 網頁](https://hub-google.github.io/LINE/workforce-mini/)｜[三環境 Endpoint 與實機驗收](./MINI_APP_SETUP.md)｜[LINE OA 固定入口與圖文選單](./line-oa/README.md)  
[完整 PRD](./PRD.md)｜[最新實作與驗收狀態](./IMPLEMENTATION-STATUS.md)｜[資料庫執行順序](./supabase/MIGRATION-ORDER.md)

這是 `hub-google/LINE/workforce-management/` 的**獨立人資 SaaS 產品**，和 `QueueMonster/` 預約叫號分開。**不要在公開 DEMO 輸入真實員工個資、薪資或健康資訊**；其資料為全體訪客共享的虛構公司案例。

## 開啟網站後可以實測

1. **員工與分店**：新增分店、員工、部門；CSV 批次匯入（同編號跳過）；切換正式企業後可發一次性員工邀請連結。
2. **排班管理**：建立班表、複製上週為草稿、管理班型、提交可上班時段、設定最低人力、預覽自動排班建議並由主管確認寫入草稿；不同員工交換班次須雙方與主管同意。
3. **出勤打卡**：打上下班卡、查看資料庫原始紀錄與出勤狀態；分店可設定 GPS 地理圍欄，無定位不得假稱打卡成功。
4. **請假／加班／補卡**：申請、核准／駁回、撤回，核准更正另建稽核資料，不覆寫原始打卡。
5. **通知收件匣**：班表及假勤狀態異動產生站內通知；尚非 LINE OA 真正推播。
6. **月度工時與月結**：按月試算，鎖定月結快照，後續開更正單及 CSV 匯出（**非正式法定薪資計算**）。
7. **企業資料匯出（僅正式 Owner／HR）**：手動分頁下載 33 類企業營運紀錄 JSON，包含通知、假勤改期／取消、簽核、組織權限稽核及班次修訂；權限不足、換企業或分頁失敗均取消下載，不會輸出半成品。**不含附件原始檔、Auth、私人薪資、邀請/QR 密鑰或 LINE 綁定身分，也沒有還原功能，不能取代完整備份**。 可在「資料匯出」頁選擇之前下載的 JSON，離線驗證 33 類資料格式、筆數、重複識別與企業歸屬；不會上傳檔案。
8. **LINE 發送統計**：有權限管理員可查已綁定、待處理、API 已接受及略過筆數；**API 接受不等於實際送達／已讀**。

## 主要檔案

| 檔案 | 功能 |
|---|---|
| [PRD.md](./PRD.md) | 唯一的原始產品需求範圍，保留既定全部項目 |
| [MINI_APP_SETUP.md](./MINI_APP_SETUP.md) | 工作怪獸的 Developing／Review／Published 對照 URL、身分綁定及實機驗收 |
| [line-oa/README.md](./line-oa/README.md) / [line-oa/rich-menu.published.json](./line-oa/rich-menu.published.json) | 每日固定入口：獨立 LINE OA 六格圖文選單、Published MINI App 永久連結，不必每天掃 QR |
| [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) | 功能完成狀態、測試證據與尚未交付項目 |
| [app.js](./app.js) / [index.html](./index.html) / [style.css](./style.css) | **原本 WF 網站**，保留公開 DEMO 與企業登入；資料連到 Supabase |
| [mini/index.html](./mini/index.html) / [mini/mini.css](./mini/mini.css) | **另一套 LINE MINI App 專屬入口**，獨立靜態部署到 `/workforce-mini/`，共用原本資料及業務邏輯 |
| [tests/workforce-prd.test.mjs](./tests/workforce-prd.test.mjs) | 核心合約、排班計算、CSV 解析與 SQL 安全限制測試 |
| [supabase/MIGRATION-ORDER.md](./supabase/MIGRATION-ORDER.md) | 現有資料庫 SQL 重建的唯一正確順序 |
| [GitHub Actions](https://github.com/hub-google/LINE/blob/main/.github/workflows/line-workforce-pages.yml) | 測試、發布 `/LINE/workforce/`，不改其他 LINE 子產品 |

## 技術與安全約束

- 資料庫：既有 `unapiwajmgqqtdkixaab` Supabase 專案，僅新增 `wm_` 前綴的表、RPC 及安全規則。
- 正式企業：Supabase Auth + 每次讀寫驗證 `tenant_id`／成員角色；員工邀請使用短效、單次、資料庫只存雜湊的憑證。
- 公開 Demo：後端僅允許讀寫**固定虛構企業**，不需登入 LINE，也不可藉此存取正式公司資料；所有 Demo 變更皆會共同顯示。
- **LINE 整合**：一般 LIFF 綁定、既有 OA 通知與 LINE MINI App 前後端接入程式已具備，並已加入工作怪獸三組 MINI App 公開 Channel ID；**原本 `/workforce/` 與 MINI `/workforce-mini/` 是獨立靜態網站**，共用相同 Supabase 資料與核心業務程式；仍需在 LINE Developers 確認各環境 Endpoint、openid scope，並完成手機實機驗收；**不代表 LINE 已完成認證或免費服務訊息已啟用**。
- **尚未正式完成**：MINI App Endpoint／Scopes 與手機實機驗收、LINE OA 真實收訊證明及不同 Provider 對應、企業自有 OA、多角色跨企業完整 E2E、動態 QR/GPS 實機測試、臺灣完整法遵與薪資串接、真正可還原的自動備份及壓力測試。
- 各 SQL 變更已實際套用至目前 Supabase；因不同 SQL 重新定義相同函式，**不得將所有 migration 依檔名排序執行**，必須依照 MIGRATION-ORDER.md。

此文件只記錄已完成工作，不新增 PRD 以外的產品功能。
