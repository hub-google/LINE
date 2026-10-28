# LINE 客服機器人 — 產品需求文件（PRD）

> 文件版本：v1.0  
> 建立日期：2026-10-28  
> 狀態：需求規劃／尚未開發與部署  
> 專案位置：hub-google/LINE/LINE客服機器人/  
> 預設語言：繁體中文（台灣）  
> 核心原則：Google 體系運行、開源模型自行推論、不用 Gemini API、低用量優先維持 NT$0

## 0. 決策摘要

本產品提供 LINE 官方帳號的全天候自動客服：使用者傳訊後，系統由 Google Cloud Run 接收 LINE Webhook，優先用可控的 FAQ／知識庫回答，遇到非制式問題才由 Cloud Run CPU 執行開源小型語言模型，回覆經 LINE Messaging API 傳回。

### 已定方向

1. **Google 執行環境**：LINE Webhook 與模型推論均部署在 Google Cloud；不使用 Cloudflare 作為執行環境。
2. **GitHub 的角色**：只負責原始碼、版本控制、自動測試與部署；GitHub Actions 不作為 24 小時模型主機。
3. **AI 模型**：優先實測 Qwen3 0.6B 的 GGUF 4-bit 量化版本，以 llama.cpp 在 Cloud Run CPU 推論；不呼叫 Gemini API、OpenAI API 或其他付費生成式 AI API。
4. **24 小時服務**：Webhook 採用對外可存取的 Cloud Run HTTPS 服務，最小實例 0（scale to zero）；「全天可請求」不等於模型全天常駐。
5. **10 秒目標**：95% 以上的有效文字訊息，在收到事件後 10 秒內獲得**首次有意義回覆**（包含明確的待處理／轉人工答覆）；不能承諾每一則都由 AI 在 10 秒內生成完整答案。
6. **免費優先**：以 Google Cloud 持續免費額度及 LINE 免費訊息條件為邊界，預設禁用任何需額外付費的模型或升級路徑；但 Google Cloud 需啟用計費，且**免費額度不是零帳單的絕對保證**。

### 不可混淆的三件事

| 需求 | 定義 | 本產品承諾層級 |
|---|---|---|
| 24 小時 | 服務入口可在任何時段接收 LINE Webhook | 設計目標；受平台可用性、網路、配額影響 |
| 10 秒 | 首次回覆盡量在 10 秒內送出 | 驗收目標，非每次模型推論保證 |
| 完全免費 | 不支付 AI API 費並盡量控制雲端帳單為 NT$0 | 低用量條件下的預算目標；上線前需核對各項服務用量 |

## 1. 背景與問題

目前沒有一個符合「開源模型、無 Gemini API、全 Google 雲端、24 小時接收、盡量 10 秒內回覆、低用量免費」的獨立 LINE 客服模組。GitHub Actions 不適合做持續在線的對外 AI 服務，故改由 Google Cloud Run 承接接入與推論。

本功能為 hub-google/LINE 專案中的**第四個獨立規劃模組**；與 group-cleanup、recurring-billing、store-operations 的程式、資料庫及 LINE Channel 憑證保持隔離，除非未來明確指定整合。

## 2. 產品目標與成功指標

| 指標 | MVP 驗收標準 | 說明 |
|---|---|---|
| 文字客服入口 | 可使用真實 LINE OA 帳號送收文字訊息 | Webhook URL 由 Cloud Run 提供 |
| 全天時段接收 | 連續 7 天跨時段驗證可接收（含離峰冷啟動） | 不宣稱 Google 平台 100% SLA |
| 首次回覆延遲 | 有效訊息 p95 ≤ 10 秒，依接收 Webhook 到送出 LINE Reply API 計算 | FAQ 與模型路徑分別統計；超時採備援 |
| FAQ 正確率 | 基準題庫 ≥ 95% | 不允許無依據的商品／價格／條款資訊 |
| 訊息去重 | 同一事件最多完成 1 次對客回覆 | 處理 LINE 重新投遞與競爭條件 |
| 外部 AI API 成本 | NT$0 | 禁用 Gemini 與其他計次收費模型 API |
| 月度 Google Cloud 成本 | 目標 NT$0；上線前需以實際帳單與用量驗證 | 不把預算通知視為硬性封頂 |
| 錯誤處理 | 模型故障、超時、配額逼近均有安全退場 | 不能無限重試與重複扣訊息額度 |

