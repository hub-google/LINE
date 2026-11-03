# Chance — 可操作微型商業產品

從「商業機會（每日爬取）」285筆研究選出的十個 Web MVP。每個產品是自己的資料夾，內含 `index.html` 與 `PRD.md`。

**總入口**：https://hub-google.github.io/Chance/ （須先啟用 GitHub Pages 並完成部署）

| 商機編號 | 產品 | 網站 | PRD |
| --- | --- | --- | --- |
| 20261020-001 | 接案交付與請款管理 | [開啟](https://hub-google.github.io/Chance/invoice-proof/) | [PRD](invoice-proof/PRD.md) |
| 20261022-006 | 訂製商品分期收款控管 | [開啟](https://hub-google.github.io/Chance/custom-order-payments/) | [PRD](custom-order-payments/PRD.md) |
| 20261024-005 | 整箱單包庫存換算工具 | [開啟](https://hub-google.github.io/Chance/carton-inventory/) | [PRD](carton-inventory/PRD.md) |
| 20261024-008 | 企業 SaaS 續費與閒置席次盤點 | [開啟](https://hub-google.github.io/Chance/saas-renewal-audit/) | [PRD](saas-renewal-audit/PRD.md) |
| 20261024-014 | 多據點飲水機保養台帳 | [開啟](https://hub-google.github.io/Chance/filter-service/) | [PRD](filter-service/PRD.md) |
| 20261028-006 | 信用卡拒付證據整理器 | [開啟](https://hub-google.github.io/Chance/chargeback-evidence/) | [PRD](chargeback-evidence/PRD.md) |
| 20261028-009 | 公共工程開口契約額度控管 | [開啟](https://hub-google.github.io/Chance/contract-work-orders/) | [PRD](contract-work-orders/PRD.md) |
| 20261028-014 | 短租房源每單淨利計算 | [開啟](https://hub-google.github.io/Chance/shortstay-profit/) | [PRD](shortstay-profit/PRD.md) |
| 20261028-023 | 停車場標租投報初篩 | [開啟](https://hub-google.github.io/Chance/parking-roi/) | [PRD](parking-roi/PRD.md) |
| 20261102-018 | 自助洗衣店頂讓回本試算 | [開啟](https://hub-google.github.io/Chance/laundry-payback/) | [PRD](laundry-payback/PRD.md) |

## 功能

十個工具均已具備實際新增、修改、刪除、搜尋、計算、CSV 匯出、JSON 備份與還原、列印／PDF。資料儲存在使用者瀏覽器本機，**尚無後端登入、多人協作、跨裝置同步與正式收費系統**。所有定價皆屬待驗證的市場假設。

## 部署

在 GitHub repository Settings → Pages → Build and deployment → Source 選取 **GitHub Actions**。此倉庫的 `.github/workflows/deploy-pages.yml` 會在 push 到 main 時發佈；也可 Actions 手動執行 `workflow_dispatch`。

## 架構

`assets/engine.js` 是共用的安全單機 CRUD／計算引擎，`assets/site.css` 是共用 responsive 樣式。產品差異使用各自 `index.html` 中的結構化設定與專屬公式，保存鍵值按產品隔離。此結構為靜態 MVP，後續需替換為經驗證的租戶隔離後端再對外營利。

## 來源

[Google Sheet 商機來源](https://docs.google.com/spreadsheets/d/103uxu5VmnDj7WBrByD9vjpLgauy8-M6uZXqDSnWk7tI/edit?gid=1377271577)，採用研究資料但不代表已獲市場付費驗證。請參閱各 PRD。
