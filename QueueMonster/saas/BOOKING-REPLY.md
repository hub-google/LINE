# 排隊怪獸 LINE OA：預約、取號、訂餐確認（Reply-first）

## 店家 LINE OA 模式
- 店家**已綁自己的 OA**：顧客訊息發至該店家 OA，使用商家自己的 Messaging API Webhook 和免費 Reply API 回覆。店家不必自行建立 LIFF ID。
- 店家**未綁自己的 OA**：顧客訊息發至**排隊怪獸官方 OA**，使用平台既有 Webhook 和免費 Reply API 回覆。平台共用 LINE LIFF，不必每店設 LIFF。
- 兩種模式的前提是「**先有顧客主動訊息**」。Webhook 不是主動推播，Reply Token 不能留待未來使用。**Push、multicast、broadcast、narrowcast 仍會計入官方帳號訊息額度。** 因此沒有恢復平台 OA 的計費 Push；不能稱即時自由推播不計費。

## 客戶入口與三種事件
1. 店家後台「設定 → 通知與公開」的 **預約／取號／點餐 QR Code**（店家無自有 OA 時）開啟平台 OA，並分別預填：
   - `開始預約 {slug}`
   - `開始取號 {slug}`
   - `開始點餐 {slug}`
2. 客戶按一次傳送。平台 Webhook 用 Channel Secret 驗簽並以免費 Reply API 回覆平台共用 LIFF 入口，保留店家及服務類別，附 `entry=platform-oa`。
3. 客戶完成有效預約、取號或訂餐後，前端先用**當前 Supabase 已登入身分**向 `line-bridge` 的 `event-reply-command` 請領最多 10 分鐘有效、以 HMAC 連結店家／顧客／單筆 ID／類別的確認碼。
4. 如果在 LINE OA 1:1 聊天室開 LIFF 且已取得 `chat_message.write`，`liff.sendMessages` 嘗試**由顧客帳號**傳送：
   - `確認預約 {UUID} {proof}`
   - `確認取號 {UUID} {proof}`
   - `確認訂餐 {UUID} {proof}`
5. LINE 官方帳號 Webhook 確認來源事件簽章、驗證十分快速失效的憑證、資料歸屬／門市與狀態，僅用該 OA 的 **Reply API** 送出預約 Flex 卡、即時號碼進度卡、訂餐確認卡。
6. 若從外部瀏覽器、沒有 `chat_message.write`、LIFF 不在 OA 聊天室、或網路發訊失敗，**業務記錄不重建也不撤銷**。客戶可到單筆預約、取號進度、訂餐紀錄點「透過 LINE 取得確認」，直接開啟正確 OA 聊天室，帶入新簽章確認訊息，由顧客**自己按傳送**取得免費回覆卡。

## 安全與成本
- 平台 OA 不得回覆已綁自有 OA 的門市私有紀錄；店家 OA 亦不可讀取其他門市紀錄。
- 只有在登入者確實擁有該筆紀錄時，後端才核發簽章；UUID 單獨不能授權取得他人訂單或電話。
- 共用 LIFF 的使用者 LINE Login Provider 與店家 OA Provider 不同時，允許經過 HMAC 短效確認；**不代表跨 Provider 永久綁定身分**。
- LINE SDK 的 `sendMessages()` 只能傳送至**開啟 LIFF 的聊天室**，不能由網頁隨意選擇收件 OA。因此需要正確 OA 入口與必要授權；不能保證從外部網頁也能無感發訊。
- 叫號「輪到你」、取餐「已完成」及定時預約提醒是**操作完成以後的未來事件**，沒有新的顧客訊息就沒有可使用的 Reply Token；若要在那個時間主動通知，必須採計費的 Push 或改由顧客主動查詢。
- 本方案不主動增加平台的計費推播。

## 驗收
1. 選一間未綁店家 OA 的門市，掃預約／取號／訂餐三個 QR，確認都進**排隊怪獸 OA**，且回覆連結指向正確店家、正確服務。
2. LINE 內開共用 LIFF，各做一次有效預約、取號、訂餐；LINE 已授權 `chat_message.write` 時，應看到**客戶發出的確認訊息**及免費 Reply Flex 卡。
3. 無授權、使用 Chrome/Safari 或非對應 LINE 聊天室進入，業務流程仍成功，按單筆紀錄「透過 LINE 取得確認」可打開對應 OA 的預填訊息。
4. 用錯誤店家、錯誤顧客、錯誤類型、遭竄改和過期簽章驗證拒絕回覆資料。
5. 有綁自有 OA 的門市仍走自己的 OA，不經平台 OA 代發。
6. 確認 GitHub CI 通過和 Supabase Edge Function 啟用後，再以真實 LINE 手機與 LINE Developers 設定實測。
