# LINE 預約 SaaS：最新版 PRD 交付現況與未完成清單

> 更新基準：2026-11-04，主 PRD `QueueMonster/PRD.md` 第 0–103 章，及 `saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md`。程式比對至 main commit `36c35a1ce803dabdb7fb42201d1793f76094dac6`。本文件是**實作狀態盤點**，**不得當作功能已驗收或刪除原 PRD 的依據**。
>
> 總結：**尚未完成全部 PRD**。第 102 章規定 DoYouBook C01–C58 與 CallMeBack K01–K32 均須納入，且 A/B/C 波次全部必做。現有 GitHub Pages + Supabase SaaS 主要完成現行核心預約／取號／叫號，完整資源排程、CRM、商業化、PWA、Calendar、多窗口、設備合作等沒有達到 PRD 全範圍。另有未部署／未逐一 E2E 驗收的 Next.js 程式骨架，不可算正式可用功能。

## 狀態定義

- **核心可操作，待 E2E**：在正式部署程式找到流程與契約測試，但尚無足夠真實多裝置／多帳號完成證據；不得標為 PRD 完整交付。
- **部分完成**：僅有部分流程、UI、SQL、RPC 或單一模式，缺需求規定的其他場景或驗收。
- **尚未完成**：未找到正式可用、覆蓋需求及有對應驗收的完整實作；可能有骨架、文件或預留介面。
- **需外部條件**：能先建 API/本地流程，但真實串接須店家或服務商授權、帳號、商業資格或合作條件。

## 最新已合併的正式網頁交付

| PR | 已做的功能 | 證據 | 不包含 |
| --- | --- | --- | --- |
| #2–#4 | TV 單店全螢幕叫號看板、QR/A4 立牌、店員後台入口 | [#2](https://github.com/hub-google/LINE/pull/2)、[#3](https://github.com/hub-google/LINE/pull/3)、[#4](https://github.com/hub-google/LINE/pull/4) | 多窗口、多號同屏與設備配對 |
| #5 | 行銷首頁、公開功能入口與響應式設計 | [#5](https://github.com/hub-google/LINE/pull/5) | 原店員／顧客操作頁改版 |
| #6–#7 | 單次預約請求冪等與午休跨時段阻擋 | [#6](https://github.com/hub-google/LINE/pull/6)、[#7](https://github.com/hub-google/LINE/pull/7) | 服務時長／緩衝／資源引擎 |
| #8–#9 | 正式 `/LINE/booking/` 專用網址、顧客與後台品牌樣式、LINE OA 選單／LIFF 目標更新，舊 `/saas/` 相容保留 | [#8](https://github.com/hub-google/LINE/pull/8)、[#9](https://github.com/hub-google/LINE/pull/9) | 多商家不同 LINE Provider 的 E2E |
| #10 | 預約人數與可選時段名額連動、空 merchant 先找店、顧客可查看／列印當下預約憑證 | [#10](https://github.com/hub-google/LINE/pull/10) | 完整離線核對／資源排程 |
| #11 | 店員已載入工作清單的關鍵字／日期／狀態篩選與管理者 CSV | [#11](https://github.com/hub-google/LINE/pull/11) | 僅限工作清單資料範圍 |
| #12 | 預約及取號顯示建立時間精確到秒，台灣時區 | [#12](https://github.com/hub-google/LINE/pull/12) | 跨多時區的完整營業日政策測試 |
| #14 | 新增 Supabase `so_staff_reservation_search`：全歷史查詢、門市權限、狀態／日期／軟刪除條件、25 筆分頁，舊工作清單不變 | [#14](https://github.com/hub-google/LINE/pull/14) | 萬筆資料效能與多裝置 E2E 尚缺 |
| #15 | 管理者可批次匯出完整搜尋結果 CSV（每批 100 筆，單次最多 20,000 筆），公式防護與筆數一致性檢查 | [#15](https://github.com/hub-google/LINE/pull/15) | 超過 20,000 筆須分日期區間下載，非全量非同步備份服務 |
| #17 | 店家預約日／週／月曆，伺服器日期聚合與分頁 | [#17](https://github.com/hub-google/LINE/pull/17) | 資源排程、改期拖曳、真實大量壓測未完成 |
| #18 | 顧客驗證後可匯出單筆 ICS 行事曆事件 | [#18](https://github.com/hub-google/LINE/pull/18) | 訂閱及 Google Calendar OAuth／同步未完成 |
| #19 | 網頁安裝用 PWA manifest、圖示、安全離線提示與僅靜態快取 | [#19](https://github.com/hub-google/LINE/pull/19) | Web Push、裝置撤權、實機驗收未完成 |
| #20 | K03 候位票券記錄並顯示每組人數，保留舊 UUID／序號／資料 | [#20](https://github.com/hub-google/LINE/pull/20) | 自訂人數選項、桌型適配、多窗口未完成 |
| #21 | UX-11 單店／跨店叫號最後成功同步時間、失聯警示與手動更新 | [#21](https://github.com/hub-google/LINE/pull/21) | 多裝置與斷線情境實機 E2E 未完成 |
| #23 | PRD §103 預約憑證與個人取號歷史改用資料庫永久 21 碼 `reference_code`；既有 LINE-linked 顧客資料查詢保持相同權限範圍 | [#23](https://github.com/hub-google/LINE/pull/23)、[CI PASS](https://github.com/hub-google/LINE/actions/runs/41799705278)；Supabase 函式已套用，現存短碼格式查核 0 筆異常 | 尚缺手機／電腦顧客實機 E2E；不得據此宣稱整份 §103 或全 PRD 已驗收 |

