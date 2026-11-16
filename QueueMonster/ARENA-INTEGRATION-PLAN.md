# 排隊怪獸 × Monster Arena 串接整合計畫

- 日期：2026-11-16
- 狀態：規劃完成，**尚未改動兩專案正式程式、資料庫或部署**
- 排隊怪獸來源：https://github.com/hub-google/LINE/tree/main/QueueMonster
- Arena 原版來源：https://github.com/hub-google/monster-arena-web
- 總原則：**排隊怪獸管理 LINE 會員、店家、真實交易；Monster Arena 管理原版養成遊戲及其 Firebase 遊戲資料。嵌入呈現，不複製兩套遊戲、不重寫遊戲機制。**

## 一、固定需求及不得擅改範圍

1. 用原版 Monster Arena **完整取代**排隊怪獸的像素城市「遊戲逛店」模式。不得再做第二套「店家養成遊戲」。
2. 排隊怪獸網站外層 LOGO、表頭、登入狀態與導覽保持原公版；在 **「我的紀錄」右邊新增「養怪獸」**。桌機、手機同步。
3. Arena 遊戲主體、怪獸圖、孵蛋、養育、餵食、清理、生病、死亡、訓練、時間進化、繁衍、圖鑑、商城、背包、每日任務、金幣、體力、戰鬥、世界王、公會、社交均沿用原版。**不得自創 EXP、親密度、預約加速成長、共享店家等規則**。
4. LINE 顧客第一次點「養怪獸」時**自動串接建立對應的 Arena Firebase 遊戲玩家**，不另填遊戲 Email／密碼，不出現第二次註冊。以同一經驗證 LINE 身分跨裝置找回同一玩家。
5. 店家可在排隊怪獸既有「設定」加入／退出怪獸養成計畫，並選一個**Arena 原版合法怪獸家族**；顯示該家族原版各階段像素圖及全部分支預覽。
6. 玩家選擇一家參與計畫的店家，得到**店家選的家族**的原版怪獸蛋，放入原本 Arena **怪獸倉庫（Roster／monsters）**，沿用正常養成與進化；不是另外創造「店家遊戲背包」。商品道具才是原本 Arena **user_inventory**。
7. 顧客在參與計畫的真實店家使用**預約／抽號／點餐**，只有**店家確認預約成立、取號確實到場、店家確實接單**才另外隨機送**一般商城七種原版商品之一 x1**。原本 Arena 每日登入／任務／商城／公會／其他取得途徑全部保留。
8. 獎勵不是送出交易立即觸發。所有獎勵必須由可信任後端查真實交易狀態，且每筆交易至多送一次。
9. 需要兩個 GitHub 專案一起調整；本文件是具體執行設計，不是已完成的功能。

## 二、實際檢查過的程式與現況

### A. Monster Arena（master）

- **src/App.jsx**：實際使用 src/utils/api.js、src/utils/firebaseClient.js；由 Firebase onAuthStateChanged 控制登入與遊戲頁。遊戲頁面包括 Dashboard、Roster、Arena、Guild、Raid、Social、Pokedex。
- **src/pages/Login.jsx** 和 **api.register／api.login**：使用 Firebase Email/Password。初次註冊建立 Firestore users 文件，初始 gold=500、premium_gems=0、stamina=100、max_stamina=100。QueueMonster SSO 玩家應初始化**同樣原值**。
- **src/utils/api.js**：實際 Firestore 資料來源，使用 users、public_profiles、monsters、user_inventory、daily_quests、friends、guilds、guild_members、gifts、messages、battle_records、sys_config 等 collections。**雖然 Arena 有 src/utils/supabaseClient.js，但 App 使用的遊戲 API 仍是 Firebase，不可誤稱已遷移至 Supabase。**
- **api.hatchEgg()**：原版每顆蛋消耗 100G；最多 50 隻存活怪獸；正常隨機孵蛋家族是 1～7；新蛋 life_stage=1，其他基因、戰鬥值、清潔與飽食欄位有完整初始化。商家指定家族蛋應重用**同一原版初始化與條件**，只把隨機家族改為後端驗證的指定家族。
- **api.getMonsters()**：以時間、訓練次數、neglect_count、戰鬥及勝率依原規則進化；有飢餓、生病、死亡及老化。api.evolve() 究極進化需原版核心、至少 50 戰、勝率 70% 和相應年齡等條件。本案不改。
- **src/utils/monsterSprites.js**：原版 MONSTER_SPRITES 目前共 100 組鍵，正常家族 1～7 有階段 1～6 和疫苗／資料／病毒分支；家族 8 另有特殊高階圖，**不在一般孵蛋 1～7 的可選清單**。
- **src/pages/Pokedex.jsx**：原版本是**圖鑑網格及進化提示**，不是已可直接嵌在店家設定的完整流程圖；需用原版 sprites 建立新的**展示排版**，不是重造進化規則。
- **src/components/ShopModal.jsx**、**api.buyItem()**：原版一般商城七種商品（第六節）。
- **README.md** 明確揭示：原版仍有**玩家可以透過 Firestore 客戶端偽造自己金幣、體力、任務和戰鬥結果**的安全限制，repo 內 firestore.rules 不代表已部署到正式 Firebase。不能隱瞞此風險。

