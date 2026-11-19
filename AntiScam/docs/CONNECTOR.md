# OpenChat Connector Protocol v1（待實機驗證）

**目前沒有可在官方 LINE Messaging API 上直接用來刪除 OpenChat 他人訊息／踢人的端點。** 本 Repo 不提供繞過驗證、擷取 LINE Session 或模擬私有協定的程式。Connector 是用於將來有合法授權的社群管理整合；完成前僅能示範與人工審核。

## 組件間信任

- AntiScam API（本專案）：管理員登入、檢測、處置決策、稽核、資料庫。
- OpenChat Connector（待提供）：需自行具備對指定社群的讀訊、管理他人訊息、踢人、禁再入等**實際且合法**權限。不可把一般 LINE OA webhook 當成 OpenChat 事件。
- Connector 對 API 發送事件：`POST /webhooks/openchat`。**不會用 LINE 的 x-line-signature**；須使用兩端自訂的 `WEBHOOK_SECRET`。
- API 對 Connector 發送動作：`GET /v1/capabilities`、`POST /v1/actions`，由 `OPENCHAT_BRIDGE_TOKEN` Bearer Token 保護，僅 HTTPS。

## 1. Connector → AntiScam：事件

簽章方法（Node 範例）：

```js
const timestamp = Math.floor(Date.now() / 1000);
const signature = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
  .update(`${timestamp}.${rawJson}`).digest('hex');
// Headers: X-AntiScam-Timestamp, X-AntiScam-Signature
```

**必須以傳送的原始 JSON 字串計算**，時間超過 5 分鐘拒收。`eventId` 需在來源事件重送時維持不變。

```json
{
  "type": "message.created",
  "eventId": "event-001",
  "communityId": "test-community",
  "memberId": "connector-opaque-member-id",
  "memberRole": "member",
  "messageId": "connector-opaque-message-id",
  "text": "限時優惠..."
}
```

入群事件：相同欄位但 `type: "member.joined"`，不須 `messageId`、`text`。`memberRole` 必須取自經驗證的社群權限，不可讓訊息發送者自行指定。

## 2. AntiScam → Connector：能力驗證

`GET /v1/capabilities`，header: `Authorization: Bearer ${OPENCHAT_BRIDGE_TOKEN}`。

```json
{
  "platform": "line-openchat",
  "verified": true,
  "verifiedAt": "2026-11-19T08:00:00Z",
  "capabilities": {
    "readMessage": true, "readJoin": true,
    "deleteOtherMessage": true, "removeMember": true,
    "blockMember": true, "sendNotice": true
  }
}
```

每次操作都重新檢查能力，不能僅憑設定頁面標記聲稱已授權。若連線失敗、`verified` 不為 true 或未知能力則降級。

## 3. AntiScam → Connector：動作

`POST /v1/actions`，header: `Authorization: Bearer ${TOKEN}` 與 `Idempotency-Key: <event-id>:<action>`。

```json
{
  "type": "delete_message",
  "communityId": "test-community",
  "messageId": "connector-opaque-message-id",
  "memberId": "connector-opaque-member-id",
  "actionKey": "uuid:delete_message"
}
```

`type` 可為 `delete_message`、`remove_member`、`block_member`、`send_notice`。`send_notice` 加上 `notice` 文字。回傳：

```json
{ "ok": true, "confirmed": true, "confirmationId": "verified-platform-operation-xyz" }
```

**注意：HTTP 200 不代表操作成功**。必須確認 connector 回傳 `ok=true`、`confirmed=true` 與非空的 `confirmationId`；模擬成功、HTTP 失敗或未確認都不能被顯示成 LINE 已刪文或已踢人。

## 4. 安全與測試要求

1. 僅允許指定且已授權的社群，未知社群的 webhook 直接拒絕。
2. Connector 以專用測試身分，事先在測試 OpenChat 取得並驗證適當權限。
3. 先設 `DRY_RUN=true`、每群 `mode=monitor`。**兩個開關都通過才可能開始真實處置**。
4. 改 `DRY_RUN=false` 前先驗證所有能力、刪文是否為全群移除、踢出／禁入結果及權限撤銷。
5. Connector 必須自身實作動作冪等、頻率限制、斷線復原及認證；目前不在本 Repo。
6. 不儲存明文帳號 ID，資料庫僅存 HMAC 會員識別碼、AES-256-GCM 加密的操作用 ID；嚴禁紀錄機密憑證。
