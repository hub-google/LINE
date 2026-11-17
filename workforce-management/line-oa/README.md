# 工作怪獸｜每天都能在 LINE 找到的固定入口

2026-11-17

## 核心方案

**LINE MINI App 不會自動建立 LINE Official Account，也不會自動出現在與 OA 的聊天清單**。QR Code 只當一次性導流、貼在公司內部公告，不是每日員工打卡入口。

- **固定入口**：建立一個獨立「工作怪獸」LINE OA，員工加入好友後，從與 OA 的聊天室底部圖文選單進入 MINI App。
- **使用介面**：原本獨立的 `/LINE/workforce-mini/`，仍使用既有 Supabase 資料庫、員工權限和表單。
- **後續進階**：通過 Verified MINI App 認證後，可以提供 LINE 官方「加入手機主畫面」捷徑；未認證 Published 不能依賴該功能。台灣 LINE 的 MINI App「收藏」功能不適用於日本以外區域；不要拿它當員工入口。
- **原本網頁**：`/LINE/workforce/` 繼續獨立提供桌面版和公開 Demo，不改成 MINI App。

官方文件：[MINI App 連 LINE OA 圖文選單](https://developers.line.biz/en/docs/line-mini-app/service/line-mini-app-oa/)、
[MINI App 主畫面捷徑限制](https://developers.line.biz/en/docs/line-mini-app/develop/add-to-home-screen/)。

## 工作怪獸 LINE OA Rich Menu（六格）

圖文選單圖片：**2500 × 1686 PNG**，需提供對應的 image 檔。此倉庫提供 JSON 區域設定：
- `line-oa/rich-menu.developing.json`：只有經授權的 LINE Developers 測試人員可使用，不能給一般員工。
- `line-oa/rich-menu.published.json`：LINE MINI App Published 狀態可正常開啟後，給一般員工的正式選單。

| 畫面格子 | 入口 | 發布後 URI |
|---|---|---|
| 左上 | 上下班打卡 | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=punch |
| 中上 | 我的班表 | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=schedule |
| 右上 | 差勤申請 | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=requests |
| 左下 | 通知紀錄 | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=inbox |
| 中下 | 工作總覽 | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=overview |
| 右下 | 審核中心（主管專用） | https://miniapp.line.me/2012649406-KzlLEZT6/?tab=approvals |

**重要**：在 Rich Menu 選擇 **URI 動作**時，請填寫上面 `miniapp.line.me` 的正式 LINE MINI App 連結，**不要填寫** GitHub Pages 網頁 URL。透過 Rich Menu 開啟 MINI App 時，query parameter `tab` 會在 `liff.init()` 後還原；WF 會在還原後切換到對應畫面，其他 tab 名稱忽略。權限仍然由後端驗證，點「審核中心」不會授予員工主管權限。

[官方永久連結說明](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/)｜[LIFF 初始化後再讀取參數](https://developers.line.biz/en/tips/2026/07/16/liff-url-additional-info/)

## LINE OA Manager（需要 OA 擁有者執行）

1. 開啟 [LINE Official Account Manager](https://manager.line.biz/)，建立獨立「工作怪獸」OA，**不可直接改排隊怪獸的 OA 圖文選單**。若已有專用 OA，直接選它。
2. 進入「圖文選單」→「建立」，選擇寬圖 **2500 × 1686，六區塊（3 欄 × 2 列）**。上傳對應 PNG 圖片。
3. 按上表將六格設定成 **開啟連結（URI）**，填入 Published 的 MINI App URL。設為「顯示」並發布。如果目前 Published 尚未正式開放，先不要向全體員工公開這六格；內部測試使用 Developing JSON。
4. 員工加入「工作怪獸」OA 好友，只需一次。以後每天打開與「工作怪獸」的 LINE 對話，從下方選單選「上下班打卡」，關閉後再進入也不必掃 QR。
5. 若要讓 MINI App 在首次授權時引導加入 OA：LINE Developers → MINI App → Basic settings → Linked LINE Official Account 選工作怪獸 OA；Web app settings → Add friend option 開啟。此功能須同 Provider、有 Messaging API 連結及管理權限，非強制。

**不需拿聊天推播做打卡入口**：Rich Menu 不因員工點擊而消耗 OA 的推播訊息額度。若後續需要實際推播，再另外依配額評估。

## 每日免重打密碼不是同一件事

目前 WF 為了避免權限殘留，企業登入工作階段仍保存在 `sessionStorage`。LINE WebView 關閉、OS 回收後可能遺失，因此即使 Rich Menu 固定存在，也**不能保證下次完全免登入**。要達到長期免密碼，仍需完成安全的 LINE 身分映射與伺服器端登入簽發、登出、停用員工立即撤銷及裝置安全測試；在此之前**不能用客戶端 userId 就直接通過企業身分認證**。切勿僅為了省一次登入就取消 Supabase 權限檢查。

## 手機驗收

- 在手機 LINE 中從工作怪獸 OA 的 Rich Menu 開啟 **發布後的** MINI App，確認在 LINE 裡而非外部瀏覽器。
- 檢查首次登入、下一次關閉重開、點打卡直達打卡頁、不同角色的審核權限、LINE 身分綁定及 GPS 授權。
- 測試 iOS／Android、登入失效、員工離職、跨公司、拒絕位置權限。