### B. QueueMonster（LINE/main/QueueMonster）

- 官網正式路徑：https://hub-google.github.io/LINE/booking/；公開店家搜尋 **directory.html**，跨店歷史紀錄 **my-records.html**。
- 舊「遊戲逛街」程式 **saas/explore-game.js／explore-game.css**，與 **saas/assets/directory/main.js** 的 mode=game／LineExploreGame 串接。必須替換遊戲入口、保留原搜尋和直接預約／抽號／點餐按鈕。
- 公版介紹頁導覽 **saas/assets/marketing/shared-header.js**，登入狀態 **saas/site-auth.js**。導覽需要同時盤點非公版頁，避免只新增某一頁。
- 已驗證 LINE 身分由 QueueMonster Supabase Auth + 後端 LINE 驗證關聯；來源包含 **qm_platform_line_identities**、**qm_line_links**（歷史 SQL 可能使用舊實體名 so_，現統一 qm_）。**單獨的 Supabase 匿名 UUID、暱稱或電話，不能代表跨裝置穩定 LINE 身分。**
- 預約送出 **saas/app/actions/booking-submit.js** 呼叫 so_book_with_contact_once 後得到 **CONFIRMED**，**這是系統已建立預約，不是店家人工確認**。
- 叫號票券可有 WAITING、HOLD、CALLED、ARRIVED、ADMITTED、SERVING、PASSED、COMPLETED、CANCELLED 等狀態。**CALLED 只代表叫到，不能發到場獎勵。**
- 點餐 **qm_pickup_orders** 的狀態包括 NEW、ACCEPTED、PREPARING、READY、PICKED_UP、REJECTED、CANCELLED，店家主要用 so_pickup_update 轉狀態；現有 **15 秒客戶可取消視窗**，NEW 不代表接單。
- 實體表遵循 **qm_** 前綴；既有 so_* RPC 仍保留相容，新的 SQL 不能破壞其他產品、現有外鍵或正常交易。

## 三、建議正式架構：排隊怪獸「外框」＋ Arena「內嵌主體」

~~~text
https://hub-google.github.io/LINE/booking/arena.html
┌────────────────────────────────────────────────────────┐
│ 排隊怪獸公版表頭                                          │
│ LOGO｜店家功能｜搜尋店家｜我的紀錄｜養怪獸｜LINE 會員       │
├────────────────────────────────────────────────────────┤
│ iframe: https://hub-google.github.io/monster-arena-web/ │
│         ?embed=queue-monster                             │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Arena 原版 React 遊戲：養成／倉庫／戰鬥／公會／世界王 │ │
│ │                         + 認養店家蛋的必要入口       │ │
│ └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
      │ QueueMonster Supabase／LINE         │ Arena Firebase
      ├── 商家設定、預約、取號、點餐         ├── 原版玩家
      ├── 安全 SSO 身分交換                 ├── 原版怪獸
      └── 合格交易獎勵事件──安全 Worker────> └── 原版商城背包
~~~

