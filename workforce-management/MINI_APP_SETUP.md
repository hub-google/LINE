# 工作怪獸（WF）｜LINE MINI App 上線與驗收（2026-11-17）

## 接入狀態與架構

- 已接入三個 LINE MINI App 內部 Channel 的**公開** Channel ID／LIFF ID。無須把這些公開 ID 再放到 Supabase Secrets。
- 同一個 GitHub Pages WF 前端、Supabase Auth、`wm_` 租戶 RLS/RPC、同一套員工與排班資料；LINE 不取代企業帳號及企業角色權限。
- `wm-line` Edge Function 依 `channel_env` 選擇指定 Channel ID，向 LINE 的 `/oauth2/v2.1/verify` 驗證 ID Token，核對 `aud`、`sub`、過期日以及在職員工身分。未知環境拒絕，不回退其他 Channel。
- 原有一般網頁與 LIFF 通道保留；新的 LINE MINI App 以 `?mini=1` 進入。
- 尚未完成：LINE Console 端 Pointing Endpoints／Scopes、LINE iOS/Android 實機驗收。**不保證認證或免費 LINE 服務訊息已啟用。**

## LINE Console：三個 Endpoint 的對照（不同環境必須使用各自的 LIFF ID）

| 環境 | LINE 開啟網址 | Endpoint URL |
| --- | --- | --- |
| Developing | https://miniapp.line.me/2012649404-nz3TBQdG | https://hub-google.github.io/LINE/workforce/?mini=1 |
| Review | https://miniapp.line.me/2012649405-ADWLM7h9 | https://hub-google.github.io/LINE/workforce/?mini=1&line_env=review |
| Published | https://miniapp.line.me/2012649406-KzlLEZT6 | https://hub-google.github.io/LINE/workforce/?mini=1&line_env=published |

進入 [LINE Developers](https://developers.line.biz/console/) → 工作怪獸（LINE MINI App）→ Web app settings；對應設定各 Endpoint。MINI App Size 設 Full；在 Scopes 選取 **openid**（取得 ID Token 必要）。`profile` 可留著、`chat_message.write` 不需要。`Add friend` 可繼續 Off，不影響員工身份綁定。核對 Basic settings 的**Provider** 與 WF 原 LINE Login 和 OA Channel 所在 Provider；若不同，`line_sub` 可能不同，平台 OA 推播未必可達，程式不會默默覆蓋既有員工綁定。

官方說明：Review 只供 LINE 審核人員使用；Developing 需為有授權的 Admin/Tester；Published 才供一般使用者。未認證 Published 可發布但少部分進階能力不可用。[LINE MINI App Console Guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)。

## 實機驗收路徑

1. 將自己的 LINE 帳號加入 MINI App 的 Admin/Tester；完成上方 Developing Endpoint 與 Scopes 後，在手機 LINE 內開啟：https://miniapp.line.me/2012649404-nz3TBQdG
2. 確認顯示「工作怪獸」WF 畫面；若看到官方預設頁，回 LINE Console 檢查 Endpoint 是否儲存。
3. 在 WF 使用原本**正式企業帳號**登入；需是已被授權、在職的企業員工。公開 Demo 不能綁定真實 LINE 身分。
4. 打開「LINE 通知」→「以 LINE 驗證並綁定」。後端驗證該 Developing ID Token 與企業在職員工；成功顯示已綁定，不能跨企業取得未授權資料。
5. 測試上下班打卡、GPS 許可與拒絕（前端需授權，沒有定位權限不可假裝 GPS 精準）、排班、請假、加班、補卡、員工通知及主管簽核；iPhone／Android 兩者都要測。
6. 確定 Developing 沒問題後，再交付 LINE 審核 Review；Published 依 LINE Console 的發布／認證要求對外開放。Published 必須使用上述 Published Endpoint，否則會有 LIFF ID 與 Channel audience 不符的問題。

## 限制與未啟用項目

- MINI App 是網頁技術，GPS 仍需授權；實機精度、防定位造假、異常打卡不能靠 Channel 建立自動保證。
- `wm-line` 既有的通知是平台 LINE OA Messaging API，不是 MINI App Service Message API。申請 Verified MINI App 與服務訊息樣板、通知 Token 流程是另一項工作；台灣認證申請通常要求 certified provider 資格。不得聲稱可以直接無限免費通知。
- 不收集 Channel Secret，也不需把公開 Channel ID 設為 Supabase Secret；原先 `LINE_LOGIN_CHANNEL_ID`、`LINE_LIFF_ID` 與 `LINE_MESSAGING_ACCESS_TOKEN` 不更動。
- 如果已綁定的 LINE userId 與新 MINI App LINE userId 不同，後端拒絕覆蓋，必須先釐清 Provider/帳號，再由原員工本人依權限解除綁定。
- 不可拿 LINE profile 的可修改資訊、手機 GPS 前端回報值直接當作企業員工授權憑證。

## 自動化檢查

```bash
node --check workforce-management/app.js
node --test workforce-management/tests/workforce-mini-app.test.mjs
node --test workforce-management/tests/workforce-prd.test.mjs
node --test workforce-management/tests/workforce-button-clicks.test.mjs
```