> 「10 秒」以 p95 作為產品目標，不得在未經真實壓測前對外宣稱保證秒回；免費平台不可保證 100% 可用性。

## 3. 使用者與典型情境

- **一般 LINE 客戶**：詢問服務時間、辦理流程、產品介紹、退款／預約／聯絡方式等常見問題。
- **需複雜回答的客戶**：以自然語句敘述問題，系統先查知識庫，再由模型整理有來源的回答。
- **需人工協助的客戶**：要求人工、涉及身分核驗或敏感案件，系統明確引導人工窗口。
- **管理者**：維護 FAQ、啟閉 AI、設定回覆門檻、查看去識別化的健康度與成本報告。

範例：
1. 客戶問「今天有營業嗎？」→ 以核准資料回答。
2. 客戶問「這項服務要準備什麼？」→ 查 FAQ 與流程，提供簡明步驟。
3. 客戶問「我的案件處理到哪裡？」→ 不臆測個人案件，說明正式查詢或人工方式。
4. 客戶連續問追問 → 保留有限上下文，不跨使用者混用資料。
5. 客戶傳圖、語音或貼圖 → MVP 說明目前支援文字並提供選項。

## 4. 範圍

### 4.1 MVP 必須做（P0）

| 編號 | 需求 | 詳細規則／完成標準 |
|---|---|---|
| FR-01 | LINE Webhook | 使用公開 HTTPS URL；原始 body 驗證 X-Line-Signature／HMAC-SHA256，驗證後才解析及處理 |
| FR-02 | 文字訊息 | 處理一對一文字訊息、空 events 驗證請求及 LINE 重送事件 |
| FR-03 | 事件去重 | 以 webhookEventId（或等效事件識別）做唯一鍵；重送不能重覆回覆 |
| FR-04 | FAQ | 關鍵字／正規化／相似度規則優先，匹配成功立即回覆經核准內容 |
| FR-05 | 開源模型 | 由 Cloud Run CPU 執行 GGUF 模型，不經任何 AI 推論 API |
| FR-06 | 知識庫約束 | 模型只依已核准知識或明確的通用資訊回答；缺資料時承認不知道 |
| FR-07 | 安全退場 | 逼近時限、模型載入失敗、服務無法使用時回覆「需要進一步確認」與人工入口 |
| FR-08 | 回覆狀態 | 每事件只有一次 LINE Reply；記錄 queued／processing／replied／fallback／failed |
| FR-09 | 人工處理 | 「人工客服」、「轉真人」等指令觸發人工處理標記及清楚的聯絡說明 |
| FR-10 | 對話上下文 | 保留最近有限輪數；可用「清除對話」重設 |
| FR-11 | 觀測 | 延遲、成功率、FAQ 命中率、模型失敗、冷啟動與成本使用量有可檢查的紀錄 |
| FR-12 | 隱私／憑證 | 密鑰不提交 GitHub；不在日誌記錄完整訊息、Token 或個資；資料可刪除 |
| FR-13 | 成本保護 | 限制最大容器實例、併發、回覆 token、每日推論預算與佇列重試 |
| FR-14 | 部署與測試 | 可由 GitHub CI 測試及部署到 Cloud Run；附測試、手動設定與回滾說明 |

### 4.2 後續功能（P1）

- FAQ 管理後台、人工客服工作台、審核流程、回覆品質標記。
- 多 LINE OA Channel、個別商家知識庫與多租戶隔離。
- 附件／圖片／語音辨識、Rich Menu 整合。
- 自動生成知識庫草稿，但需人工審核後發布。
- 流量預估、模型切換、A/B 測試、必要時自動降級。

