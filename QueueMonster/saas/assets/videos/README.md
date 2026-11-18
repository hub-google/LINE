# 排隊怪獸品牌介紹影片

此功能已接入首頁。影片不存在時不會彈窗，也不會顯示重播按鈕。

## 後補影片
將檔案上傳至 main 分支下的 QueueMonster/saas/assets/videos/intro.mp4。
請使用橫式 16:9 的 H.264 MP4，長度約 45 秒，建議 10–15 MB，檔案上限 25 MiB。
GitHub Actions 會自動複製影片並產生 assets/videos/intro-video.json。
無影片時 enabled 為 false；上傳正確的影片後 enabled 自動為 true，無須再次修改程式。
影片內容雜湊就是廣告版本號；替換影片會重置新版本的七日曝光紀錄。

## 行為
第一次進入行銷首頁的未登入訪客會看到可隨時跳過的靜音自動播放影片。
每個版本每七天最多自動顯示一次；手動重播不限次數。
已登入、LINE LIFF、帶有業務參數的深層連結與已開始操作頁面的訪客不自動顯示。
Esc / 背景點擊可關閉，原生播放器支援聲量、進度與全螢幕。
無影片時可開啟 home.html?intro_preview=1 查看開屏樣式，顯示明確的無影片預覽。

## 發布
main 更新 GitHub Pages 測試網站，release 更新 queue.monsterport.com 正式站。
建議先驗收測試站，再將 main 直接同步到 release；兩者程式相同而發布環境不同。