正式網站：https://hub-google.github.io/LINE/booking/ 。實際已執行的 GitHub Actions CI/Pages 部署，**不等於**已完成 LINE 手機、真實收款、裝置／商家實測。

## PRD §102.8 NR-01～NR-26 验收對照（全部要完成）

| ID | 現況 | 尚缺的具體功能或驗收 |
| --- | --- | --- |
| NR-01 | 部分完成 | LINE 已有授權流程；非 LINE 純網頁訪客、OTP、安全查詢與可選店家開關未交付 |
| NR-02 | 核心可操作，待 E2E | 預約與叫號獨立、報到不產票的程式與 SQL 存在；仍需完整不同狀態／多店實測 |
| NR-03 | 部分完成 | 獨立流水號、前綴、手動重置已做；Unicode grapheme、跨午夜與兩店員同時重置仍需證據 |
| NR-04 | 部分完成 | request ID 冪等已部署；跨兩日／跨兩店／取消改期的真實 E2E 尚未全部通過 |
| NR-05 | 尚未完成 | 90 分鐘服務＋30 分緩衝、指定員工／房間／設備的交易級不可重疊引擎 |
| NR-06 | 尚未完成 | 座位與容量隨時間釋放／再利用，按服務或時段計算 |
| NR-07 | 尚未完成 | 固定場次、每日名額、不限時至打烊、包場與取消恢復 |
| NR-08 | 部分完成 | Ticket.party_size 已可由顧客輸入並於後台／本人紀錄顯示；桌型適配、多窗口分流、商家自訂人數與公平排序仍缺 |
| NR-09 | 尚未完成 | HOLD/RESUME、期限、保留次數、恢復順位及相關稽核 |
| NR-10 | 尚未完成 | 早午晚休場次切換（不中斷舊候位、不連動重置） |
| NR-11 | 尚未完成 | CALLED、ARRIVED、ADMITTED、SERVING、COMPLETED 各自可見且可稽核 |
| NR-12 | 部分完成 | Tenant/員工權限與部分原子操作已做；多分店多窗口併發、跨商家滲透測試仍缺 |
| NR-13 | 部分完成 | 顧客進度、單店看板、Realtime／輪詢、最後成功同步時間及斷線非即時警示已做；多裝置斷線／跨店 E2E 尚缺 |
| NR-14 | 部分完成 | LINE 通知、Outbox/重試/健康度有基礎；交易原子入列、取消改期提醒、API 429/5xx、重送／死信全流程仍需驗證 |
| NR-15 | 部分完成 | 全螢幕單店看板已提供；多窗口多號、促銷同框、看板配對碼與可撤銷 device token 未做完 |
| NR-16 | 核心可操作，待 E2E | QR/A4/PNG/瀏覽器列印有程式；不同店、不同 LINE/桌面瀏覽器及印表機實測未齊 |
| NR-17 | 部分完成 | 商家申請、審核及 OA 串接介面存在；完整一步步精靈、自有 Provider 實體 E2E、切換/撤權仍缺 |
| NR-18 | 部分完成 | 顧客單筆 ICS 匯出已做；ICS 訂閱、GCal 單向及安全雙向提案／衝突審核未完成 |
| NR-19 | 部分完成 | PWA 安裝與靜態離線提示已部署；Web Push、員工撤權、訂閱／取消訂閱、實機驗收仍缺 |
| NR-20 | 部分完成 | 顧客改期／取消與店員狀態修正存在；店員直接改時段服務、提醒重排、已付款差額和退款未完整 |
| NR-21 | 部分完成 | 本店完整歷史查詢與管理者批次 CSV 已上線（單次 20,000 筆上限）；完整客戶簿、黑名單／申訴、OTP 身分關聯、超量報表服務仍缺 |
| NR-22 | 部分完成 | 公開 opt-in 店家目錄可搜尋；縣市地理／距離／地圖與 2D 像素風商店街未交付 |
| NR-23 | 尚未完成 | 真實 LINE Pay/信用卡/合規轉帳、訂金、逐品項支付、退款對帳、商家 SaaS 月費／試用兩套帳 |
| NR-24 | 尚未完成 | POS/第三方設備 API、限權 token、簽章 webhook、可撤銷設備配對、sandbox／廠商整合 |
| NR-25 | 部分完成 | 保留 `/saas/`、非破壞性部署、測試店恢復路徑；部署前後 QA UUID/筆數、備份還原、各裝置回歸未完整驗收 |
| NR-26 | 部分完成 | 預約歷史已有後端分頁與權限模擬 SQL 測試；仍缺真實萬筆資料性能／壓測、安全滲透測試、多裝置跨商家越權 E2E、監控／災難復原 |