- **可行性**：兩個 GitHub Pages 網址同為 https://hub-google.github.io，只是 path 不同，適合由 QueueMonster 顯示外層表頭，以 iframe 載入 Arena 獨立部署的遊戲。
- **不複製 Arena 到 LINE repo**：原版遊戲在 monster-arena-web 繼續維護；原遊戲改版正常部署後，嵌入頁讀新遊戲，沒有兩份容易走樣的遊戲碼。
- **不搞雙重網站表頭**：QueueMonster 外層維持會員／網站導覽；Arena 原有下方「養成、倉庫、競技場、公會、世界王、社交、圖鑑」等**遊戲內導覽**仍保留。
- **手機版**：測試 iframe 高度、內外捲軸、全螢幕、返回上一頁、遮罩／商城 modal 與 LINE in-app browser。以實機確定 CSP／iframe／儲存限制；不能只用桌機判定成功。
- **穩定部署**：QueueMonster 不必因 Arena 每次更新而複製遊戲 build；兩者可獨立回滾。遊戲後端故障不影響 QueueMonster 正常預約與叫號。

## 四、單一登入：LINE 會員一鍵自動成為 Arena 玩家

### 4.1 不要直接使用第二組 Firebase 帳密

**QueueMonster** 仍負責驗證 LINE；**Arena** 仍使用既有 Firebase Authentication + Firestore。新橋接只在伺服器端把「QueueMonster 已核實的 LINE 使用者」轉為 Firebase Custom Token，不改原 Firebase 資料庫。

建議以 Supabase Edge 受控入口 + Firebase 安全簽發服務（Firebase Cloud Functions/Admin SDK，或經驗證可安全簽章的後端）完成：

1. 顧客 LINE 身分已驗證，進入 QueueMonster arena.html。
2. 父頁用自己的有效 Supabase session 向受控後端要求 **60～120 秒、僅一次可用**的 SSO 橋接票。
3. 伺服器查平台／店家對應的**已驗證** LINE provider/channel + line_sub；不能相信前端輸入 line_sub、暱稱、匿名 Auth UUID 或 Firebase UID。
4. 後端使用私密 HMAC，把此 LINE 身分轉成穩定且不露明文 LINE ID 的 Firebase UID（建議 qm_ 前綴）；同一 LINE 跨裝置共用，不與原 Email 玩家 UID 衝突。
5. iframe 載入 Arena embed 模式，向父頁傳 ready + nonce，父頁以**精確 targetOrigin／指定 iframe window** 的 postMessage 送一次性橋接票，**不將票放在 URL、localStorage 或 log**。
6. Arena 向受控後端兌換橋接票，得到正式 Firebase Custom Token，呼叫 Firebase **signInWithCustomToken()**。
7. 首次登入在**可信任後端**原子建立 Firestore users／public_profiles，沿用原 Arena 初始 gold=500、stamina=100 等，不執行原本的 Email 註冊函式；再次登入不重置金幣／怪獸。
8. QueueMonster 登出、切換 LINE 人或失去驗證時，父頁通知 iframe 清掉上一個 Firebase session，重新安全驗證；**不能留下前一名玩家資料**。
9. Arena 獨立網站仍保留原 Email 登入，**不自動合併原 Email 帳號**。日後若要合併，需另外做雙帳號本人驗證與轉移方案。

**推薦新映射資料**：qm_arena_identity_links（Supabase 私密表，記錄核實 LINE 身分雜湊、provider/channel、Firebase UID、首次／最後關聯時間、本人 Auth 關係）。用私密表而不是在前端偷存 LINE 原始 userId。

**安全要求**：Firebase Admin 私鑰、Supabase secret/service key 只存在後端。票據單次消耗，驗 JWT、nonce、origin、頻率限制；不要把 Supabase access_token 透過 iframe URL 傳給 Arena。登出與 session 失效時重驗證。正式實作需選定 Firebase signer 部署位置、環境秘密及撤銷策略。

官方依據：
- Firebase 自訂權杖：https://firebase.google.com/docs/auth/admin/create-custom-tokens
- Supabase Edge Functions 身分驗證：https://supabase.com/docs/guides/functions/auth

## 五、店家設定選家族、預覽「原版所有進化分支」

### 5.1 QueueMonster 原店家設定內新增一張卡

卡片名稱：**店家怪獸養成計畫**。

