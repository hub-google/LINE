# 預約確認免費回覆

新預約確認改由 LIFF 發出「確認預約 UUID」文字，再由已驗證簽章的 OA Webhook 以 Reply API 回覆既有預約卡片。客戶 LINE 身分、預約歸屬、門市與 OA 必須相符。

預約立牌可在取得正確 OA ID 後產生聊天室入口：掃碼 → 手動送出預填的「開始預約 門市代碼」→ 點回覆的 LIFF 連結 → 預約。這不是掃碼後完全自動開啟表單。

LIFF 需要 chat_message.write 授權及支援的聊天室環境。SDK 無法傳訊時保留預約，在「我的紀錄」按「取得 LINE 預約資訊」可重試；不符合環境時開啟 OA 預填確認文字，由客戶送出。

新預約 RESERVED 的即時 Push 與背景補送都停止使用 Push。其他叫號、修改、取消、恢復通知維持既有流程與計費方式。無資料庫結構變更。

本地測試包含 SDK 傳訊、外部瀏覽器與群組拒絕、SDK 失敗、歸屬與 OA 範圍查核、禁止 Push，以及 HMAC 簽章 Webhook → Reply 的模擬串接。未使用真實 LINE token 發訊，也未完成手機 LINE 實機驗收。

部署須同時發布前端及 line-bridge，並在 LINE Developers 確認 LIFF 的 chat_message.write、客戶授權、Webhook 啟用。部署後應以手機掃碼完成一次實際預約，確認聊天室文字與回覆卡片，並核對 OA 訊息用量。
