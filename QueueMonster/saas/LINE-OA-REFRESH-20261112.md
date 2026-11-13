# 排隊怪獸｜LINE OA 品牌與圖文選單（2026-11-12）

> **2026-11-13 最新導覽與連結：** [公開網址／相容性盤點](PUBLIC-ROUTE-AUDIT-20261113.md)。平台「搜尋店家」為獨立 `directory.html`；平台「我的紀錄」為獨立 `my-records.html`（**跨所有店家**的預約／取號／訂餐紀錄同頁呈現）。**個別店家**的「歷史紀錄」仍在 `?view=customer&merchant=<slug>&tab=mine`，兩者不得混淆。舊 `directory.html?mode=mine` 及 `mode=last-board` 皆安全轉向新跨店頁，其他搜尋與服務連結保留。下方較早日期的操作規劃僅供歷史參考，以本節為準。

適用：**排隊怪獸平台官方 LINE OA**，不是店家自有的 LINE OA。

## 品牌資訊（LINE OA Manager 設定）

- 帳號名稱：**排隊怪獸**
- 狀態訊息建議：**免費預約、叫號與線上點餐｜排隊交給怪獸，時間留給自己**
- 帳號介紹：**排隊怪獸是店家與顧客共用的預約、排隊叫號、線上點餐平台。顧客可搜尋店家、預約時段、領取號碼、查詢叫號與取餐進度；店家可免費體驗叫號系統，管理預約、現場候位、點餐及營運。手機、平板、電腦皆適用。**
- 重要服務說明：**本平台 LINE OA 僅提供找店、功能入口及自動操作指引，目前**沒有客服中心或人工聊天室**，也不替任何商家代發訂單、預約或叫號推播。只有店家已綁定自己的 LINE OA，才可能由該店家 OA 發送符合 LINE 規範的通知；未綁定的店家請以網站查詢進度。**
- 品牌圖：沿用網站正式紫色品牌、怪獸標誌；不使用個別商家圖片。
- 首次加入好友：由已設定 `LINE_PLATFORM_WELCOME_REPLY` 的平台 webhook 用 LINE Reply API 回覆新版說明；須避免與 OA Manager 的既有歡迎訊息重複。

LINE Messaging API **無法直接修改** OA Manager 的名稱、介紹、頭貼、封面與狀態訊息。請至 https://manager.line.biz/ 核對或變更上述內容，不要把 API token 貼到公開頁面或聊天室。

## LINE 圖文選單（正式發布程式）

來源：`.github/scripts/publish_rich_menu.py`；發布工作流程：`.github/workflows/line-rich-menu.yml`。
保留既有 **顧客服務／商家服務** 上方切換鍵，兩頁各六格；預設顧客服務。LINE richmenu alias 維持原值避免破壞切換。

| 顧客服務 | 行為 |
| --- | --- |
| 搜尋店家 | 顯示公開店家 |
| 線上預約 | 進入已選「預約」條件的正式店家搜尋 |
| 現場取號 | 開啟 `directory.html?mode=mine&section=queue`，篩選開放現場取號的店家 |
| 線上點餐 | 進入已選「點餐」條件的正式店家搜尋 |
| 我的紀錄 | `directory.html?mode=mine`，顯示預約、取號、訂單三種紀錄分類 |
| 訂單紀錄 | `directory.html?mode=mine&section=order`，查詢各店點餐與取餐紀錄 |

| 商家服務 | 行為 |
| --- | --- |
| 免費叫號體驗 | 免註冊體驗現有示範頁 |
| 了解平台功能 | 開啟真正的店家介紹頁 |
| 免費建立店家 | 開啟店家註冊／登入入口 |
| 店家管理後台 | 開啟真正的管理入口（需登入） |
| 操作與串接 | 開啟店家教學頁（含自有 LINE OA 串接） |
| 入口分享教學 | 查看如何取得店家的預約、取號與點餐網址及 QR Code |

**取消圖文選單的「遊戲逛街」和重複店家按鈕**。遊戲探索功能仍可在網站提供，不需要佔 LINE OA 主功能區。

## 技術與驗收

- 顧客服務「預約／點餐」網址使用 `directory.html?mode=search&service=...`；搜尋頁先預選服務再執行正式 Supabase 查詢，避免僅變更標題但未篩選。
- 店家 own-OA 使用的顧客點餐連結保留 `tab=order`，不會在導入該店的 LIFF 時遺失。
- Webhook 文字指令與加入好友歡迎訊息同步加入「線上點餐／取餐」導引。
- 平台 OA 的 Reply API 僅提供自動功能導引，收到「客服」等文字時明確提示沒有客服中心或人工聊天室；`pushNotice` 嚴格只使用商家自有 OA 的 token，未綁定時回傳 `MERCHANT_OA_NOT_CONNECTED` 且不發送。
- 更新以上原始碼後，主分支的 `line-rich-menu.yml` 與 `line-oa-deploy.yml` 會自動發布；須以 Actions 成功紀錄與 LINE API 回讀確認已上線，**不能只憑原始碼提交判定 LINE 已修改**。
- OA Manager 外觀資料仍需有權限的人手動更新；測試需使用手機的 LINE 聊天視窗（電腦版不顯示圖文選單）。