- 「參加怪獸養成計畫」開關；預設關閉。
- 開啟後選一個原 Arena **1～7 家族**；真正啟用須先選好家族及儲存。
- 以 Arena 原始 **MonsterPixelArt／MONSTER_SPRITES** 產生實際圖像，不另畫一批店家風格怪獸。
- 同一頁**顯示完整可用路線**：原版蛋 → 幼年期 → 成長期 → 成熟期 → 完全體 → 究極體；有疫苗／資料／病毒分支時並排顯示原版圖，使用原版狀態／條件說明。
- 目前 Arena **Pokedex.jsx 是圖鑑網格**，不是店家可用的進化樹。要新增**展示版型**，但不改變任何分支算法或數據。
- 只能由有權限的 OWNER/MANAGER（及原有合法總部角色）儲存，必須驗租戶。不能單靠前端關閉按鈕判斷權限。
- 停用後既有玩家已認養的怪獸繼續留在倉庫，新的認養／交易獎勵停用；更改家族只影響未來認養的蛋，不回溯改寫已養怪獸。

**資料表提案**：qm_arena_merchant_settings：
- tenant_id：UUID，PK/FK qm_tenants.id
- enabled：boolean
- family_id：smallint，限制 1～7
- updated_at、updated_by
- 只允許有商家管理權限的伺服器 RPC 修改，公開頁僅可讀取已參與店家的安全投影。

**跨 repo 圖像供應**：Arena build 以 monsterSprites.js 原資料產生可讀的靜態 **monster-catalog.json**（家族、階段、屬性、名稱、可用格點圖／可渲染資料），由 QueueMonster 設定頁讀取。它是原資料的**輸出檢視**，不能兩邊獨立人工維護，以免圖與進化條件不同步。

## 六、玩家認養「店家指定家族」原版怪獸蛋

1. QueueMonster 店家卡或 Arena 的「認養店家怪獸」入口列出**真實參與商家**，可用商家 slug 導入 Arena。
2. 選擇店家後，後端依 qm_arena_merchant_settings 確認 family_id 與 enabled；不是讓玩家從前端送 family=8 或任意指定未參與店家。
3. 呼叫 Arena 新增的**安全指定家族孵蛋入口**（例如 hatchMerchantEgg）。重用原版 api.hatchEgg 的完整初始化欄位、原版 50 隻上限、原版 100G 孵蛋費用；只把普通版的**家族隨機**改為**店家已選家族**。普通「隨機孵蛋」繼續存在。
4. 寫入原 Firestore **monsters**，新增**可選**的來源欄位：merchant_tenant_id、merchant_slug_snapshot、source=queue_monster。怪獸仍是該玩家自己的，不是整家店共同培養一隻。
5. 怪獸出現在 Arena **Roster（怪獸倉庫）** 與 Dashboard 切換，顯示店家來源；原本 feed／clean／heal／train／evolve／breed／battle／release 完整使用原 API。
6. 同一玩家可認養多家店；保留 50 隻原版容量。**建議**同家店同時限一隻有效認養蛋，防按重複產蛋；死亡／放生後可重新遵守原版費用與容量認養。這是新增店家流程的防重設計，**非原 Arena 原有規則**。
7. 使用原版 100G 是「盡量不改經濟」的規劃預設；若產品決策希望認養店家蛋免費，必須另行標明其對原版經濟的改動，不私自調整普通孵蛋的費用。
8. **怪獸蛋不是道具**：進 monsters；**商城抽獎道具**才進 user_inventory。

## 七、三種真實商家行為→原商城隨機贈品

### 7.1 資格判定：不能只看送出成功

| 原始服務 | 實際現有狀態 | 發獎條件 | 不可發獎 |
|---|---|---|---|
| 預約 | so_book_with_contact_once 通常立刻 CONFIRMED；這不是店家人工確認 | **新增店員明確「確認預約成立」的核實動作**，寫入單獨的商家確認紀錄；再於後端建立唯一獎勵事件 | 新預約自動 CONFIRMED、尚未人工確認、已取消／刪除 |
| 抽號 | qm_tickets 有 WAITING/CALLED/ARRIVED/ADMITTED | 已授權店員把真實票券**首次轉到 ARRIVED 或 ADMITTED**（確實到場） | WAITING、CALLED、PASSED、取消或未到場 |
| 點餐 | qm_pickup_orders 狀態有 NEW、ACCEPTED 等 | 已授權店員**首次成功接單為 ACCEPTED**，且符合既有 15 秒可取消規則 | NEW、剛送出、拒單、取消、未接單 |

