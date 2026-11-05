# Workforce 端到端驗收最終紀錄（2026-11-05）

## 驗收結論

**本次要求的主管／員工真實登入、申請、核准與駁回、員工重新登入查詢、權限隔離，以及 Demo 模組瀏覽器操作驗收均通過。**

- 正式 Auth 測試：**17 / 17 PASS**，使用三個真實、已驗證且互不共用 JWT 的臨時帳號（企業 Owner 用於初始化，實際 Supervisor 為 `manager` 角色，以及獨立 `employee` 角色）。
- 公開 Demo 瀏覽器測試：**19 / 19 PASS**，以 Playwright 真正點擊部署在 GitHub Pages 的按鈕，並向 Supabase 查詢結果，不以直接預先寫入資料庫的結果代替網頁驗收。
- GitHub Pages 構建／部署：**success**。
- 測試後清理：`auth.users` 裡 `wf-auth-qa-%@example.com` **0 筆**、`wm_tenants` 裡 `WORKFORCE_QA_%` **0 筆**；臨時企業的申請資料未留存。**公開 Demo 的測試紀錄依其原本共用測試政策保留**。

## 正式 Auth 端到端流程（17 項 PASS）

1. 驗證保護於 GitHub Actions Secret 的 Supabase 管理存取，不輸出管理金鑰。
2. 以 Supabase Auth 正式 API 建立已確認的 Owner、Employee、Manager 三個臨時使用者。
3. 每個使用者以密碼登入並取得獨立 JWT。
4. Owner 經正式 RLS 建立非 Demo 企業與分店、自動建立 Owner 身分。
5. Owner 新增 Employee 和 `role=manager` 的主管並各自綁定 Auth UUID。
6. **主管與員工在分離的 Chromium Browser Context 登入正式網站**，確認實際企業資料（不是共用 Demo）。
7. 員工無法透過 RLS 讀取主管員工資料；主管能看到授權管理範圍。
8. 員工透過實際頁面送出 **請假**；主管在另一個登入工作階段點擊「駁回」，DB 變成 `rejected`。
9. 員工**關閉原工作階段，使用帳密重新登入**，畫面顯示已駁回。
10. 員工透過實際頁面送出 **加班**；主管點擊「核准」，DB 變成 `approved`。
11. 員工再次使用新工作階段登入，畫面顯示已核准。
12. 員工直接試圖呼叫主管審核 RPC，被伺服器拒絕，原待審申請維持不變。
13. 站內通知：員工可見駁回與核准通知，主管能看到新申請通知，雙方無法越權讀取彼此的通知。
14. 主管在實際網頁建立並發布員工班次，DB 驗證成功；員工直接寫入主管限定的排班資料遭拒絕。
15. 所有暫時企業與 Auth 使用者在測試結束後安全清理，從資料庫查證為零筆。

> 以上濃縮流程包含實際 GitHub Actions 中逐項列示的 17 個 PASS 斷言。臨時測試帳號已清除，不是提供用戶長期使用的測試帳密。

## 公開 Demo 實際瀏覽器操作（19 項 PASS）

- 從 GitHub Pages 載入並取得真實 Supabase 資料。
- 請假送出、點擊主管駁回、員工頁查看已駁回、重複審核阻擋。
- 加班送出、點擊主管核准。
- 上班打卡並查證資料庫新增紀錄。
- 補卡送出與主管核准。
- 排班草稿建立、發布、第二位員工新班次建立。
- 換班申請、對方實際點擊同意、主管實際點擊核准，資料庫確認兩位員工班次確實交換。
- CSV 匯出真實下載事件。
- 手機寬度 390px 請求表單可操作、彈窗高於側邊導覽、不堆疊多個提示。
- 開啟通知收件匣與出勤異常頁、實際填入日期並點擊「掃描已完成班次」，畫面收到完成的伺服器回應。

## 修正項目

1. 換班表單取得過期的班表候選：`swap-sync.js` 在開窗時取得最新已發布班次，切換來源時重新篩選對方班次。
2. 正式企業建立與員工新增 403：減少 `INSERT ... RETURNING` 對不應讀取欄位的依賴；Owner 的新企業初始 SELECT 補齊最小 RLS 規則，沒有放寬其他租戶可見性。
3. 正式登入時偶發混入公開 Demo 的資料：`reload` 將同步前狀態顯示為「資料更新中」，身份轉換時捨棄過期 Demo 結果並重新讀取真實企業；登入 E2E 會檢查實際員工名稱後才開始。
4. 私人附件查詢 403：僅授予 `authenticated` 呼叫具完整使用者／企業／附件檢核的 `wm_private.can_access_evidence(text,boolean)`，不授予 `anon`。
5. 前端手機申請視窗被選單遮蓋與多筆提示重疊：修正版已回歸通過。
6. 自動化測試過早進入下一個有依賴的操作：改以網頁網路閒置及 UI 同步完成後才執行下一步，避免拿 DB 已更新當成 UI 已可操作。

## 驗收與部署證據

- **正式 Auth／權限／通知／班次 E2E SUCCESS**：https://github.com/hub-google/LINE/actions/runs/42022206613
- **公開 Demo 瀏覽器 19 項 SUCCESS（含出勤異常掃描）**：https://github.com/hub-google/LINE/actions/runs/42024650547
- **Workforce Pages 部署 SUCCESS**：https://github.com/hub-google/LINE/actions/runs/42024650411
- 正式 E2E 程式：`workforce-management/tests/workforce-auth-roles-e2e.mjs`
- 公開 Demo 瀏覽器程式：`workforce-management/tests/workforce-browser-e2e.mjs`、`workforce-management/tests/workforce-mobile-visual.mjs`、`workforce-management/tests/workforce-browser-feature-e2e.mjs`
- 實際可操作網站：https://hub-google.github.io/LINE/workforce/

## 驗收範圍限制

本報告表示**上述功能與測試案例**均已經過真正瀏覽器／真實 Supabase 往返驗收，**不等於**已完成所有法定工時計算、薪資結算、各種排班政策、外部 LINE OA 訊息實際送達或全站安全稽核。出勤異常的**掃描**已通過真實按鈕操作；本次沒有把「異常結案」另列為已通過的正式 Auth E2E 案例。