### 4.3 不在 MVP 內

- 主動行銷群發、任意 Push 消息、非用戶同意之廣告。
- 支付、交易、理賠或訂單資料查詢（除非另行提供授權系統與身分驗證）。
- 將客戶資料用於模型再訓練。
- 常駐付費 GPU、24 小時固定實例，或將 GitHub Actions 當常駐 AI 主機。
- 保證任意輸入都由生成式模型在 10 秒內完成最終答案。

## 5. Google-only 技術架構

### 5.1 建議正式拓撲

    LINE 使用者
         |
         v
    Google Cloud Run / webhook-service （輕量公開 HTTPS）
      - 原始 body 簽章驗證
      - 去重及 FAQ 快速回覆
      - 非 FAQ 訊息進入處理流程
         |
         +---- FAQ 命中 ----> LINE Reply API
         |
         +---- 需模型推論 ----> Google Cloud Tasks（可控重試／非同步工作）
                                      |
                                      v
                            Google Cloud Run / inference-service
                              - Qwen3 0.6B GGUF + llama.cpp
                              - 根據知識庫生成答案
                              - 讀寫 Firestore 回覆狀態
                                      |
                                      v
                                 LINE Reply API

    Google Cloud Firestore
      - 訊息去重、有限上下文、處理狀態與 FAQ 版本

    GitHub
      - PRD、程式碼、測試、建置／部署流程（不常駐執行客服）

**為什麼有兩個 Cloud Run 服務？** 因為模型容器的冷啟動較慢；若與 Webhook 共用同一個容器，模型載入可能拖累 LINE 的入口回應。兩個服務仍全部在 Google Cloud，且可共用單一程式倉庫。

**MVP 簡化選項**：先以單一 Cloud Run 服務進行技術驗證；只要冷啟動或並發測試不符合 SLA，正式版就分成輕量 webhook-service 與模型 inference-service。不得在正式驗收時隱藏這個限制。

### 5.2 模型推論不是 API

- 模型權重為 GGUF 檔案；在 Google 雲端的容器內直接透過 llama.cpp 運算。
- 推論服務可使用離線／容器預置權重，避免每次冷啟動都從公共網站下載。
- 預置權重會增加容器大小與 Artifact Registry 儲存成本，必須納入免費額度驗算。
- 設計不含 Gemini API、Vertex AI 付費模型推論或其他外部付費 LLM API。
- 第三方模型的授權、使用條款、版本與 SHA-256 校驗值須固定並記錄。

### 5.3 服務設定（初始值，須實測調整）

| 項目 | 初始規劃 |
|---|---|
| webhook-service | Cloud Run 公開 HTTPS、最小實例 0、輕量 CPU／記憶體 |
| inference-service | Cloud Run 私有或經 OIDC 驗證的內部端點，最小實例 0 |
| 模型 | Qwen3 0.6B，4-bit GGUF；以 llama.cpp 執行 |
| 模型容器 | 1 vCPU、約 2 GiB 記憶體起測；若 OOM 再分析，不直接擴容 |
| 推論併發 | 初期每實例 1 個工作 |
| 最大實例 | 初期 1；視成本與壓測調整 |
| 模型輸出 | 非思考模式優先、繁體中文、短答、輸出 token 上限可設定 |
| 對話脈絡 | 最近 3～5 輪、可設定保存天數 |
| 部署地區 | 台灣 asia-east1 優先；實際依 Cloud Run 配額與價格驗證 |
| 資料 | Firestore 單一免費額度資料庫；不啟用需付費的 TTL／PITR 等功能 |

## 6. 訊息生命週期與 10 秒超時處理

### 6.1 正常路徑