**預約要額外新增人工「確認成立」動作的原因**：QueueMonster 現有 CONFIRMED 是系統建單後即產生，若拿它當店員確認，仍會在送出時就送道具，與本次需求不符。這個新增動作只影響獎勵資格，不應把原本預約成功／取消／報到／叫號流程打壞。正確後端 RPC／觸發位置實作前須查**正式已生效 DB function definition**，歷史 migration 不能當成線上實際版本。

### 7.2 抽獎池：只用 Arena 原「一般商城」的七種

以下以 Arena **ShopModal.jsx + api.buyItem()** 為準：

| ID | 原商城名稱 | 原版標價 |
|---|---|---:|
| meat_basic | 基本肉 | 10G |
| meat_premium | 頂級肉 | 50G |
| energy_drink | 能量飲 | 100G |
| medicine_standard | 特效藥 | 200G |
| vitamin | 維他命 | 50G |
| breed_catalyst | 繁衍催化劑 | 500G |
| ultimate_core | 究極進化核心 | 1,000G |

- 每次達標**隨機一種，數量一個**，以原版 item_id、item_type、quantity 存 Arena 原背包。
- 未另指定機率，第一版建議七種**等機率**，在**受信任後端**產生並在事件建立時固定道具，重送不重新抽。
- 公會商店的 chip_extractor 等道具不在這七種一般商城池裡；不得擅自加入。
- 原本商城、每日任務、每日登入獎勵、公會兌換、世界王與成長流程**完全不變**。
- **不擅自新增「一定要認養同一家店的怪獸才能獲得該店獎勵」條件**：只要該店參與、顧客身分可安全關聯 Arena 玩家、交易真的達資格就可送。若服務時玩家尚未首次開遊戲，後端保留待發事件，待同一 LINE 本人首次建立 Arena 身分再補發。
- 未指定每日上限、消費金額倍數或累積點數，**不自行發明**。同一筆實際交易只送一次，狀態反覆修正也不重複。

### 7.3 發獎不走前端：Supabase Outbox → Firestore 同一交易內去重

因 QueueMonster 在 Supabase、Arena 在 Firestore，**不可能把兩套 DB 合成一筆原子 transaction**。規劃採受控後端排程與冪等收據：

~~~text
店員確認預約／票券到場／店員接單
  ↓
QueueMonster 原有受權限驗證 RPC 更新真實資料
  ↓（同一 SQL transaction）
qm_arena_reward_events 建立唯一 PENDING 事件（含已固定 item_id）
  ↓
受信任 Reward Worker 收取待發事件
  ↓
Firebase Firestore transaction：
  1. 檢查 reward_grants/{event_id} 是否存在
  2. 不存在 → 原 user_inventory 該 item_id quantity +1
  3. 同一 Firestore transaction 新增 reward_grants/{event_id}
  ↓
Supabase Outbox 標記 DELIVERED；網路中斷則安全重試
~~~

- 唯一去重鍵建議 **(source_kind, source_id, reward_type)**；3 種類型與不同店家 UUID 不可互混。
- 下游 Firebase grantId 使用相同固定事件識別；即使 Worker「Firestore 成功、Supabase 回寫逾時」，重新嘗試也**只會增加 1 次庫存**。
- 只對當時有參與的店家建立事件；確認真正的租戶、已驗證顧客 LINE 主體、操作店員權限、真實來源紀錄。不能讓前端自行呼叫「送我道具」API。
- 訂單取消／狀態修正：資格尚未發生前取消不送；**已發送後不重發**。已領道具是否要回收是另外的商業規則，規劃建議**不自動回收**，避免已使用消耗品導致資料錯亂，保留審計追查。

### 7.4 新增資料（只新增整合所需，不搬走原遊戲 DB）

**QueueMonster Supabase（物理表 qm_）**