## 依實作依賴分組的未完成工作（全部保留在 PRD）

**A 波：正確性與共用底座優先**
1. 正規化 service/resource/slot 的 duration、buffer、staff、room、座位、固定場次與每日容量；伺服器端交易鎖／防超賣。
2. Ticket party size 已實作基本收集／顯示，仍缺自訂人數、窗口／桌型隊列、HOLD/RESUME、場次、入場／服務狀態、可撤銷看板裝置授權。
3. 完整歷史搜尋與後端分頁已上線，待真實萬筆資料性能驗收；仍缺預約憑證核對／離線備援、通知完整交易保證及多店員併發。
4. 所有 P0：Unicode 3 字前綴、跨日、LIFF 多裝置、LINE OA 失敗與通知、資安/QA 資料保全的端到端驗收。

**B 波：完整店家營運**
1. 店員代客預約、編輯/改期、可設定二次確認；每服務時長顯示控制、價量快照、加購、自訂問題、取消期限和提醒。
2. 店家開通精靈、自有 LINE OA 多 Provider、訊息額度／事件設定、品牌公告多圖、員工資源排班；日週月預約日曆已做基礎查詢與顯示。
3. 客戶簿、No-show 記錄與申訴／黑名單、20,000 筆以上的全量報表服務、非 LINE 訪客 OTP。
4. PWA 安裝與單筆 ICS 匯出已有基礎；仍缺 Web Push、ICS 訂閱、Google Calendar 單向、看板多號碼與促銷、開放合作 API 初版。

**C 波：商業化與加值**
1. 店家公開搜尋的完整分類、附近位置、地圖與 2D 像素風探店。
2. Google Calendar 可選安全雙向（衝突提案，不直接改正式預約）；POS／設備 API、sandbox。
3. 顧客付款與商家訂閱分帳：LINE Pay／信用卡／轉帳／訂金／部分付款／退款／對帳／試用／發票。
4. 進階數據與 ESG 可驗證指標、客服問題紀錄、完整日誌/監控、負載/災難復原。

## 必須由外部提供／驗證的條件

