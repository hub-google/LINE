# Queue Monster｜排隊怪獸

**Git 專案識別名稱：`QueueMonster`**  
**對外英文品牌：Queue Monster**  
**中文名稱：排隊怪獸**

原「LINE 預約」專案，提供店家與顧客的線上預約、遠端取號、即時叫號與門市管理。

- [網站首頁](https://hub-google.github.io/LINE/booking/)
- [主要程式碼（店家／顧客網站）](../store-operations/saas/)
- [產品 README 與部署說明](../store-operations/saas/README.md)
- [系統產品需求文件（PRD）](../store-operations/saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md)
- [GitHub Pages 自動部署](../.github/workflows/line-saas-pages.yml)

## 目錄安排

`QueueMonster/` 是此產品的專屬 GitHub 入口。既有程式碼保留在 `store-operations/saas/`，讓正在使用的 GitHub Actions、測試、LINE LIFF、通知與公開網站連結無需因命名改動而中斷。

`LINE/` repository 同時包含其他獨立 LINE 產品，不能直接將整個 repository 改名為 QueueMonster。