1. **qm_arena_merchant_settings**：tenant_id、enabled、family_id、updated_by／updated_at。
2. **qm_arena_identity_links**：經驗證 LINE provider/channel/subject hash ↔ Firebase UID、關聯時間；私密權限。
3. **qm_arena_sso_tickets**（優先 private schema）：短效單次票據雜湊、nonce、過期與消耗時間。
4. **qm_arena_booking_confirmations**：reservation_id／tenant_id／staff_actor／confirmed_at；正式店家確認預約成立的記錄，不更改原 CONFIRMED 意義。
5. **qm_arena_reward_events**：event_id、tenant_id、source_kind、source_id、verified_line_subject_hash、firebase_uid（可為空等首次登入）、item_id、quantity=1、PENDING／PROCESSING／DELIVERED／FAILED 狀態、attempts、created_at、delivered_at、last_error、唯一約束。

**Arena Firebase/Firestore（保留原 collections）**

1. **users／public_profiles**：LINE 玩家第一次登入時，以後端建立原版初始化數值；每個 UID 只建一次。
2. **monsters**：原欄位保留，商家蛋加可選的 merchant_tenant_id／source／slug_snapshot。
3. **user_inventory**：原商品道具原地增加 quantity，沒有新背包。
4. **reward_grants**（新小型 collection）：事件 UUID 收據，用於與原 user_inventory **同一次 Firestore transaction**，不允許客戶端自行寫入。

實作時所有新 public 表應有正確 RLS／GRANT，private 表不直接暴露；包含唯一約束、來源 FK、核實使用者與租戶關聯、必要稽核。不可讓 Arena 的普通玩家隨意寫商城獎勵收據與商家蛋來源。正式 migration 須透過正規 CLI 建立檔案並核對線上現行 schema 後執行。

## 八、必須修改的兩個 GitHub 專案

### QueueMonster：hub-google/LINE