1. LINE POST Webhook 至 Google Cloud Run。
2. 入口在任何 JSON 解析前先用原始請求 body 驗證簽章。
3. 依事件 ID 原子性建立去重記錄；已處理事件不再送訊息。
4. 判斷是否為支援的文字訊息；不支援則給簡短提示。
5. FAQ 命中時直接用 Reply API 回覆；確保 replyToken 只使用一次。
6. FAQ 未命中時啟動模型處理流程；模型必須取得相關知識片段才能回答具體政策與流程。
7. 優先在 8 秒內準備好答覆，保留 LINE API 的網路傳輸與故障緩衝時間。
8. 保存最終狀態、延遲與結果代碼；不得記錄未遮罩的敏感訊息。

### 6.2 超時、重試與競態規則

- 10 秒是**目標**：冷啟動、排隊、外部 LINE API 或 Google 故障時無法硬保證。
- 若模型在設定門檻內無法得出可靠回覆，應以一則明確的備援訊息結束該次 Reply，而不是讓客戶無回應。
- 回覆必須透過 Firestore 原子性狀態轉移鎖定；模型與備援不能同時使用相同 replyToken。
- LINE Reply Token 原則上須在收到 Webhook 後 1 分鐘內使用，且只可使用一次；不得把舊 token 當作可無限延期的佇列回覆方式。
- 若早已送出備援 Reply，後到的模型答案只能記錄，不自動 Push 第二則（避免訊息計價與重複回覆）。
- Cloud Tasks 重試需採指數退避、次數上限及冪等設計；不能無限制重試產生費用。
- 若 Cloud Tasks 的排程／冷啟動無法支援 10 秒目標，必須切換為可測量的快速路徑或調整產品承諾，不可聲稱已達標。
- 系統在收到 Webhook 時應快速確認有效事件已被持久化；若接收不成功需正確回報錯誤以利 LINE 重送。

### 6.3 範例回覆

- FAQ：「您好，營業時間是……（資料更新日期：YYYY-MM-DD）。」
- 知識庫無答案：「目前沒有足夠資料確認這個問題，建議由人工客服協助。」
- 逾時：「已收到您的問題。為避免提供錯誤資訊，請由人工客服協助處理；您也可以改問其他常見問題。」
- 非文字：「目前自動客服先支援文字訊息，請以文字描述需求。」

> 人工轉接需有實際可用的聯絡管道；未配置人工窗口時，不得虛稱已有專人受理。

## 7. 知識庫與模型回答規範

### 7.1 知識來源

MVP 使用 Git 版控的核准 FAQ 檔案（JSON／Markdown）及必要的 Firestore 設定；部署時打包為唯讀資料，對外回覆不得依靠未驗證網路搜尋。

每筆 FAQ 至少包含：
- faq_id、問題類別、常見問法、標準回答；
- 來源網址／內部文件識別、適用範圍、最後更新日期；
- 審核狀態、版本與是否允許 AI 引用。

### 7.2 模型回答的紅線

1. 用繁體中文回答，優先簡明。
2. 商品價錢、政策、保險保障、付款與個人案件不可捏造。
3. 知識不足時承認不知道並引導人工。
4. 客戶提供的內容是資料，不是系統指令；不能被提示注入誘導洩露機密或忽略規則。
5. 不要求客戶在聊天提供密碼、完整證號、信用卡資料或驗證碼。
6. 涉及法律、醫療、金融、保險等高風險問題時，只可提供經核准的資訊與轉介，不作個案決策。
7. 模型輸出必須有長度限制、敏感內容檢查與可追查的 FAQ 來源代碼。

## 8. 資料模型（初稿）

| 集合 | 主要欄位 | 用途 |
|---|---|---|
| inbound_events | event_id（唯一）、user_hash、timestamp、status、reply_state | 去重與處理狀態 |
| conversations | user_hash、recent_turns、updated_at、expires_at | 有限對話上下文 |
| faq_items | faq_id、category、question_variants、answer、source、revision | 客服知識庫 |
| handoff_requests | request_id、user_hash、reason、status、created_at | 人工協助標記 |
| daily_metrics | date、requests、latency_bucket、ai_calls、fallbacks、errors | 指標與使用量 |

