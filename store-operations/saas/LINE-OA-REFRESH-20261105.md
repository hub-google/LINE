# LINE 預約｜共用平台 OA 改版、部署與驗收（2026-11-05）

> 範圍：平台共用 OA（單一 OA 支援多商家）。商家自有 OA 的通知、Webhook 與 LIFF 維持各自 Provider/Channel，不覆蓋私有 OA 選單。

## 本次已提交的原始碼

- 圖文選單改為兩頁、各六個功能；頂部分頁以 LINE richmenuswitch 搭配別名切換，預設顯示顧客服務。
- 顧客：找店家預約、現場取號、我的紀錄、遊戲逛街、即時叫號、客服中心。
- 商家：商家開通、管理後台、預約與叫號、QR 立牌、操作教學、聯絡平台。
- 由 .github/scripts/publish_rich_menu.py 發布，line-rich-menu.yml 在 main 更新時驗證圖片、上傳兩個選單，回讀兩個 alias 與預設選單。
- 共用 OA 的 line-bridge Webhook 新增文字訊息導流及快捷按鈕，不在聊天端新增／修改預約或叫號資料，不跳過 LINE 身分驗證。
- 共用 OA 在新的 follow 事件（通過原本資料庫去重）且 LINE_PLATFORM_WELCOME_REPLY=true 時，使用 Reply API 回覆歡迎訊息；商家自有 OA 不發平台歡迎訊息，亦不接管其文字對話。
- 公開搜尋頁舊的失效 #activate 連結改指向實際商家申請頁 merchant-register.html。

## 平台 OA 品牌建議

**名稱：** LINE 預約服務平台。
**簡介：** 找店家、線上預約、現場取號、查看即時叫號。不同店家的服務由同一入口管理，預約與取號需先完成 LINE 身分驗證。
**歡迎文字：** 歡迎加入 LINE 預約服務平台！可以搜尋不同店家、線上預約、現場取號，也能查看自己的預約與號碼。需要操作時再驗證 LINE 身分，不必另外註冊網站帳密。
**頭貼、封面：** 沿用網站深綠、米白的共同品牌形象及日曆／號碼牌元素，勿採用某一家店或單一產業的圖片。

## 需要在 LINE OA Manager 人工核對

1. https://manager.line.biz/ 檢查顯示名稱、頭貼、封面、簡介。現有 Messaging API token 不能直接寫入這些資料。
2. **避免雙重歡迎：** 本次 LINE_PLATFORM_WELCOME_REPLY=true 會回覆首次 follow，因此需關閉 OA Manager 既有的加好友歡迎訊息；或者保留 Manager 歡迎訊息並將後端 LINE_PLATFORM_WELCOME_REPLY=false。兩者擇一。
3. 檢查 OA Manager 自動回應開關，避免與新文字指令機器人重複回應；人工客服是否啟用及值班時間仍需由平台管理員決定。
4. 以真實手機測試切換兩個圖文選單、首次加好友歡迎、文字訊息（預約、取號、我的紀錄、商家客服）、從 QR 掃碼登入返回原店、預約／叫號通知。
5. 電腦版 LINE 不顯示圖文選單；文字指令和網頁直連仍可用。

## 驗收區分

- 原始碼提交 ≠ 主分支已合併。
- 主分支合併 ≠ LINE API 已部署成功。
- LINE API 接受 ≠ 顧客實際收到通知。須再做真實手機 E2E。
- 圖文選單部署驗證：python3 -m unittest discover -s .github/scripts -p 'test_rich_menu.py' -v、LINE API 回讀兩個 alias。
- Webhook 驗證：node --test store-operations/tests/line-oa-bot-contract.test.mjs、部署 Edge Function 後再跑 HMAC 和 LINE 真實發送測試。
- 商家沒有 OA：共用 OA 引導；商家有 OA：既有各店 Provider/Token 保留且資料隔離。

## 本次沒有宣稱完成的部分

- OA Manager 的頭貼、封面、名稱、原有自動回覆開關，仍需有權限的帳號實際修改。
- 不新建 AI 自由問答、人工客服排班、商家 OA 管理權授權、商品金流等非原本的預約及取號功能。
- 未登入直接開啟店員後台或跨店紀錄仍須完成既有授權，不能藉 LINE 圖文選單繞過。