| 現有檔案或新增位置 | 要改的事 |
|---|---|
| **QueueMonster/saas/arena.html**（新增）及 **assets/arena-embed/**（新增） | 公版表頭保留；iframe Arena；載入／錯誤與 responsive；SSO ticket／postMessage／登出切換狀態 |
| **saas/assets/marketing/shared-header.js** ＋相關現存首頁／非公版導覽來源 | **「我的紀錄」右邊加「養怪獸」**；手機導覽同位置；其他功能按鈕不亂改 |
| **saas/directory.html**、**assets/directory/main.js**、**explore-game.js／CSS** | 用 Arena 取代舊遊戲逛街；舊 mode=game 連結相容轉向新頁；一般店家搜尋及原本預約／抽號／點餐直接按鈕保留 |
| **saas/app/staff/settings.js**、**app/actions/merchant-settings.js** | 原設定版面增加店家參與開關、家族選擇、原像素進化樹、儲存權限 |
| **saas/assets/directory/main.js** + 公開店家資料 RPC | 已參與店家顯示代表蛋、認養連結；未參與不顯示 |
| **saas/app/staff/bookings.js**、預約 action／正式 RPC | 新增受權限控制的**店員確認預約成立**事件，不變更其他預約狀態語意 |
| 既有票券狀態 RPC／觸發器 | 到場 ARRIVED／ADMITTED 的首次真實轉換入獎勵 Outbox，不是叫號就發 |
| 既有 **so_pickup_update**／訂餐後台 action | 首次接單 ACCEPTED 入 Outbox，保留 15 秒取消與既有可逆狀態流程 |
| **supabase/functions/qm-arena-sso-***（新增） | 已驗證 LINE → 安全 Firebase token 橋接、單次票據、錯誤與 session 撤銷 |
| **supabase/functions/qm-arena-rewards-***（新增） | 值班 worker 處理跨 DB 贈品、失敗重試／對帳／安全寫入 Firestore |
| **supabase/migrations/**（新增正式 migration） | 五張必要整合表、RLS、權限、唯一鍵、原子事件、授權 RPC |
| **PRD.md、saas/README.md、工作流程、測試** | 同步維護路由、身分與交易獎勵規範，確認 GitHub Pages 正確包含 arena.html |

**注意**：現有 RPC 已反覆更新，實作前要查**正式 DB 的 current function definition**，不能拿較早 migration 的同名 so_* 覆寫最新叫號／點餐功能。

### Arena：hub-google/monster-arena-web

| 現有檔案或新增位置 | 要改的事 |
|---|---|
| **src/App.jsx**、**src/App.css**、**src/components/MobileLayout.jsx** | 支援 embed=queue-monster，保留遊戲操作及遊戲內導覽，不顯示第二套 QueueMonster 網站表頭 |
| **src/utils/firebaseClient.js**、新增 **src/utils/queueMonsterBridge.js** | iframe 一次性票據交換 + signInWithCustomToken；LINE 用戶不再經原 Login.jsx（獨立 Arena Email 登入保留） |
| **src/utils/api.js** 與相應可信任後端 | 原始玩法保持；新增指定合法商家家族的安全孵蛋入口、第一次 LINE 使用者原版開戶 |
| **src/pages/Roster.jsx**、**src/pages/Dashboard.jsx** | 增加「認養店家怪獸」入口／來源標籤，商家蛋照原 Arena 養育，不建另一套怪獸系統 |
| **src/utils/monsterSprites.js**、**MonsterPixelArt.jsx**、**Pokedex.jsx** | 原版 100 組 sprite 作為來源；build 產出可共用目錄資料供店家進化預覽，**不重新繪製或調整進化算法** |
| **firestore.rules**、可信任 reward worker | 禁止前端自己建立商家來源／重複 reward_grants；伺服器寫入原 user_inventory |
| **vite.config.js**、**.github/workflows/deploy.yml**、**tests/** | 確保獨立 Arena 與嵌入模式都可正常部署；Firebase emulator 測試與安全規則需另行部署核驗 |

**不做的事**：把 Arena Firestore 整庫搬到 QueueMonster Supabase、重新設計商城、重畫怪獸、把商家預約當經驗值、讓店家設定最終進化數值、移除原 Arena Email 玩家、讓前端自由發獎。

## 九、風險與產品規則邊界

- **原版 Arena 安全缺陷**：原 README 已承認 client-side 可以自改個人金幣／體力／部分戰績；即使完全沿用遊戲功能，也要至少把新**SSO、指定商家蛋、預約贈品**移到可信任後端。若要求整個多人競爭無法作弊，需把原版資產／戰鬥寫入改為後端權威，但**保留原數值與公式**。
- **匿名 Supabase Auth 不是 LINE 唯一身分**：同一 LINE 人換設備可能得到另一個 Supabase 匿名 UUID。獎勵與遊戲 UID 必須使用同 provider/channel 的**已驗證 LINE subject** 對應，避免分裂帳號。
- **不能直接相信「CONFIRMED」**：那是預約建單成功而非店家人工確認；本案需新增操作。
- **不可將前端成功畫面當後端交易證據**：QueueMonster 資料庫實際轉換才是事件來源。
- **雙 DB 寫入**：採 outbox、唯一事件、Firestore transaction 收據、worker 重試；不聲稱兩個資料庫能共同原子 commit。
- **互通 API 與 UI**：iframe 內 modal、虛擬鍵盤、遊戲實時刷新、LINE in-app browser、瀏覽器 Firebase IndexedDB session 都需實際測。
- **禁止影響原交易**：遊戲、Firebase、贈品服務失敗不應導致正常預約、取號、點餐提交失敗；獎勵入庫可延遲補償。
- **預設需確認的新增規則**：商家指定蛋預設沿用普通孵蛋 100G；同店同時一隻存活認養蛋；已發獎不自動回收。這是整合建議、不是 Arena 原本即存在的「商家」規則；不得不告知直接改成免費或限制每天幾次。
- **商家退出後**：保留既有玩家已養的怪獸與道具，後續新事件停止；商家改家族只影響新認養。
- **非參與店家**：不用顯示認養功能，也不能送活動商城道具；一般使用平台交易流程不受影響。

## 十、實作順序與驗收矩陣

### P0：登入橋接＋外框，不碰正式客戶交易

- [ ] QueueMonster 保留原標頭；桌機／手機「我的紀錄」右側「養怪獸」可開 Arena 內嵌。
- [ ] 原 Arena 單獨網站仍能以 Email 登入；內嵌 LINE 使用者沒有第二個登入表單。
- [ ] LINE 顧客第一次登入建立**一個**原版 Firebase 玩家：500G／100 體力／原圖鑑與遊戲頁正常。
- [ ] 同一 LINE 在手機與桌機看到同一遊戲資料；不同 LINE 使用者隔離；登出後 iframe 不殘留前人資料。
- [ ] 過期／重用票據、假 LINE、錯誤 nonce、未授權網站、偽造 Firebase UID 全部拒絕。

### P1：店家選擇與玩家養蛋

- [ ] 店家 OWNER/MANAGER 可開／關、選 1～7 家族，展示每階段每分支原圖；STAFF 與其他店家無權修改。
- [ ] 玩家選真實參與店家取得該家族原版蛋；扣 100G，最多 50 隻，普通孵蛋機制也正常。
- [ ] 蛋在 Arena 原倉庫與養成頁，來源店名可見，原餵食、清理、訓練、病死、進化、對戰、繁衍不改。
- [ ] 店家停用／更換家族不會改寫之前的怪獸。

### P2：三種真實交易的贈品

- [ ] 預約：系統自動 CONFIRMED **不發**；授權店員人工確認才發 1 個原商城道具。
- [ ] 抽號：WAITING、CALLED **不發**；ARRIVED／ADMITTED 到場後發 1 個。
- [ ] 訂餐：NEW **不發**；15 秒取消窗口及原有流程後，店家真正 ACCEPTED 發 1 個。
- [ ] 原版七種商城每一種皆可抽到；道具確實進入原 user_inventory，原版使用效果與價格不變。
- [ ] 同來源 UUID 重送、按鈕連點、狀態往返、Worker 超時重試仍最多送 1 個。
- [ ] Firebase 暫時中斷、顧客尚未建 Arena 帳號能安全補發。
- [ ] 非參與店家無贈品；即使遊戲掛掉，正常交易仍成立。

### P3：兩 repo 部署、效能與安全回歸

- [ ] 確認兩邊 GitHub Pages 原網址／相容舊 mode=game 連結可用；原搜尋、歷史紀錄、預約／抽號／點餐一樣正常。
- [ ] 原 Arena Email 玩家、商城、遊戲任務、競技場、公會、世界王、圖鑑及好友功能未退化。
- [ ] Firestore rules **實際在正式 Firebase 部署**；新商家蛋／贈品收據不可由客戶端自行偽造。
- [ ] Chrome／Safari、Android／iPhone、LINE 內建瀏覽器，響應式、iframe 捲動與 modal 驗證。
- [ ] 後端獎勵日誌可查對交易來源、送達狀態與失敗原因，沒有任何測試假訂單留在正式庫。
- [ ] 先讓 Arena embed 與後端可用，再向正式顧客開放新的「養怪獸」入口；兩個 repo 各自可回滾。

## 十一、來源檔與官方技術文件

Arena 來源：
- https://github.com/hub-google/monster-arena-web/blob/master/src/App.jsx
- https://github.com/hub-google/monster-arena-web/blob/master/src/utils/api.js
- https://github.com/hub-google/monster-arena-web/blob/master/src/utils/monsterSprites.js
- https://github.com/hub-google/monster-arena-web/blob/master/src/pages/Pokedex.jsx
- https://github.com/hub-google/monster-arena-web/blob/master/src/pages/Roster.jsx
- https://github.com/hub-google/monster-arena-web/blob/master/src/components/ShopModal.jsx
- https://github.com/hub-google/monster-arena-web/blob/master/README.md

QueueMonster 來源：
- https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/README.md
- https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/site-auth.js
- https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/app/actions/booking-submit.js
- https://github.com/hub-google/LINE/blob/main/QueueMonster/saas/app/staff/bookings.js
- https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261104_queue_arrival_admission_states.sql
- https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261111164500_pickup_reversible_statuses.sql
- https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261110113000_platform_customer_line_identity.sql
- https://github.com/hub-google/LINE/blob/main/QueueMonster/supabase/migrations/20261112132500_pickup_15_second_cancel_only.sql

官方技術：
- Firebase Custom Tokens：https://firebase.google.com/docs/auth/admin/create-custom-tokens
- Firestore Transactions：https://firebase.google.com/docs/firestore/manage-data/transactions
- Supabase Edge Auth：https://supabase.com/docs/guides/functions/auth

**本文件界線**：此份 Markdown 是待執行的跨 GitHub 專案整合方案；未修改 Arena 程式、未建立新 Supabase／Firestore 資料、未更新正式網站。實作時先讀正式現行 DB function definition／Firebase 正式 rules，再依 P0 → P3 進行。