## 2026-11-12 修正：不提供客服中心

先前圖文選單的「客服中心／聯絡平台」及機器人「留言等待人工客服」敘述未對應實際產品，已移除。顧客入口改為實際叫號看板搜尋；店家入口改為現有的入口分享教學。沒有後台客服系統及客服人員時，禁止對外承諾人工服務。

## 上次預約看板（最新調整）

- 這是**平台 LINE OA**，並沒有平台自己的叫號看板。使用者點「上次預約看板」後，開啟 `directory.html?mode=last-board`。
- 以已驗證的 LINE 帳號查 `so_my_last_booking_board()`，只取最近建立、未取消且未刪除的有效預約，並確認門市狀態及 queue、calling 已開啟，才開啟該店 `board.html?merchant=<slug>`。
- 沒有 LINE 授權時先引導登入；沒有預約、店家未啟用叫號或查詢失敗時保留頁面並提供「我的紀錄／搜尋店家」。
- 查詢資料庫權限由 RPC 依 `auth.uid()` 與經驗證 LINE 身分決定；不能由連結的 URL 自行指定其他顧客、LINE ID 或門市來查預約。

## 2026-11-13 統一搜尋頁導覽與 LINE OA

網站頂層只保留「搜尋店家」「我的預約／取號」。後者內有「我的紀錄」「現場取號」「上次預約看板」三個子選項。

| 入口 | 對應網址 |
| --- | --- |
| 我的預約／取號 | `directory.html?mode=mine` |
| 現場取號 | `directory.html?mode=mine&section=queue` |
| 上次預約看板 | `directory.html?mode=mine&section=board` |

原有 `directory.html?mode=queue` 與 `directory.html?mode=last-board` 仍可解析，以兼容既有連結；查詢個人紀錄與預約的權限不變。
## 2026-11-13 最新修正：顧客三種歷史紀錄

**此節取代前文關於「我的預約／取號」與「上次預約看板」的導覽規劃。** 網站搜尋頁頂層現在是「搜尋店家」與「我的紀錄」兩個選項。點入「我的紀錄」後，子選單固定為「預約紀錄」「取號紀錄」「訂單紀錄」，三者都是真實個人歷史，不是取號服務入口。平台 OA 也使用相同名稱與網址。

| 畫面／LINE OA | 目的地 | 資料來源 |
| --- | --- | --- |
| 我的紀錄 | `directory.html?mode=mine` | 預約紀錄（預設） |
| 預約紀錄 | `directory.html?mode=mine&section=reservation` | `so_my_platform_records('reservation')` |
| 取號紀錄 | `directory.html?mode=mine&section=ticket` | `so_my_platform_records('ticket')` |
| 訂單紀錄 | `directory.html?mode=mine&section=order` | `so_my_platform_records('order')` |

- 舊 `?mode=mine&section=queue` 兼容為「取號紀錄」。舊 `?mode=last-board` 與 `?mode=mine&section=board` 不再有看板入口，改顯示預約紀錄；不影響店家本身的公開叫號看板。
- 三種資料都以已驗證的 LINE 身分查詢；未登入先顯示 LINE 登入，不向其他顧客揭露資料；每筆紀錄可前往該筆門市的詳情。最多回傳最近 150 筆。
- 「現場取號」仍可從「搜尋店家」找到開放取號的門市，但不放在「我的紀錄」子選單中。

## 2026-11-13 最終導覽調整：同頁顯示全部紀錄

> 本節為最新規格，取代前文所有三個歷史子分頁、獨立訂單紀錄及取號紀錄 LINE OA 按鈕的敘述。

- 網站上層僅有「搜尋店家」與「我的紀錄」。點「我的紀錄」後，**同一頁往下依序展示預約紀錄、取號紀錄、訂單紀錄三個區塊**，不再有分類切換按鈕或三個不同網頁。
- 預約紀錄、取號紀錄與訂餐紀錄全部依同一個已驗證的 LINE 使用者查詢；前端並行呼叫 `so_my_platform_records` 三種 `p_kind`，每筆資訊可點進所屬店家的詳細畫面。無紀錄時保留對應區塊並顯示空狀態。
- LINE OA 顧客圖文選單中，**只有一個「我的紀錄」**（`directory.html?mode=mine`）；「取號紀錄」「訂單紀錄」兩個重複按鈕已取消，改為「現場取號」（找開放取號店家）及網站現有的「常見問題」（`home.html#faq`）。
- 舊 `directory.html?mode=mine&section=ticket`、`section=order` 和 `section=reservation` 均進同一頁、同時顯示三種紀錄；不再把分類當成不同網頁。
- 網站原有懸浮快捷按鈕（若有）不在本次修改範圍內，保持原樣。
