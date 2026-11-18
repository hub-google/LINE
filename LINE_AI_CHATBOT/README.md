# LINE AI Chatbot — Gemma 4

獨立於排隊怪獸、Workforce 及既有 LINE webhook。

- Supabase project: `unapiwajmgqqtdkixaab`（重用免費專案，不新增收費專案）
- Edge Function: `line-ai-chatbot`，`verify_jwt=false`，但必須通過 LINE HMAC-SHA256 簽章驗證才能處理事件
- Webhook: `https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-ai-chatbot`
- AI: `gemma-4-26b-a4b-it`，僅呼叫 Gemini API 的免費 Gemma 模型，不啟用付費備援
- Database: `public.line_ai_messages`、`public.line_ai_events`，均開啟 RLS 並撤銷一般用戶直接讀寫權限
- Credentials: encrypted Supabase Vault secrets `line_ai_gemini_api_key`、`line_ai_line_channel_secret`、`line_ai_line_access_token`
- Pending: 三項憑證未提供；Webhook 尚未設為 LINE Channel Endpoint；尚未完成 LINE → Gemini → LINE 實測

## GitHub 專業知識庫

在 `knowledge/index.json` 的 `entries` 陣列新增：

```json
{
  "entries": [
    {"keywords": ["專業術語", "重要關鍵字"], "path": "topic.md"}
  ]
}
```

同資料夾新增 `topic.md`，訊息包含其中關鍵字時，Edge Function 會抓取該 Markdown 作為回答參考（單次最多兩篇）；若未匹配就直接閒聊。官方系統回覆以繁體中文為主。

## 安全與額度

不在任何 GitHub 代碼或前端保存 API Key / Access Token / Channel Secret；後端透過僅授權 `service_role` 呼叫的 `line_ai_runtime_secrets()` 讀取 Vault。
對 LINE 使用原始請求本體驗證 `x-line-signature`；事件去重、使用者訊息節流、單人日限額和全域限額。AI 429 只回覆免費額度不足，不轉付費。

## 維護

此資料夾只在 `main` 維護。別把此 Chatbot 的 webhook 改到排隊怪獸 `line-bridge`。
