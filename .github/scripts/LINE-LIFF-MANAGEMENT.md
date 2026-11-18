# LINE LIFF 自動管理：可重複使用的既有流程

最後驗證：2026-11-18。這是所有 ChatGPT/自動化維護人員處理本帳號 LINE LIFF 需求時的第一優先檢查清單；不要先假設必須請使用者手動建立 LIFF。

## 已驗證可用的授權與操作

- 原始碼倉庫：`hub-google/LINE`，分支 `main`。
- 已存在加密 GitHub Actions Secrets：`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`。不可把值顯示在 log、commit 或網頁。
- 管理 Workflow：`.github/workflows/create-ctee-liff.yml`，手動 `workflow_dispatch`，可選 `ensure-ctee` 或 `rename-queue`。
- 管理程式：`.github/scripts/create-ctee-liff.py`（目前已實作上述兩項操作，增加新的 LIFF 時應抽象化整合，勿為每個專案重寫整組 HTTP 驗證程式）。
- 使用 LINE Login Channel ID + Channel Secret 呼叫 `POST https://api.line.me/v2/oauth/accessToken`，grant_type=`client_credentials` 取得暫時性 Channel Access Token。
- 用此 token 調用官方 `GET /liff/v1/apps`（列出），`POST /liff/v1/apps`（新建），`PUT /liff/v1/apps/{liffId}`（修改）。有需要時先讀官方文件 https://developers.line.biz/en/reference/liff-server/。
- 建立時以 Endpoint 查既有 LIFF，避免重複；更新時只傳需要改動的欄位（例如名稱為 `description`）；建立或修改後再次 GET 確認名稱、ID、Endpoint、scope，並確認其他 LIFF 沒有改變。
- 沒有直接操作 GitHub Actions workflow dispatch 的 ChatGPT 連接器時，可利用 GitHub repo 的 **一次性** workflow `push` path 觸發，成功後立刻撤銷 `push`，正式保留手動 `workflow_dispatch`。避免高頻排程或新增 Worker。
- 公開 LIFF ID 可放靜態 JS 配置，**絕不可**將 Channel Secret 或 Access Token 直接提交或放到公開頁面。

## 2026-11-18 已完成的結果

| 專案 | LIFF ID | Endpoint | 中文名稱 |
|---|---|---|---|
| 排隊怪獸（舊版真人驗證） | `2012346974-bmC3fZuf` | `https://hub-google.github.io/LINE/booking/` | 排隊怪獸_真人驗證 |
| 排隊怪獸（正式網站） | `2012346974-jSefrnfw` | `https://queue.monsterport.com/` | **排隊怪獸－官方網站** |
| 工商時報每日剪報 | `2012346974-oasuaJGG` | `https://hub-google.github.io/ctee-line-bot/` | 工商時報每日剪報 |

- 上述三個 LIFF 均在 Channel `2012346974`。正式網站英文名稱已透過官方 `PUT /liff/v1/apps/{id}` 更新且讀回確認，原本三組 ID、Endpoint 和 scopes 均未改動。
- 工商時報專屬 LIFF 已自動建立、通過 API 讀回驗證、加入 `hub-google/ctee-line-bot` 的 `viewer/public/liff-config.js`，並成功部署。
- 工商時報推播最新驗證：GitHub Actions Run `44265914217`（2026-11-18），確認已發布的 LIFF 設定、14 張剪報，LINE Push API HTTP 200。
- 工商時報「分享」是 `liff.shareTargetPicker([Flex])`，需 `chat_message.write`、LINE Login、在 LINE Developers 開啟 share target picker；使用者按 LINE 卡片的分享按鈕先開 `https://liff.line.me/2012346974-oasuaJGG?date=YYYY-MM-DD&share=1`。
- GitHub Actions 可驗證 LINE 服務端的 LIFF 建立、設定與推播，不等於手機 LINE 原生選人畫面及收件者收到訊息的端到端測試。實機測試仍需使用者在登入的 LINE 手機端操作。

## 以後處理 LINE 設定時的順序

1. 先讀本文件、對應 Repo 的 README、GitHub Actions workflow 和 GitHub Secrets 名稱，以及歷次 Actions 日誌；盤點已有 Channel ID、LIFF ID、Webhook/Push 設定。
2. 查 LINE 當前官方 API 是否支援所需動作；優先用既有 GitHub Secrets 在隔離的 Actions runner 執行，絕不先說「無法建立」或請使用者重新手工操作。
3. 僅修改指定專案，不能更改其他 LIFF 的 Endpoint、Token 或功能；每次動作必須 GET 讀回驗證。
4. 發版、跑語法驗證、測正式網址，若涉及推播則由具有原 Secret 的 Repo 發送且核對 HTTP 狀態。
5. 只有在現有授權/API 真的不支援時，才明確指出缺少的特定權限或必要人工操作；不得將「GitHub 連接器無法直接 dispatch」誤判為 LINE 平台無法自動設定。