個資及完整訊息僅在有明確必要且經核准的情況下儲存；預設使用匿名識別碼與最小必要資料。應定義保存期限、刪除流程及資料存取權限。Firestore 自動 TTL 刪除可能不在免費額度內，MVP 需採不額外觸發付費功能的清理機制並驗證成本。

## 9. API 與系統邊界

| 路徑／元件 | 權限 | 說明 |
|---|---|---|
| POST /webhook/line | 公開，但強制 LINE 簽章驗證 | LINE 事件入口 |
| GET /healthz | 公開，僅回傳非敏感健康狀態 | Cloud Run 服務健康檢查 |
| POST /internal/infer | 僅 Google 服務帳戶或有效 OIDC | 由佇列／內部服務觸發推論 |
| POST /internal/faq/reload（可選） | 管理員驗證 | 更新 FAQ 版本 |
| LINE Reply API | 出站 HTTPS，Channel Access Token | 一次性訊息回覆 |

安全要求：
- Channel Secret、Channel Access Token 與服務憑證只存在 Google 管理的密鑰與權限設定；不得提交至 GitHub。
- 避免在公開 repo 放入真實 LINE 使用者資料、測試帳密或個人資訊。
- 內部推論端點不可在未驗證的情況下公開給網際網路使用。
- Firestore 使用最低權限 IAM；部署帳號與執行帳號分離。

## 10. 免費額度與成本控管

### 10.1 已知持續免費額度（核對日期：2026-10-28）

| 服務 | 官方免費額度／條件 | 風險 |
|---|---|---|
| Cloud Run（以要求為依據計費） | 每月 180,000 vCPU-秒、360,000 GiB-秒、200 萬次請求（以官方計價規則為準） | 超額 CPU、記憶體、網路及其他資源可能計費 |
| Firestore（適用單一免費資料庫） | 1 GiB；每天約 50,000 次讀取、20,000 次寫入、20,000 次刪除 | 超額、備份、TTL 等功能可能計費 |
| LINE Reply | 符合 Reply API 條件時不計入付費訊息 | Push API／其他訊息種類可能有不同費用 |
| Artifact Registry、建置、Cloud Tasks、網路輸出、日誌 | 需在部署前逐項核對所在地區及當時價格／免費額度 | 不可假設全部無限免費 |

重要：Google Cloud 可能要求綁定計費帳戶；**預算警報不是硬支出上限**。NT$0 僅為預算控制目標，未經真實帳單驗證不可承諾絕對零支出。

官方文件：
- Cloud Run：https://cloud.google.com/run/pricing
- Cloud Run min instances：https://cloud.google.com/run/docs/configuring/min-instances
- Firestore：https://firebase.google.com/docs/firestore/quotas
- Cloud Tasks：https://cloud.google.com/tasks/pricing
- Google Cloud 預算：https://cloud.google.com/billing/docs/how-to/budgets
- LINE Messaging API：https://developers.line.biz/en/reference/messaging-api/

### 10.2 防止意外帳單（P0）

1. Cloud Run 最小實例設定為 0；模型運行採按請求計費，禁止啟用固定常駐的付費計算資源。
2. 設定最大實例數、最大併發、最大生成 token、最大上下文、最長推論時間與每日推論次數。
3. 建立 Google Cloud Budget 警報（例如 USD 1、USD 3）；明確註記警報不是硬封頂。
4. 建置、Artifact Registry、Cloud Tasks、Firestore、Cloud Logging、網路輸出都要檢查費用，不只估算 Cloud Run CPU。
5. 如預估會超過免費額度，預設切回 FAQ／轉人工，不自動開啟付費服務或付費模型。
6. 若嚴格要求「任何情況帳單不得大於 0」，上線前必須由管理者確認有效的硬性控費機制；若做不到，不得宣稱能達成嚴格零支出。
7. 每週輸出用量報告；正式服務需有超額與異常流量應對方式。

