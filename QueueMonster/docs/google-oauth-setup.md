# 排隊怪獸｜Google 帳號登入正式啟用說明

目前店家／員工註冊登入頁已經提供第一順位「使用 Google 帳號繼續」，使用 Supabase Auth Google OAuth；Email 為第二順位，先驗證信箱再設定密碼。**Google OAuth 的後端 Provider 仍須由專案擁有者在 Google Cloud 與 Supabase 控制台設定，未啟用前前端會顯示清楚提示。**

## 1. Google Cloud 建立 OAuth 憑證
1. 前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) ，選擇擁有權明確、將長期維護的 Google Cloud 專案。
2. 設定 Google Auth Platform 的 Branding／Audience，應用程式名稱設定為「排隊怪獸」，填入適用的網站首頁、隱私權政策、服務條款。公開對外使用時，Audience 必須允許正式使用者，不可長期停留在僅限測試使用者的狀態。
3. 建立 **OAuth client ID**，應用程式類型選「Web application」。
4. **Authorized redirect URI** 填寫：

   `https://unapiwajmgqqtdkixaab.supabase.co/auth/v1/callback`

5. 如 Google 控制台要求 **Authorized JavaScript origins**，填入：

   `https://hub-google.github.io`

6. 僅要求登入所需的基本個人資訊，避免額外資料存取權限。

## 2. Supabase 啟用 Google Provider
1. 開啟 [此 Supabase 專案的 Auth Providers](https://supabase.com/dashboard/project/unapiwajmgqqtdkixaab/auth/providers)。
2. 選擇 **Google**、啟用，貼入剛建立的 OAuth Client ID、Client Secret，儲存。
3. 到 [URL Configuration](https://supabase.com/dashboard/project/unapiwajmgqqtdkixaab/auth/url-configuration) 確認允許登入後回跳網址：

   `https://hub-google.github.io/LINE/booking/merchant-register.html**`

   若仍保留舊連結，也允許：

   `https://hub-google.github.io/LINE/saas/merchant-register.html**`

4. **Client Secret 只存在 Google Cloud 與 Supabase 控制台**，不要加入 GitHub 原始碼、靜態網頁或 public-config.js。

## 3. 實際驗收
- 未註冊的 Google 使用者：可選 Google 帳號並同意基本資料權限，返回店家頁直接建立登入身分，不需自行填寫 Email／密碼。
- 已有 Email 帳號、且 Email 已驗證：使用相同 Google Email 登入時，應確認 Supabase 自動連結身分，不額外生成重複店家；實際結果以 Supabase Auth 使用者 ID 和 membership 驗證。
- 已受邀員工：以相同 Google Email 登入，確認其既有邀請和權限正確保留；既有員工密碼啟用機制需另行驗證相容性。
- Email 註冊：只輸入 Email、收到排隊怪獸品牌驗證信、點連結、設定密碼、進入後台。
- 未啟用 Google Provider：點 Google 按鈕顯示中文提示，不跳到無法理解的 OAuth 錯誤頁。

## 安全提醒
Google 登入只獲得 Google 允許提供的基本身分資訊（例如已驗證的 Email、姓名），**不會自動取得或建立店家的地址、服務、場次等營運資料**。店家權限仍依 Supabase Auth 使用者 ID 與後端 membership/RLS 決定，不能單憑 Email 或可修改的 user_metadata 授權。
