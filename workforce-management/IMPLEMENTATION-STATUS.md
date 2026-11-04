# LINE Workforce｜開發狀態與驗收紀錄
> 2026-11-04 · 初始可測試版本（非 PRD 全數完成）  
> 程式碼：`workforce-management/`  
> GitHub Pages 預計入口：https://hub-google.github.io/LINE/workforce/  
> 發布來源：`gh-pages/workforce/`，已確認三個前端檔案存在；此環境**尚未取得實際網頁 HTTP 成功回應**，不以此宣稱端到端瀏覽器驗收通過。  
> 後端：現有 `hub-google's Project` Supabase（`unapiwajmgqqtdkixaab`），僅使用前綴 `wm_` 的獨立資料表、限定 Demo RPC；沒有修改預約與叫號資料。

## 已完成且後端測試成功

| 項目 | 完成範圍 | 測試事實 |
|---|---|---|
| DB-01 | PostgreSQL 10 張 `wm_` 表、PK/FK/索引、RLS、伺服器 RPC | migration 成功套用 |
| DB-02 | 完整原始 migration 已存回 `supabase/migrations/` | 4 份與 Supabase 實際版本一致 |
| DEMO-01 | 公開但嚴格綁定虛構租戶的 Demo 資料 | 1 企業、2 分店、5 員工、28 初始班次、15 假期額度 |
| DEMO-02 | 匿名讀取 Demo 快照 | 以資料庫 `anon` role 呼叫 RPC，讀到 5 名員工 |
| DEMO-03 | 建立員工 | 以匿名 Demo RPC 實際寫入成功，交易回滾，不污染預設測試資料 |
| DEMO-04 | 建立排班 | 以匿名 Demo RPC 實際寫入成功，交易回滾 |
| DEMO-05 | 上班打卡 | 資料庫伺服器產生時間，實際 RPC 寫入成功，交易回滾 |
| DEMO-06 | 打卡防重 | 同一冪等鍵連續兩次回覆**相同紀錄 ID**，交易回滾 |
| DEMO-07 | 請假申請、主管核准 | 匿名 Demo RPC 依序建立申請與核准成功，交易回滾 |
| SEC-01 | Demo 公開 API 僅能存取固定測試企業 | RPC 的查詢及寫入限定常數 tenant UUID，且不接受正式 tenant ID |
| SEC-02 | 匿名禁止直接 SELECT / INSERT / UPDATE 全部 `wm_` 表 | 使用 `REVOKE` + RLS；Demo 只能透過限制 RPC |
| SEC-03 | 正式租戶資料需通過 Auth JWT / tenant membership / RLS | 已建立政策，正式完整流程與邀請仍待驗收 |
| FE-01 | 響應式網頁原始檔 | `index.html`、`style.css`、`app.js` 已寫入 `main` 及 `gh-pages` |
| FE-02 | 程式碼語法 | 靜態 JS 語法檢查通過；GitHub Actions 亦設定 `node --check` |

## 已有介面與可用的資料庫操作

- 工作總覽：今日班次、今日打卡事件、待審件數。
- 排班：週班表、草稿／發布／取消、新建時間衝突拒絕（以 DB 為準）。
- 打卡：上下班與休息事件，以 DB 伺服器時鐘產生紀錄，拒絕重複鍵。
- 請假／加班／補卡／換班：申請表單、審核狀態與額度呈現；已核准申請阻止再次核准。
- 主管審核：核准／駁回請求，由 RPC 儲存；特休／病假等使用示範時數。
- 員工／分店：新增與清單；Demo 有數量上限防濫用。
- 工時報表：七日查詢、IN/OUT 配對時數與 CSV 匯出；**非正式法定工時計算**。
- 正式企業帳號：email/password Supabase Auth UI、建立企業與 RLS 讀寫的前端流程已撰寫，**尚未以完整真實帳號做端到端驗收**。

## 尚未完成的 PRD 功能／限制

| PRD 模組 | 仍待開發或驗收 |
|---|---|
| LINE 登入／OA | 真實 LINE Login／LIFF callback、總公司 OA 與店家 OA 綁定、Rich Menu、Messaging API 通知及配額 |
| 員工邀請 | 以安全邀請連結完成員工和真實登入帳號綁定、跨公司入離職與代理人權限 |
| GPS／QR | 正式 GPS 地理圍欄現場驗收、動態 QR、補卡佐證流程 |
| 排班 | 員工交換班簽核、休息與法定排班檢核、自動排班公平性、跨店複雜規則 |
| 請假／加班 | 法定假別／特休週年制、額度結轉、補休、完整證明附件與多層簽核 |
| 工時／報表 | 月結鎖定與更正、合法加班認定、工資核算／薪資串接、精密跨日／休息核算 |
| 平台 SaaS | 付費方案、通知配額、平台客服、備援演練與正式資安滲透測試 |
| QA | 實機 LINE/桌機／手機瀏覽器端到端測試、壓力測試、跨租戶負面測試全面完成 |

## 操作驗收建議

1. 開啟 https://hub-google.github.io/LINE/workforce/；預設直接進入**公開共用 DEMO**。
2. 「員工與分店」新增一名**虛構員工**。
3. 「排班管理」切到未來一週、為員工新增班次；相同時間再建立一次應收到衝突錯誤。
4. 「出勤打卡」為測試員工打卡，再進「工時報表」查看新增事件。
5. 「請假與加班」新增請假，接著「審核中心」核准；確認申請狀態改變。
6. 重新整理頁面，上述操作仍應存在（Supabase 真實存取）。測試資料共用，請勿輸入真實姓名、個資或健康資訊。

## 資料安全說明

- DEMO 所有虛構資料共用且可被所有測試訪客變更，**不能儲存真實人事資料**。
- 網站只有公開 Supabase publishable key，**沒有 service_role/secret key**；正式資料的每筆 API 請求都需受 RLS 控制。
- Google/GitHub Pages 只負責前端，所有資料存在 Supabase PostgreSQL。
- 本次沒有改動既有 `so_`（門市預約）、`ti_`（標案）、`chance_` 等資料表或相關憑證。
- Supabase Security Advisor 對有意開放的 Demo Security Definer RPC 會提出警示；其權限限制為單一固定虛構企業，其餘資料表匿名直接存取已撤銷。