- **店家自有 OA**：每個商家需有自己的有效 LINE Official Account、LINE Login/Messaging Provider、可授權的憑證、設定與真實測試帳號。平台可先做介面與安全儲存，但不能替任意店家自動取得憑證。
- **Google Calendar**：正式商家需要同意 Google OAuth 權限；雙向亦須依本地資料庫版本／容量審核。
- **金流**：實際 LINE Pay/信用卡/第三方收款要有合適的商家資格、正式金流帳號與授權；不能以模擬付款宣稱正式收款。
- **電話 OTP**：要有合法可用的簡訊／驗證供應管道或替代驗證機制，並處理個資。
- **POS/叫號設備**：平台可先製作公開 API 與沙盒；要宣稱與特定廠商相容，需要該廠商 API/設備及測試認證。
- **實機驗收**：要有至少兩位不同 LINE 用戶、兩位授權店員、不同門市，以及 iOS/Android/desktop 真實操作情境；沒有這些不可標記全案 Done。

## 並行開發與驗收紀律

- 主需求書 `PRD.md` 不改寫、不刪功能；本文件可持續追加進度，但不得用「延後」取代 PRD 的最終必做要求。
- 寫入前讀最新 main、open PR、gh-pages、已執行 Supabase migration。獨立 branch+PR、逐批 CI、main 快照核對，不強制 push、不清測試資料。
- SQL 必須 additive、備份/驗證舊 QA/正式商家筆數；前端與後端共用同一商家/UUID/權限判斷，不能只用 UI 存在宣稱功能成功。
- **Definition of Done**：功能可實際操作、後端授權/持久化、通知/付款相依成功或安全降級、單元+整合+E2E 與多裝置證據完整。現階段不符合「全部 PRD 開發完成」。

## 風險註記

- 這份狀態為**保守的程式與部署證據盤點**，不是正式資安稽核，也不是聲稱任何特定用戶資料已暴露／遺失。
- 既有 Next.js `QueueMonster/src` API 框架、schema/README 文件與 GitHub Pages 上的 Supabase SaaS 可能有重疊，但未經實際可用的正式部署驗收不得互相算作完成。


## 2026-11-04 補交付：FR-112「預約送出前二次確認」（現有需求，不是新增任務）

> 本節以最新實作與實際 Supabase SQL 驗證為準；其餘 NR-01～NR-26、FR／UX／OSS 未完成需求仍應持續執行，**不因這項功能完成而視為整體 PRD 已交付**。

| 項目 | 交付與證據 |
| --- | --- |
| 管理端 | `QueueMonster/saas/index.html` 原設定頁增加「送出前顯示確認卡」開關，獨立儲存 |
| 顧客端 | 原預約步驟在送出前顯示門市、日期、時段、臺灣時區、人數、LINE 暱稱、服務與估價，支援返回修改或最終確認 |
| API／資料 | `so_booking_policy.require_confirmation` 預設 true；`so_get_booking_policy`、`so_customer_booking_confirmation`、`so_set_booking_confirmation`；OWNER／MANAGER 才可修改，寫入稽核 |
| 一致性 | 沿用 `so_book_with_items_once` 和 `customerBookingRequestId`，不另建預約資料、UUID、容量扣減或提醒管道 |
| Migration | `QueueMonster/supabase/migrations/20261104_booking_confirmation_fr112.sql` 已套用到原有 Supabase；非破壞式 migration |
| 合約測試 | `QueueMonster/tests/booking-confirmation-fr112.test.mjs`，已加入既有 PR 與正式部署 CI 測試清單 |
| 資料庫測試 | 以 QA OWNER 身分在 rollback transaction 中先讀預設 true、切換 false，再讀到 false；交易回滾後沒有更改既有店家設定 |
| 前端測試 | 單一內嵌 module 語法通過；確認卡、返回／確認、設定與冪等 API 契約檢查通過 |
| 佈署驗證 | 2026-11-04 已從 `gh-pages/booking/index.html` 與 `gh-pages/saas/index.html` 讀到新版程式；`booking/release.json` 顯示 build `335c4fb876cad3f1e74897527e3575d4a6e7e3f3` |
| 尚缺 | 尚無真實 iOS／Android LINE LIFF、多人競爭最後一個名額、取消返回的瀏覽器實機 E2E 記錄；FR-112 的全面正式驗收須補足 |

