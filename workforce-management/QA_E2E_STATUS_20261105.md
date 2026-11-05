# Workforce 實際端到端驗收紀錄（2026-11-05）

## 驗收範圍
正式 GitHub Pages 網站：`https://hub-google.github.io/LINE/workforce/`
Supabase 專案：`unapiwajmgqqtdkixaab`

## 實際已通過
- GitHub Actions 公開 Demo 真實瀏覽器測試：請假送出與駁回、加班送出與核准、補卡送出與核准、打卡、排班發布、換班雙方同意及主管核准、CSV 匯出、手機版彈窗。
- 真正 Supabase Auth：兩名不同使用者的已驗證 Auth 身分及密碼登入均成功，JWT 不同。
- Auth 角色隔離：擁有者可建立非 Demo 企業並新增員工；員工被綁定自己的 Auth UUID，員工無法讀取主管員工紀錄。
- 真實網頁：擁有者和員工在不同 Chromium Browser Context 登入、員工透過網頁送出待審加班申請、員工直接呼叫核准 RPC 被拒絕、主管點擊駁回後資料庫確實變成 `rejected`。
- 每次真實 Auth 測試均使用獨立臨時企業及臨時帳號。最新 SQL 核對已確認沒有殘留 `wf-auth-qa-*` 帳號與 `WORKFORCE_QA_*` 企業。

## 已修正並部署
1. 新企業 `INSERT RETURNING` 在自動建立擁有者身分之前遇到 RLS 拒絕：前端改以最小回應寫入並在完成後查證；增補僅建立者可讀取其非 Demo 企業的 RLS 政策（migration `20261105101037`）。
2. 新增員工時 `RETURNING *` 嘗試讀取受保護薪資欄位而 403：改成 `return=minimal`，沒有放寬薪資欄位權限。
3. Demo 尚未讀取完即登入正式企業造成舊 Demo 資料沿用：新增待補載入機制，身份轉換後重新取得正確企業資料。
4. 附件清單的 `wm_private.can_access_evidence(text,boolean)` RLS Predicate 未授權：僅授予 authenticated EXECUTE，匿名仍不可呼叫（migration `20261105102630`）。
5. 先前換班目標選單不刷新新班次：新增 `swap-sync.js` 每次開窗同步最新班表，已完成真實 Demo 換班測試。

## 尚未通過／不可宣稱已完成
- **正式 Auth E2E 的員工端刷新畫面驗收**：主管已成功透過實際網頁按駁回，DB 也已確認 `rejected`；但自動化腳本按下「更新」後立即讀取舊畫面，未等待非同步資料刷新，造成 UI 狀態檢查失敗。
- 因此正式雙身分的「員工重新登入看到駁回結果、主管再核准第二筆、員工看到核准結果」整段尚不能宣稱驗收通過。
- 這些暫時帳號會在每次測試結束後自動刪除，並非提供給外部使用的永久帳號。

## 正式驗收連結
- Demo 瀏覽器通過：https://github.com/hub-google/LINE/actions/runs/42009933987
- Auth 真實雙帳號部分通過（最後畫面同步斷點）：https://github.com/hub-google/LINE/actions/runs/42010846743
- Auth 測試腳本：`workforce-management/tests/workforce-auth-roles-e2e.mjs`

## 最後驗收所需檢查
實際員工頁點擊更新後，應等待對應申請列確實呈現「已駁回／已核准」（建議 Playwright `locator.waitFor`），之後才做畫面截圖及斷言；同時確認員工不能直接核准自己的申請、看不到主管資料、不能新增班次。所有項目均應在全新臨時企業完整重跑成功後才標記正式模式完成。
