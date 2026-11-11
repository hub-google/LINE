# Workforce PRD 實作追蹤（2026-11-11）

> 需求唯一來源：[PRD.md](./PRD.md)｜[全角色操作情境](./USER_SCENARIOS.md)｜[網站](https://hub-google.github.io/LINE/workforce/)
>
> **標示規則**：已部署 ≠ 已完成正式驗收；程式碼、資料庫、後端權限、實際跨角色操作及外部 LINE／法遵都須各自通過。請以每筆 Git commit 及 Actions run 留存證據，勿將未完成項目標為 PASS。

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
