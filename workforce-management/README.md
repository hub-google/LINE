# LINE Workforce｜員工排班、打卡與請假管理

> **2026-11-04 實際開發版**：已擴充真實 Supabase 資料庫及 GitHub Pages 網頁。**PRD 有部分功能尚未完成**，包括正式 LINE 登入／通知、完整法定假勤與跨店進階排班。

**[開啟 GitHub Pages 人資測試站](https://hub-google.github.io/LINE/workforce/)**  
[完整 PRD](./PRD.md)｜[最新實作與驗收狀態](./IMPLEMENTATION-STATUS.md)｜[資料庫執行順序](./supabase/MIGRATION-ORDER.md)

這是 `hub-google/LINE/workforce-management/` 的**獨立人資 SaaS 產品**，和 `QueueMonster/` 預約叫號分開。**不要在公開 DEMO 輸入真實員工個資、薪資或健康資訊**；其資料為全體訪客共享的虛構公司案例。

## 開啟網站後可以實測

1. **員工與分店**：新增分店、員工、部門；CSV 批次匯入（同編號跳過）；切換正式企業後可發一次性員工邀請連結。
2. **排班管理**：建立班表、複製上週為草稿、管理班型、提交可上班時段、設定最低人力、預覽自動排班建議並由主管確認寫入草稿；不同員工交換班次須雙方與主管同意。
3. **出勤打卡**：打上下班卡、查看資料庫原始紀錄與出勤狀態；分店可設定 GPS 地理圍欄，無定位不得假稱打卡成功。
4. **請假／加班／補卡**：申請、核准／駁回、撤回，核准更正另建稽核資料，不覆寫原始打卡。
5. **通知收件匣**：班表及假勤狀態異動產生站內通知；尚非 LINE OA 真正推播。
6. **月度工時與月結**：按月試算，鎖定月結快照，後續開更正單及 CSV 匯出（**非正式法定薪資計算**）。

## 主要檔案

| 檔案 | 功能 |
|---|---|
| [PRD.md](./PRD.md) | 唯一的原始產品需求範圍，保留既定全部項目 |
| [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) | 功能完成狀態、測試證據與尚未交付項目 |
| [app.js](./app.js) / [index.html](./index.html) / [style.css](./style.css) | 維持同一支響應式網頁；資料實際連到 Supabase |
| [tests/workforce-prd.test.mjs](./tests/workforce-prd.test.mjs) | 核心合約、排班計算、CSV 解析與 SQL 安全限制測試 |
| [supabase/MIGRATION-ORDER.md](./supabase/MIGRATION-ORDER.md) | 現有資料庫 SQL 重建的唯一正確順序 |
| [GitHub Actions](https://github.com/hub-google/LINE/blob/main/.github/workflows/line-workforce-pages.yml) | 測試、發布 `/LINE/workforce/`，不改其他 LINE 子產品 |

## 技術與安全約束

- 資料庫：既有 `unapiwajmgqqtdkixaab` Supabase 專案，僅新增 `wm_` 前綴的表、RPC 及安全規則。
- 正式企業：Supabase Auth + 每次讀寫驗證 `tenant_id`／成員角色；員工邀請使用短效、單次、資料庫只存雜湊的憑證。
- 公開 Demo：後端僅允許讀寫**固定虛構企業**，不需登入 LINE，也不可藉此存取正式公司資料；所有 Demo 變更皆會共同顯示。
- **尚未正式完成**：真實 LINE Login／LIFF、店家自有 OA／總公司 OA Rich Menu、發送通知、動態 QR、防作弊實機驗收、臺灣完整法規計算及薪資整合。
- 各 SQL 變更已實際套用至目前 Supabase；因不同 SQL 重新定義相同函式，**不得將所有 migration 依檔名排序執行**，必須依照 MIGRATION-ORDER.md。

此文件只記錄已完成工作，不新增 PRD 以外的產品功能。