## 11. 日誌、監控與營運

建議指標：webhook 接收率、非法簽章次數、FAQ 命中率、模型推論成功率、回覆 p50／p95／p99、冷啟動延遲、錯誤率、去重次數、人工轉接量、模型處理秒數與預估資源使用量。

注意事項：
- 日誌使用 event_id／trace_id 串連，不寫入完整 Channel Token、客戶原文與個資。
- 模型服務要記錄「載入時間」與「生成時間」兩種延遲，不能混成一項。
- 發生模型不可用時，FAQ 路徑仍應可運作。
- 任何自動停用服務的成本保護措施都會影響可用率，須在營運規則中揭露。

## 12. 部署、環境與程式目錄規劃

本次只建立 PRD，不代表已寫好程式或完成上線。後續開發時建議如下：

    LINE客服機器人/
      PRD.md
      README.md
      Dockerfile.webhook
      Dockerfile.inference
      pyproject.toml
      src/
        webhook/
        inference/
        line_client/
        faq/
        storage/
        security/
        telemetry/
      knowledge/
        faq.json
      tests/
        unit/
        integration/
        e2e/
        load/
      scripts/
        deploy.sh
        cost_check.py
      .env.example

建置與部署規則：
- GitHub Actions 用於 lint、單元測試、模型 smoke test、Docker 建置及部署（不是客服常駐計算）。
- Google Cloud 專案及正式 LINE OA 憑證由管理者配置。
- GitHub 與 GCP 可使用 Workload Identity Federation，避免把長效服務帳戶金鑰放入 Secrets。
- 需有 staging 與 production 的設定隔離；初期若成本不足，至少要讓測試資料與正式資料隔離。
- 提供一鍵回滾到上個 Cloud Run revision 的操作文件。

## 13. 開發里程碑

| 階段 | 交付內容 | 完成條件 |
|---|---|---|
| M0：基礎驗證 | 用最小容器確認 Cloud Run HTTPS、LINE Webhook、免費區域與計費權限 | 真實 LINE Verify 成功；保存部署資料 |
| M1：FAQ 客服 | Webhook 簽章、文字、去重、FAQ、Reply、日誌 | 20 項常見問題與重送測試通過 |
| M2：本地模型 | Qwen GGUF、llama.cpp、模型載入與推論計時 | 50 道繁中基準題、有準確率與延遲報告 |
| M3：非同步與備援 | Cloud Tasks／等效 Google 內部調度、限時備援、狀態機 | 冷啟動、重送、AI 超時、重試均無重覆回覆 |
| M4：成本與安全 | 配額限制、警報、IAM、遮罩與資料刪除 | 所有密鑰不在 Git，超額與故障情境可控制 |
| M5：正式驗收 | 真實帳號端到端與 7 天跨時段測試 | 實測指標達標，帳單無意外費用，才標為可上線 |

## 14. 測試計畫與不可略過的案例

### 功能測試

- LINE Verify 空事件；簽章正確／錯誤／缺失；變更原始 body 後驗證失敗。
- 一對一文字、非文字、follow／unfollow、重送（isRedelivery）與同 event_id 重覆事件。
- 同使用者連續多則訊息，與不同使用者並行，不串用上下文。
- FAQ 精準匹配、不同問法、缺答案、過期內容、人工轉接。
- LINE Reply Token 只能用一次；超時與備援競爭時只產生一則。
- Google Cloud Tasks 重試及模型失敗，不得觸發重複 Reply。
- prompt injection、要求揭露系統提示詞、要求提供密鑰與客戶資料，均須拒絕或安全降級。

### 效能測試

