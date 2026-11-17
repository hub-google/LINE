# 工作怪獸 LINE OA：獨立 Secrets、圖文選單、歷史版本稽核

> 此文件沒有任何可用的 LINE Access Token、Channel Secret 或 GitHub Token。

## 服務隔離

- **工作怪獸 Messaging API Channel ID**：`2012650797`（此為公開識別碼）。
- **工作怪獸 MINI App**：Developing `2012649404-nz3TBQdG`、Published `2012649406-KzlLEZT6`（均為公開 LIFF ID；不是保密的 Access Token）。
- **QueueMonster OA**：既有 `LINE_MESSAGING_*` Secrets 與 `line-rich-menu.yml` 完全不動。
- **工作怪獸 OA**：只能使用下面命名為 `WF_*` 的新 Secrets；不與任何其他產品共用。
- **原本 WF 網站** `/LINE/workforce/` 不變，獨立的 MINI App 為 `/LINE/workforce-mini/`。

## 需要用 GitHub 網頁安全地新增（不能提交到程式碼）

進入 [hub-google/LINE Settings → Secrets and variables → Actions](https://github.com/hub-google/LINE/settings/secrets/actions)，選 **Repository secrets → New repository secret**，分別建立：

| Repository Secret 名稱 | 應填內容 |
| --- | --- |
| `WF_LINE_MESSAGING_CHANNEL_ID` | 工作怪獸 Messaging API 的公開 Channel ID |
| `WF_LINE_MESSAGING_CHANNEL_SECRET` | 工作怪獸 Messaging API Channel Secret（不可提交） |
| `WF_LINE_MESSAGING_ACCESS_TOKEN` | 工作怪獸 Messaging API Channel access token（不可提交） |

*名稱須完全一致，區分大小寫。不要貼到 Commit、Issue、PR、workflow_dispatch 文字輸入、README、log、前端 JS，或 GitHub Actions Repository Variables。*

**MINI App 本身不需要新增任意「MINI App token」Secret**：LIFF ID／Channel ID 是公開標識，身分綁定必須由後端驗證 LINE ID Token。真正的 OAuth/LINE Channel Secret 若日後需要，須由 LINE 官方另行發出，且使用獨立的 `WF_MINI_...` Secret，**不能複製 Messaging API 的 Channel Secret 當成 MINI App Secret**。

## 發布工作怪獸 OA 六格圖文選單

1. 在上述三個 Secrets 設置完成後，進入 [WF 工作怪獸 LINE OA 圖文選單（Actions）](https://github.com/hub-google/LINE/actions/workflows/workforce-line-rich-menu.yml)。
2. 點 **Run workflow**，Branch 選 **main**。
3. `operation` 選 **publish**。
4. `mini_environment` 開發期間先選 **developing**（只有 LINE Console 已授權的管理員／測試者能開啟）；待 Published 正式對一般員工開放後，重跑並選 **published**。
5. 執行會先稽核 Git 全歷史，並從 GitHub Secrets 取得憑證；正式呼叫 LINE API 前會驗證 **Token 所屬 Channel ID 為工作怪獸**，否則自動拒絕。
6. 建立 2500×1686 PNG 六格圖文選單；使用 LINE Messaging API 依序建立 rich menu、上傳圖片、指定預設 rich menu，最後讀回確認。
7. 若此 OA 已存在一個名稱並非 `工作怪獸-` 開頭的預設圖文選單，流程**拒絕覆蓋**，避免破壞其他服務。
8. 進入工作怪獸 OA 聊天室，點底部圖文選單確認：上下班打卡、我的班表、差勤申請、通知紀錄、工作總覽、審核中心各自會進入獨立 MINI App 的對應分頁。

發送一般 OA 推播、Webhook 設置、OA Rich Menu 都是不同功能。**此部署只改圖文選單，不會開啟群發、不會改動 Webhook，也不會宣稱 MINI App 免費服務通知已開通。**

## Git Secrets 與歷史版本安全檢查

工作流程 `.github/workflows/workforce-line-rich-menu.yml` 執行 `.github/scripts/audit_workforce_git_secrets.py`：

- 使用 `actions/checkout@v4` 且 `fetch-depth: 0`，涵蓋本次 checkout 可達的 Git branches/tags 所有歷史 blobs，**包括刪除或改名後仍存在歷史中的檔案**。
- 比對兩個 LINE 機密的**實際 Secret 內容**（只有 Runner 記憶體內），不列印或保存值；即使在歷史檔案發現，也只回報檔名和 Secret 名稱。
- 同時偵測高可信度的純文字憑證指定語法，避免只查目前 HEAD。
- Git Secrets 尚未配置時，稽核只能做結構性檢查，會明確提示「exact check incomplete」，**不能宣稱過去所有版本都絕對沒有外洩**。
- Git 伺服器已回收的不可達物件、外部 Fork、別人的本地 Clone、Issue/PR 文字與 Actions Logs 不在 Git blob 稽核保證範圍。若發現任何曾公開的有效 Secret，需要在 LINE Developers 重發／撤銷，而不是單純刪掉程式碼。

**安全處理原則：**如果 Token 或 Channel Secret 曾出現在不安全的地方，應依 LINE 官方指引輪換／撤銷，再更新 GitHub Secrets。不要將完整憑證再次傳送到公開位置。
