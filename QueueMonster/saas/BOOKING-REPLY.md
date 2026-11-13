# 店家自有 LINE OA：不要求店家 LIFF ID 的預約確認

## 實際可行的技術路徑（2026-11-13）
- 店家僅需連接自己的 LINE Messaging API（Channel Access Token、Channel Secret）並在 LINE Developers 設定 `https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook&merchant={slug}`、開啟 Use webhook。**店家不用另外提供 LIFF ID**。
- 顧客的 LINE 身分仍使用**排隊怪獸平台現有的共用 LIFF**。此 LIFF 必須擁有 `chat_message.write` 授權，且顧客必須從店家的 OA 單人聊天室打開 LIFF，才可能用 `liff.sendMessages()` 自動發送訊息。如果此條件不符，就不能代客戶無感發 LINE；改開店家聊天輸入框，由客戶按「傳送」。
- 這不是「完全沒有 LIFF」的自動發訊；是「**店家沒有自己的 LIFF**」而使用排隊怪獸既有的 LIFF。LINE 官方 API 不允許一般網頁或純 Messaging API 無授權代客戶發訊。

## 顧客流程
1. 已綁店家 OA 的店家在「設定 → 通知與公開 → 預約網址」點 **顯示 QR Code**：QR 進入本店 OA 聊天室，預填 `開始預約 {slug}`（顧客須按送出）。
2. 店家 Webhook 使用店家的 Channel Secret 驗簽，再以店家 Access Token + 免費 Reply API 回覆排隊怪獸 LIFF 預約網址（包含 `entry=merchant-oa`）。
3. LIFF 預約寫入成功後，前端使用目前登入中的 Supabase token 向 `line-bridge` 請領 **10 分鐘內有效、綁定租戶/預約/顧客的 HMAC 確認碼**。
4. 若 `liff.isInClient()`、`liff.getContext().type === "utou"` 且來源為店家聊天入口，前端呼叫 `liff.sendMessages([{type:"text",text:"確認預約 {uuid} {proof}"}])`。LINE 將訊息送到開啟 LIFF 的聊天室，不是向 Token 指定的任意 OA。
5. 店家 Webhook 再以店家 Channel Secret 驗簽，檢查確認碼、租戶及有效預約，以本店 Reply Token 免費回覆既有預約 Flex 卡。
6. 若 LINE 環境不許自動發，**已成立的預約不重建、不取消**。顧客在單筆預約詳情點「透過店家 LINE 取得確認」，系統產生同樣短效確認碼，開啟 `line.me/R/oaMessage/{店家 OA ID}/?{確認訊息}`，由顧客按傳送後取得 Reply 卡。

## 安全與成本
- 只有已綁定店家 OA 的門市才啟用確認流程；平台 OA **不代發**任何店家訊息。
- 確認碼由後端在登入者確實擁有且仍有效的預約上核發，不接受客戶自己指定 LINE userId；確認碼不能跨店使用，超過 10 分鐘失效。
- 平台共用 LINE Login 的 userId 可能跟店家 OA 不一致；經過短效簽章驗證仍能安全取得這**一次**預約確認卡，但不表示永久完成跨 Provider 身分綁定。
- Reply Token 只能用於當次客戶事件，不會替後續叫號或預約提醒自動建立免費推播。推播成本仍依店家 OA 方案規定。

## 實機驗收（由真實 LINE 帳號操作）
1. 確認店家的 Messaging API 綁定、Webhook URL、Webhook 啟用。**店家 LIFF ID 保持空白**。
2. 掃店家預約 QR → 在店家聊天室送出預填「開始預約」→ 點回覆的共用 LIFF 入口。
3. 預約成功後確認「確認預約 UUID 短效碼」由顧客帳號發到店家 OA、並收到 Flex 卡。
4. 關閉或拒絕 `chat_message.write`、用外部瀏覽器直接開網址：預約應成功且不誤發，單筆詳情按「透過店家 LINE 取得確認」，到店家聊天室**手動按送出**後仍可收到 Reply 卡。
5. 驗證跨店、非本人、遭修改及過期確認碼不可取得預約資料；並核對店家 OA 的免費 Reply 用量。

> GitHub CI 與模擬 Webhook 只能證明邏輯，實際發 LINE 仍需手機與真實 LINE Developers 權限。
