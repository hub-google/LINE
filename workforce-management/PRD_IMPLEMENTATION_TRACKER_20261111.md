# Workforce PRD 實作追蹤（2026-11-11）

> 需求唯一來源：[PRD.md](./PRD.md)｜[全角色操作情境](./USER_SCENARIOS.md)｜[網站](https://hub-google.github.io/LINE/workforce/)
>
> **標示規則**：已部署 ≠ 已完成正式驗收；程式碼、資料庫、後端權限、實際跨角色操作及外部 LINE／法遵都須各自通過。請以每筆 Git commit 及 Actions run 留存證據，勿將未完成項目標為 PASS。

## 2026-11-12｜只收尾先前指定的三項功能

> **這一節為最新交付狀態，取代本文件下方 2026-11-11 先前的「BLOCKED／尚未套用」敘述。** 這次沒有新增其他功能，不等於整份 PRD 都已完成。

| PRD 項目 | GitHub 與資料庫 | 驗收 |
|---|---|---|
| HR-LVE-03：已核准請假改期 | 既有申請中心＋主管多關簽核，已套用 `wm_leave_amendments` 及其歷程與權限 RPC；原請假直到核准前維持不變、支援版本稽核 | 真實員工／主管 E2E 通過，包含本人不得自審、主管核准、版本保留及阻擋重複核准 |
| HR-LVE-05：事前／事後加班 | 既有加班表單新增結構化申請時點；已套用 DB 欄位、後端日期／月結驗證，不修改打卡原件 | E2E 通過；假資料建立與核准流程沒有捏造原始打卡 |
| HR-ATT-10／HR-RPT-05：長期出勤與補卡歷史 CSV | [SQL migration](./supabase/migrations/20261111_workforce_attendance_history_export.sql) **已成功套用**。在原本報表頁依伺服器授權匯出五年範圍內的原始打卡、補卡申請、簽核動作和更正；逐批下載並比對每類總數，避免不完整檔案 | 實際員工 CSV 下載、權限隔離與補卡審核歷程的 E2E 通過 |
| 以上三項部署 | [Pages Run 43128890720](https://github.com/hub-google/LINE/actions/runs/43128890720) | 靜態檢查、PRD 合約、網站部署與遠端公開 API Smoke 皆為 Success |

- **跨角色完成證據**：[Real Auth E2E Run 43128616161](https://github.com/hub-google/LINE/actions/runs/43128616161)：35 個 PASS；真實 Supabase Auth 虛構企業，含瀏覽器表單、CSV 下載、主管權限及資料庫稽核；結束清理測試租戶。
- **最後分頁補強**：對大量補卡簽核歷程改為逐頁 500 筆讀取，超過 API 單次上限也不會截斷；對應 commit `aaf0faa6`，部署已完成。最新版本的回歸跑在 [E2E 43128890715](https://github.com/hub-google/LINE/actions/runs/43128890715) 及 [Browser 43128890667](https://github.com/hub-google/LINE/actions/runs/43128890667)。
- 此三項的行政資料與加班申請狀態，不可當成完整的臺灣勞基法核算或薪資核發；未經用戶要求，不在本次增加其他模組。

## 2026-11-11 本輪已提交的程式與資料庫

| PRD ID | 模組／行為 | 實際改動 | 測試／限制 |
|---|---|---|---|
| HR-LVE-03／04／06 | 已核准請假由本人申請取消，主管核准／駁回，原假額釋出、月結保護 | `wm_leave_cancellations`、三個身分授權 RPC、歷史/通知與 UI；[migration](./supabase/migrations/20261111_workforce_leave_cancel_lifecycle.sql) | 隔離企業正式 Auth E2E 已通過；**核准後更改請假起訖**仍未完成，不能視為全部取消／變更情境交付 |
| HR-ORG-03／04 | 員工停用／復職並保留原始出勤歷史；交接前檢查主管下屬、未來班表、待審申請 | 同 migration 的 `wm_set_employment_status` RPC 與 UI | 正式 Auth E2E 已通過；排程於未來日期的離職、留停等完整生命週期仍未完成 |
| HR-LVE-10 | 四種補卡類型分欄儲存 | [structured correction migration](./supabase/migrations/20261111_workforce_structured_correction_type.sql) 與 UI 清單 | DB 既有 16 筆中分類 14 筆、2 筆標記未分類，不覆寫打卡原件 |
| HR-RPT-02／03 | 週工時與出勤明細共用 IN/OUT/BREAK 片段算法；扣除休息、跨夜以 IN 日歸類、缺卡不偽算工時 | `attendanceRows` 復用、7 日工時頁、CSV 既有行為 | PRD 單元測試已通過；完整法定工時與薪資核發規則不在此算法結論內 |
| HR-SCH-03 | 員工本人提交可／不可上班時段、主管核准／駁回、員工撤回、企業截止時數 | [availability review + cutoff migration](./supabase/migrations/20261111_workforce_availability_review_cutoff.sql)、排班 UI、審核通知、排班建議篩選 | 資料庫 RLS 與匿名存取限制已確認；正式跨角色 E2E 新增案例持續以 Actions 結果為準 |

## PRD 功能逐項狀態

| 範圍 | 狀態 | 尚未補齊的要點 |
|---|---|---|
| HR-ORG-01～04 | **主要流程已實作，需全量權限回歸** | 多聘僱型態生命週期、未來生效的人事異動、各分店／跨企業角色權限角落案例 |
| HR-ORG-05 | **未完整完成** | 技能／證照有效性、職務資格與交接限制，敏感欄位合法目的 |
| HR-SCH-01～02 | **部分實作** | 輪班公平與排班組合、拆班/彈性班、正式異動版本對照 |
| HR-SCH-03～04 | **主要流程已實作，持續驗收** | 排休與核准的跨多日複雜衝突、人力需求的資格條件 |
| HR-SCH-05 | **部分實作** | 不同勞動制度、休息與法定限制的正式法遵規則引擎 |
| HR-SCH-06 | **主要流程已實作** | 換班雙方同意、主管核准、稽核與通知的全量並發驗收 |
| HR-SCH-07～09 | **部分實作** | 更完整的公平性／技能資格建議、可追溯推薦理由與成本比較 |
| HR-ATT-01～03 | **核心流程已實作** | 實機定位漂移、跨店與跨午夜異常情境的完整回歸 |
| HR-ATT-04 | **部分實作** | 短效 QR 已接通；共用設備合法代登記與 Wi-Fi 補充佐證仍缺 |
| HR-ATT-05～07／10 | **部分實作** | 打卡資料完整稽核與不可變政策、重送、補卡衝突及長期取回 |
| HR-ATT-08～09 | **未完整完成** | 靜音時間提醒排程、外勤例外打卡流程 |
| HR-LVE-01～06／08～13 | **核心與本輪增強已實作** | 已核准假單「變更日期」、代理簽核、各法定假別及生效規則驗收 |
| HR-LVE-07 | **部分實作** | 私有附件已有；代班建議與批次審核仍缺 |
| HR-LINE-01～04 | **部分實作** | 平台 LINE 綁定與訊息佇列有程式；實際送達／企業自有 OA／配額及韌性驗收未完成 |
| HR-LINE-05～06 | **未完整完成** | Rich Menu／對話式指令與高風險二次確認、AI 僅預填待確認 |
| HR-RPT-01～05 | **主要流程已實作，部分待法遵驗收** | 查詢完整度、法遵時數、正式外部薪資匯出和保存到期追溯 |
| HR-RPT-06 | **未完整完成** | 合法的預估成本／薪資系統介接（不得等同正式發薪） |
| HR-OPS | **未完整完成** | 訂閱方案、收費回呼、品牌設定、客服、備份還原與停用保存政策 |
| NFR／法遵 | **需正式驗收** | 100 人同時打卡、p95 負載、臺灣工時法遵、長期資料保存、第三方安全與復原演練 |

## 核心驗收方式

- **正式權限及操作**：[LINE Workforce real Auth E2E acceptance](https://github.com/hub-google/LINE/actions/workflows/line-workforce-auth-e2e.yml)：建立隔離虛構企業、Owner／員工／主管三身分及測試班表，測試後清理。
- **瀏覽器操作與畫面**：[LINE Workforce browser acceptance](https://github.com/hub-google/LINE/actions/workflows/line-workforce-browser-e2e.yml)。
- **程式合約與部署**：[LINE Workforce GitHub Pages](https://github.com/hub-google/LINE/actions/workflows/line-workforce-pages.yml)：Node syntax、PRD assertions、Supabase 公開 DEMO API、同批前端部署。
- **供測試者操作的腳本**：[USER_SCENARIOS.md](./USER_SCENARIOS.md)；每一案例須個別附 PASS／FAIL／BLOCKED 和證據，僅代碼存在不視為 PASS。

## 限制與外部前提

1. 企業自有 LINE OA 必須由企業實際授權 Channel；不能將平台 OA 程式存在當成已連通企業 OA。
2. 金流需要實際付款服務商與簽章 webhook，未串接前不能宣稱訂閱付費完成。
3. 臺灣勞基法中的變形工時、休息、補休及不同聘僱制度需要人工法遵驗收；不得用一般工時門檻推論每一公司都合法。
4. 不得為了測試重置正式企業、共用其他產品資料表或自行製作測試 LINE 收件成功證據。

## 2026-11-11 第二輪：嚴格對照 PRD

| PRD 需求 | 本輪變更 | 資料庫實際狀態 | 驗收 |
|---|---|---|---|
| **HR-LVE-03／04／06／08** | [已核准假單日期變更](./supabase/migrations/20261111_workforce_approved_leave_amendment.sql)：員工提出變更，多關不同主管核准後原單才改日期；保存前後版本、重算假額、鎖住已月結期間、檢查重疊與權限；沿用既有假單表與審核體系 | **已成功套用**，新增日期變更表、簽核歷程及三支權限 RPC | 靜態 PRD 合約已通過；新增真人角色 E2E 遭 Supabase Auth 504／連線逾時阻擋，**尚未全數通過** |
| **HR-LVE-05** | [事前／事後加班](./supabase/migrations/20261111_workforce_overtime_advance_retroactive.sql)：原假勤申請表新增分類，獨立加班表單可選時點；後端檢查是否開始／結束、月結與跨人送件，絕不修改原打卡紀錄 | **已成功套用** | 靜態 PRD 合約已通過；新增正式 Auth E2E 未全數完成，**未宣稱 PASS** |
| **HR-ATT-10／HR-RPT-05** | [多年度原始出勤匯出 SQL 草稿](./supabase/migrations/20261111_workforce_attendance_history_export.sql)：範圍、授權、稽核與事件筆數核對 | **尚未套用**：Supabase DB migration 兩次連線逾時，未成功進入 migration | **BLOCKED**，未上線無法使用的前端假按鈕 |
| **NFR 程式部署／測試區分** | [Pages 工作流程](https://github.com/hub-google/LINE/blob/main/.github/workflows/line-workforce-pages.yml) 調整為靜態檢查通過可繼續部署；遠端 API Smoke 失敗最後仍標紅燈 | 設定已送入 GitHub main | 以最新 Actions 與實際 gh-pages commit 為準 |

**不能標為全數完成的部分**：已核准假期修改仍須真實跨角色、多層、月結、額度與衝突端到端驗收；加班的補休帳本、法定工時計算尚未交付；長期原始出勤資料、離職員工法定查閱、備份復原尚未交付。原 PRD 其他 HR-ORG／HR-SCH／HR-ATT／HR-LINE／HR-RPT／HR-OPS 要求沒有刪改。

**外部阻礙證據**：2026-11-11 的獨立 Auth E2E Run [43000150739](https://github.com/hub-google/LINE/actions/runs/43000150739) 在建立虛構 Owner 帳號時得到 504；Supabase migration 初始化又回報 Connection terminated due to connection timeout。這是尚未消除的 BLOCKED 狀態，不以程式存在取代實際測試。
