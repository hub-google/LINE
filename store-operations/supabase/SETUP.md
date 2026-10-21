# Store Operations：GitHub Pages + 真實資料庫

## 驗收環境

- 靜態網站：https://hub-google.github.io/LINE/
- 主程式：store-operations/demo/index.html（live.html 是同版備用入口）
- PostgreSQL Schema：store-operations/supabase/schema.sql
- 公開設定（不是密碼）：store-operations/demo/db-config.js，在 gh-pages 分支則是根目錄 db-config.js
- 舊版 localStorage 假資料演示：https://hub-google.github.io/LINE/preview.html（僅供比較，不是正式持久化）

### 目前狀態與必要授權

程式碼、SQL 與 GitHub Pages 靜態前端均可先完成。**真正的跨裝置資料儲存，必須先有可連接的 Supabase Project，並部署 SQL**。
沒有 Supabase Project 時 live.html 會顯示「尚未連接」，**不會在本地假裝儲存成功**。

可以連接 ChatGPT 的 Supabase app，讓系統直接建立資料表與部署 schema；或由擁有 Supabase 帳號者自行照以下步驟。

## Supabase 免費專案開通

1. 於 https://supabase.com/dashboard 建立 Free Project。
2. 在 SQL Editor 執行本專案的 schema.sql（建立預約、取號與權限資料表，外加交易型 RPC）。
3. Dashboard > Authentication > Providers > Anonymous Sign-Ins：**啟用**，以便顧客無需註冊就能取號。
4. Dashboard > Project Settings > API Keys，取得「Project URL」與 **sb_publishable_ 公開金鑰**。
   絕對不要使用 sb_secret、service_role 或資料庫連線密碼。公開金鑰只有搭配 SQL 權限與 RLS 才安全。
5. 在 live.html 輸入公開 URL + publishable key 測試；這個設定只儲存在該瀏覽器。
6. 驗收沒問題後，把相同公開 URL + publishable key 寫入 gh-pages 根目錄的 db-config.js，所有裝置就會使用同一套資料庫，無需各自設定。

## 店員身份（不可讓匿名客戶叫號）

1. 在 Supabase Authentication > Users 建立一名電子郵件/密碼使用者，也可以由已有帳號者註冊；請確保 email 已確認。
2. 從 SQL Editor 執行以下命令（把信箱換成該店員的）：

   insert into public.so_demo_staff(user_id)
   select id from auth.users where email='your-staff-email@example.com'
   on conflict do nothing;

3. 開 live.html 點「店員登入」，使用該帳號密碼，後台才可叫號、完成服務、過號回歸及預約報到。
4. 真正的使用者登入密碼只送 Supabase Auth；GitHub Repo 不保存密碼。

## 验收流程

- 顧客頁預約一個時段，切至店員帳號應顯示預約；累計超過 3 位容量時資料庫拒絕。
- 顧客 A、顧客 B 在不同瀏覽器各自取號：會獲得不同號碼，資料都存於 PostgreSQL。
- 店員按叫下一位、重叫、開始服務、完成、過號。多個裝置的候位清單會定時讀取最新資料。
- 當天預約由店員點報到，自動產生號碼牌並合流。
- 重新整理與關掉分頁，資料仍存在；注意「匿名身份」在不同裝置是不同 user ID，所以別的手機不能自動查看某個顧客的**私人預約**。正式串接 LINE LIFF 後，改用固定 LINE 身份識別跨裝置取回本人資料。
- 測試時請勿使用真實顧客個資。

## 安全與環境差異

- 本方案已開啟 RLS，並撤銷 anon/authenticated 對三張資料表的直接讀寫權限。
- 資料庫 RPC 使用 auth.uid() 驗證使用者；店員操作必須通過 so_demo_staff 授權。
- 預約容量利用交易型 advisory lock + sum party_size 防超賣。
- 取號使用 PostgreSQL identity 序號與唯一活躍票券索引防重複；操作由交易完成。
- 前端定時讀取（5 秒間隔），並非真正即時通知，LINE 叫號推播屬於後續 LIFF 階段。
- 目前為一間示範門市，非多租戶正式營運系統，不含正式個資防護、稽核、負載驗證及災難備援。
- Supabase Free plan 可能因長期低活動被暫停；正式營運需再評估。