- 冷啟動 30 次與熱啟動 100 次；分別量測入口啟動、模型載入、首 token 與最終回覆。
- FAQ 與 AI 路徑分開計算 p50／p95／p99；不得只看平均值。
- 同時 1、3、5、10 位使用者情境：分析佇列時間、CPU／RAM、回覆率、成本。
- 模型 0.6B 與 1.7B 至少各測一次；若 1.7B 超時則維持 0.6B。
- 7 天跨時段試運行：凌晨、尖峰、無流量後第一則、連續多則訊息。
- 在 Google Cloud 免費額度內驗算每 100／1,000／10,000 則訊息的可能資源消耗，不可只計算 HTTP 次數。

### 上線閘門（Gate）

- [ ] 具備可重現的安裝與部署文件。
- [ ] LINE 真實帳號 Webhook 與 Reply 成功。
- [ ] 冷啟動／負載／故障處理測試通過。
- [ ] p95 首次回覆 ≤10 秒，或在 PRD 明確記錄未達成並調整對外承諾。
- [ ] FAQ 基準準確率 ≥95%。
- [ ] 重覆事件、超時與併發時沒有重複回覆。
- [ ] 人工處理路徑確實可用，否則不得宣稱可轉人工。
- [ ] 未使用 Gemini 或其他付費 AI 推論 API。
- [ ] 已驗證實際 Cloud 帳單與附屬資源費用；無未經同意的付費服務。
- [ ] 已完成安全、隱私、憑證及回滾檢查。

## 15. 風險與應變

| 風險 | 影響 | 對策 |
|---|---|---|
| Cloud Run 模型冷啟動慢 | 10 秒內不能生成完整答案 | FAQ 優先、分離輕量入口、模型超時備援 |
| 免費 CPU 不足 | 模型回答慢或高併發排隊 | 小模型、短答、單實例、流量上限、基準測試 |
| 付費資源超額 | 違反 NT$0 目標 | 監測所有計費項、限制用量、超額降級，不能假設 Budget 是硬上限 |
| LINE Reply Token 過期 | 無法送出回覆 | 監控 token 時限、先備援；不默認使用可能計費的 Push |
| AI 幻覺 | 錯誤客服資訊 | 僅用核准 FAQ、來源約束、低信心轉人工 |
| 併發／重送 | 多次回覆、成本增加 | Firestore 去重鍵、原子狀態轉移、冪等重試 |
| 公開 repo 洩漏資訊 | 客戶個資與密鑰暴露 | Google 密鑰管理、遮罩、測試資料匿名化 |
| Google 免費服務無正式 SLA | 中斷時無法回覆 | 對外不承諾 100% 可用、設定故障應變 |

## 16. 待確認項目（不阻擋 MVP 的技術驗證）

1. 要服務的是哪個 LINE OA Channel；是否已有正式 Channel Secret 與 Channel Access Token。
2. 第一版客服業務範圍與至少 20 筆經核准 FAQ。
3. 人工客服的實際聯絡管道、工作時間及轉交方式。
4. 預期每日訊息數／同時在線人數，是否可以在免費額度內運作。
5. 是否已持有可用的 Google Cloud Project、計費帳戶與部署權限。
6. 嚴格零帳單與不中斷服務衝突時，是否允許改為僅 FAQ 備援／停用模型。

未確認項目以可配置欄位與安全預設實作，不可直接寫入虛構的商家資訊、客服聯絡方式或秘密金鑰。

## 17. 參考文件（2026-10-28 查核）

- LINE Webhook 與處理建議：https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE 簽章驗證：https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- LINE Reply Token 說明：https://developers.line.biz/en/reference/messaging-api/
- Cloud Run 定價：https://cloud.google.com/run/pricing
- Cloud Run 最小實例：https://cloud.google.com/run/docs/configuring/min-instances
- Firestore 免費額度：https://firebase.google.com/docs/firestore/quotas
- Google Cloud Budget 警報：https://cloud.google.com/billing/docs/how-to/budgets

---

**文件性質：產品需求與實作規格草案。** 本 PRD 的存在不代表模型已部署、LINE 已接通、10 秒目標已達成或 Google Cloud 實際帳單一定為零。
