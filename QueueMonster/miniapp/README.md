# Queue Monster LINE MINI App（隔離開發）
 
原有網站、程式碼、LINE Login Channel、Cloudflare Pages 及正式環境維持不變。MINI App 複用 QueueMonster 的靜態前端業務邏輯並建置**另一份輸出**，共用既有 Supabase 業務資料庫，但透過 `qm-mini-session` 獨立驗證新 MINI App Channel。
 
| Environment | Channel ID | LIFF ID | Endpoint URL |
| --- | --- | --- | --- |
| Developing | `2012649101` | `2012649101-EFX2gymX` | https://hub-google.github.io/LINE/queue-mini/developing/ |
| Review | `2012649102` | `2012649102-rNb39YpL` | https://hub-google.github.io/LINE/queue-mini/review/ |
| Published | `2012649103` | `2012649103-s6KPdX4H` | https://hub-google.github.io/LINE/queue-mini/published/ |
 
LINE Developers Console 的 Web app settings 中設定各環境 Endpoint URL。**首先只改 Developing**；待真實 LINE 裝置完成驗收後，才處理 Review 與 Published。LINE Developers 的 Admin 或 Tester 才能開啟 Developing。基本 scope 應包含 `openid` 與 `profile`。
 
## 分離原則
 
- 原前端 `QueueMonster/saas/**` 不變；建置時複製到臨時資料夾，僅在臨時副本修改 MINI 特有的登入、LIFF 與導覽。
- 新 workflow `queue-monster-mini-pages.yml` 只寫入 `gh-pages/queue-mini/**`，不修改 `booking/**`、`saas/**`、`queue-prod/**`。
- 原 `line-bridge`、既有 LINE OA 通知方式、Cloudflare 的 `queue.monsterport.com` 不改；MINI 身分驗證只走新增的 `qm-mini-session`，且會驗證 LINE access/ID token 對應的 Channel ID。
- 新增 `qm_mini_line_identities` 保存 MINI 獨立綁定，原 `qm_platform_line_identities` 與 `qm_line_links` 不修改。使用 `so_mini_header_identity`、`so_mini_platform_records_page` 實現 MINI 專用驗證及跨入口歷史摘要。
- 原預約、取號、菜單與訂餐資料都留在相同的 `qm_*` 資料表。未經 LINE 身分驗證時不可存取個人紀錄。
 
## 驗證
 
自動檢查僅涵蓋靜態建置、每環境 LIFF ID、資料庫介面名稱、GitHub Pages 路徑隔離與 JavaScript 語法。這**不等於** LINE 內真實登入驗收。需要實機在 LINE App 開啟 Developing，分別測試：
 
1. 初次與回訪 LINE 授權；同個 LINE User ID 是否對應正確紀錄
2. 搜尋店家、切換門市、各種預約與取消
3. 取號、到號進度、返回時與切換服務單位時的狀態
4. 點餐、訂單接單、取消與跨店歷史紀錄
5. 店家 OA 未綁定時不得冒用平台 OA 推播；驗收後才考慮 MINI service messages
 
注意：若不同網域原本存在兩個不同的 Supabase 匿名帳號，MINI 的歷史摘要可依已驗證 LINE sub 查詢相關舊紀錄，但**修改與取消舊帳號名下的紀錄仍須做跨帳號授權驗收**，不能只因為能看到列表就視為可完整管理。
 
## 開發與更新
 
- 當 `main` 的 `QueueMonster/saas/**` 或 `QueueMonster/miniapp/**` 更新，專屬 workflow 會重新建置三環境，但**只自動部署 Developing**。Review／Published 既有快照保持不變。
- 確認 Developing 功能並完成 LINE App 實機驗收後，在 `queue-monster-mini-promote.yml` 手動選擇 `review` 並輸入 `REVIEW`；審查與公開確認後才手動選擇 `published` 並輸入 `PUBLISH`。此流程不會發布原本的 Cloudflare 網站。
- 每次部署前，會執行 Chromium 頁面驗證、MINI 的 LINE 頻道識別配置檢查以及正式 Edge Function 的公開唯讀／拒絕未授權請求測試。
- `main` 的原網站建置規則、`release` 的正式發布工作流程與 Cloudflare 現有網域不變。
- 本版 Edge Function 已以 `qm-mini-session` 部署到既有 Supabase 專案；資料庫新增物件需同樣保持獨立。
