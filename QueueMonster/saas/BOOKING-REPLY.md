# 店家自有 LINE OA：預約完成自動送訊＋免費 Reply API

## 生效條件
- 店家已在排隊怪獸驗證綁定自己的 LINE OA Messaging API（Access Token 與 Channel Secret）。
- 同一 LINE Provider 下建有店家 LINE Login Channel、LIFF App，並在店家設定填入 LIFF ID；LIFF 必須有 `chat_message.write` scope，顧客需同意權限。
- 店家 Messaging API 已把 Webhook URL 設為 `https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook&merchant={slug}`，並啟用 Use webhook。
- **客戶由店家的 OA 1:1 聊天室內的 LIFF 連結打開預約頁**；直接掃描 LIFF 網址、外部瀏覽器、群組聊天室、最近使用服務中的 LIFF 不保證可執行 `liff.sendMessages`。

## QR 與預約流程
1. 店家「設定 → 通知與公開 → 預約網址」的 **顯示 QR Code** 在本店已綁 OA 且可辨識官方帳號 ID 時，改為指向店家 LINE OA 聊天室的預填「開始預約 {slug}」。原本直接開啟的預約網址與複製功能維持不變。
2. 客戶在 LINE 聊天室**手動送出預填訊息**，店家經驗證的 Webhook 以免費 Reply API 回覆 LIFF 預約連結；此時點選連結的 LIFF 才具有當前 1:1 聊天室上下文。
3. 成功建立一般預約或多場次預約後，前端檢查是否為店家自有 OA、已設定店家 LIFF、`liff.isInClient()` 和 `liff.getContext().type === "utou"`，執行一次 `liff.sendMessages([{type:"text",text:"確認預約 <UUID>"}])`。
4. 店家專屬 Webhook 會以店家 Channel Secret 驗簽，並驗證客戶 LINE 身分、門市與有效預約後，**只使用店家 Channel Access Token 的 Reply API** 回覆既有 Flex 預約卡。
5. SDK 失敗不會回滾或重複建立預約。顧客可回店家 OA 聊天室手動送出「確認預約 <UUID>」，或從預約紀錄按「取得 LINE 預約資訊」重試；此功能未啟用時不會冒用平台 OA。

## 限制與計費
- 只綁店家 Messaging API、未設定店家 LIFF，**不能自動從顧客 LINE 帳號發訊息**；使用店家 OA 的 Webhook 接收顧客手動輸入後仍可 Reply。
- 在不同 LINE Provider 下的 LINE Login User ID 與 OA User ID 不一定相同。後端必須使用店家 LIFF 所屬的 **LINE Login Channel ID** 驗證 ID Token，不能用 Messaging Channel ID 當作 Login Channel ID。
- Reply Token 僅能回覆當次顧客訊息，不能留待未來叫號/提醒；背景通知若需主動送達仍屬店家 OA 自行推播的計費範圍。
- 未綁定自有 OA 店家：排隊怪獸平台 OA **不會**替店家代發新預約訊息；其餘店家事件不透過平台 OA 推播。

## 驗收
1. 用實際 LINE 手機掃描店家「預約」QR，確認進入正確店家 OA；送出「開始預約」後，點 LIFF 連結。
2. 確認一次新預約，驗證顧客聊天室出現「確認預約 UUID」及店家 Flex 預約卡；同一操作不得重複產生預約。
3. 重做多場次預約，確認走相同 Reply 流程。
4. Safari/Chrome 外部網址、無自有 LIFF、未綁店家 OA、群組聊天室以及拒絕 chat_message.write，確認不會誤發到其他 OA，預約仍成功且提供手動取得資訊途徑。
5. 核對店家 OA Webhook 回應、LIFF 權限及訊息用量；GitHub CI 靜態與模擬測試不能取代真實 LINE 手機驗收。
