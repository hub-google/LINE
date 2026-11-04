# LINE Workforce｜員工排班、打卡與請假管理

> 狀態：**真實 Supabase 資料庫 Demo 已建置並發布到 GitHub Pages 分支；完整 PRD 尚未全部完成**（2026-11-04）
>
> **[前往測試網站](https://hub-google.github.io/LINE/workforce/)**｜[實作與驗收狀態](./IMPLEMENTATION-STATUS.md)
>
> DEMO 使用共用虛構資料，不需登入。請勿輸入任何真實員工個資。

本產品是 [hub-google/LINE](https://github.com/hub-google/LINE) repository 中的**獨立 SaaS 專案**，目標客群為臺灣中小企業、門市、連鎖店與兼職輪班團隊。

## 需求文件

- **[PRD.md — 完整產品需求書](./PRD.md)**（v0.1）

## 預計功能

員工在 LINE 或手機／電腦網頁中完成查班、上下班打卡、請假、補卡、換班與加班申請；主管可排班、審核與處理缺勤異常；企業人資可設定多店、多部門、假別、工時規則並匯出報表。支援平台總公司 OA 及企業自有 OA 兩種接入模式。

## 與其他 LINE 產品的關係

- **不屬於** `store-operations/` 預約／叫號專案的一部分。
- 不預設共用商家、員工、顧客資料庫或 LINE 認證憑證。
- 本階段不修改其他產品、不建立可用網頁、不聲稱任何功能已上線。

## 已建置的檔案

- `index.html`：手機與電腦共用的網頁。
- `app.js`：即時 Supabase API、排班、打卡、請假、審核、報表。
- `style.css`：響應式 UI。
- `supabase/migrations/`：四份已套用的 migration SQL。
- `.github/workflows/line-workforce-pages.yml`：獨立部署至 `gh-pages/workforce/`。

目前可在 DEMO 實際新增虛構員工、建立排班、打卡、提交與核准申請、匯出 CSV；真實 LINE Login／OA、月結與完整法遵功能仍待開發，詳見狀態表。

## 開發起點

依照 PRD 的 P0–P3 順序實作，每個需求須具備可驗收的真實資料操作、安全隔離與測試結果。詳細需求以 [PRD.md](./PRD.md) 為準。
