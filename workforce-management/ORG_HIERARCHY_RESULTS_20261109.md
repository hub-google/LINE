# Workforce 多企業 SaaS｜最新正式驗收報告

**驗收日期：2026-11-09（台灣時間）**  
網站：https://hub-google.github.io/LINE/workforce/  
功能範圍：多企業註冊、正式 Auth、企業總管理者、HR、主管、組長、一般員工、跨企業資料隔離、主管鏈設定與授權審核、員工邀請、桌機／手機版介面。

## 驗收結論

本次指定的多企業組織管理、登入及層級審核功能，已完成**實際瀏覽器及真實 Supabase 往返測試**；2026-11-09 再次重跑成功。

| 測試套件 | 結果 | 證據 |
|---|---|---|
| 多企業與階層權限 Playwright E2E | **32 PASS、0 FAIL** | https://github.com/hub-google/LINE/actions/runs/42142546938 （第 2 次執行，2026-11-09） |
| 真實 Auth、員工提交、主管核准／駁回、通知與班次 | **17 PASS、0 FAIL** | https://github.com/hub-google/LINE/actions/runs/42541920332 |
| 原有 Demo 請假／加班／補卡／打卡／換班／手機／異常掃描 | **19 PASS、0 FAIL** | https://github.com/hub-google/LINE/actions/runs/42024650547 （第 2 次執行，2026-11-09） |
| Pages 編譯、PRD 單元測試與部署 | **success** | https://github.com/hub-google/LINE/actions/runs/42541920374 |

**合計 68 個通過的測試斷言**，分屬三套獨立的測試程式；數量不代表完全覆蓋全站所有功能。

## 企業與帳號實際資料

Supabase `unapiwajmgqqtdkixaab` 已建立、且 2026-11-09 確認仍存在：

- 虛構企業 **Workforce QA 星河服務股份有限公司**：8 位成員
- 虛構企業 **Workforce QA 海角工作室**：1 位企業管理者
- **9 個不同 Supabase Auth QA 使用者**：Owner、HR、兩個不同部門的 Manager、營運組長、不同直屬主管下的員工，以及另一家公司的 Owner

固定測試帳密見 `tests/org-qa-accounts.mjs`；這些帳號是可公開演示的虛構資料，**不可存放真實員工個資或生產資料**。

## 驗收案例與對應

完整測試計畫：[`ORG_HIERARCHY_TESTPLAN_20261106.md`](./ORG_HIERARCHY_TESTPLAN_20261106.md)，共列 35 個業務情境。以下將驗收項目依實際自動化覆蓋分組：

| 測試範圍 | 案例 | 結果 |
|---|---|---|
| 角色建立、JWT、兩公司隔離、主管樹與各角色 RLS 名冊 | H01–H11 | 全部通過 |
| Owner／HR／經理／組長／員工／外部企業在真實瀏覽器登入及操作 | H12–H17 | 全部通過 |
| 員工請假、越權審核阻擋、直屬組長核准、加班及部門經理審核 | H18–H23 | 全部通過 |
| 員工無法自行升權、不可設定循環管理鏈、Owner 編輯主管、更新 RLS、恢復層級 | H24–H28 | 全部通過 |
| 管理者建立邀請、錯誤 Email 拒絕、正確 Email 綁定、不可重複使用 Token | H29–H32 | 全部通過 |
| 手機 390px 組織操作畫面 | H33 | 通過 |
| 既有請假／加班／補卡／排班／換班／打卡／CSV／通知與異常掃描回歸 | H34 | 19 個實際瀏覽器檢查通過 |
| 重複執行帳號／企業種子程式不重複建立公司員工 | H35 | 2026-11-06 與 2026-11-09 跨次重跑，仍是 2 家企業／9 個 Auth 帳號，通過 |

## 重要安全驗收

- 主管的上下級權限儲存在 `wm_members.reports_to`，不是依前端顯示判定。
- `wm_private.member_visible` 對員工名冊實行跨部門、跨企業 RLS。
- `wm_private.can_approve_member` 對待審申請實行管理鏈判斷；不屬於所轄、自己送的申請或其他公司申請不能直接呼叫 RPC 越權審核。
- 邀請 Token 只保存 SHA-256 摘要；指定 Email、7 日過期、一次性；截圖中的實際 Token 已遮蔽。
- 自己修改 role 的 RPC 會在伺服器拒絕；主管不能將自己設定為自己的下屬。
- 全站共用資料庫其他專案未納入此報告範圍；安全顧問仍對整體 Supabase 專案列有 Security Definer 與 GraphQL 可見性等提醒。**本報告不能取代上線前獨立安全稽核與壓力測試**。

## 截圖與稽核資料

GitHub Actions 實際測試封存：[`workforce-enterprise-hierarchy-qa`](https://github.com/hub-google/LINE/actions/runs/42142546938)（17 張 Playwright 角色、表單、審核與手機畫面；含 `hierarchy-e2e-results.json`）。本報告沒有使用 AI 生成畫面冒充操作測試。

## 尚未列入完成的上線驗收

此套驗收**不等於** LINE OA 外部通知實際送達、各類法定工時計算、薪資結算、正式企業大規模高併發壓測、付費訂閱及生產資料災難復原均已驗收完成。若要直接公開收取真實企業員工資料，仍須完成此類營運與資安檢查。