**相容與回滾：** 關閉確認只影響 UI 層，不改變後端容量驗證或冪等。若需回滾 UI，還原單次變更的 `saas/index.html`；保留可向前相容的 `require_confirmation` 欄位與 RPC，不得刪除表或既有資料。無外部商家 OA 或付款憑證時，仍可在既有測試店的預約入口驗證基本操作。


## 2026-11-04 本輪後續交付：FR-110、FR-108／109（原 PRD 範圍）

> 已在原專案 `QueueMonster/` 的原管理端及顧客端整合；沒有另開 GitHub issue/task，沒有另建產品、沒有刪除既有顧客或預約。

| PRD | 已實作並儲存 | 後端測試／限制 |
| --- | --- | --- |
| FR-110／C39 門市公告與照片 | 新增 `so_store_announcements`、帶店家隔離及管理者權限的新增／編輯／公開 API；原店家設定編輯，顧客首頁展示公告與最多八張可左右滑動的 HTTPS 照片 | 以既有 QA 商家身分在 PostgreSQL transaction 建立公告，驗證店員／顧客查詢與停用後隱藏，最後 `ROLLBACK`，保留正式資料 |
| FR-108／109／C32–C35 顧客簿、No-show、黑名單 | 新增 `so_customer_flags`、各店獨立顧客簿 RPC、管理者註記與標籤、黑名單警示及拒絕新預約的資料庫 trigger，支援原店家後台設定；只以同租戶既有 reservation / LINE 驗證身分關聯 | QA OWNER 在回滾 transaction 中成功儲存顧客旗標並讀回。實際前後台禁訂 E2E、申訴流程、進階全量 CRM 尚未全部驗收 |

### 本輪程式與 SQL

- `QueueMonster/saas/index.html`：沿用既有 LINE 預約單頁程式，不另建流程。
- `QueueMonster/supabase/migrations/20261104_store_announcements_fr110.sql`：已實際套用到 Supabase。
- `QueueMonster/supabase/migrations/20261104_tenant_customer_book_fr109.sql`：已實際套用到 Supabase。
- `QueueMonster/tests/store-announcements-fr110.test.mjs` 與 `customer-ledger-blacklist-fr109.test.mjs`：原有 CI 清單已加入新增契約測試。
- `gh-pages/booking/index.html` 與 `gh-pages/saas/index.html`：已能讀取到 FR-112、FR-110、FR-108／109 前端代碼；但**沒有實際手機 LINE E2E、不同門市安全滲測或付款驗收，勿宣稱整份 PRD Done**。

### 尚需完成（保留原需求，不刪除）

- NR-05/06 服務與資源時段防撞、容量重複利用：另有既存開發 PR #30，應驗收其最終合併結果，不並行覆寫。
- C01–58／K01–32／其餘 NR、FR、UX：尚需逐項依本文件前述表格補齊，特別是 LINE 多 OA 實機、資源排程、OTP、完整 CRM、Calendar、Web Push、多窗口、看板、金流及第三方 POS/設備。
- 本輪有前端語法檢查、DB transaction 操作及資料庫/Pages 檔案核查，**尚無所有既有合約測試在本輪完整 PASS 的證據**。正式 LIFF、消費者與兩店員端到端操作、企業真實金流仍須經各自帳號/授權及實機驗證。

**2026-11-04 本輪補充驗收證據：** FR-112、FR-110、FR-108/109 三份針對性程式契約測試共 10 項，在讀取最新 GitHub 檔案後逐一執行相同 JavaScript assertion，**10/10 通過**（非全專案 Node CI 或實機 E2E）。再查 Supabase 權限：匿名角色對公告、顧客標籤表及寫入 RPC 均無權限；建立公告／標籤／核准的 QA 驗收修改均 rollback。部署檔案 `gh-pages/booking/index.html`、`gh-pages/saas/index.html` 同時含本輪三項功能，`booking/release.json` build `ec9f6fc06e5f1c2b8628faa867afca288f1203ae`（2026-11-04 19:24 臺灣時間）。
