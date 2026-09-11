# LINE 應用與整合生態系專案集 (LINE Ecosystem Projects)

本專案集收錄了針對 LINE 平台開發的多個整合與自動化應用系統，涵蓋商業門市營運、群組自動化管理及 LINE Pay 定期支付等解決方案。

---

## 專案架構概覽

```text
LINE/
├── LINE群組管理/          # LINE 門市營運與群組服務系統 (Next.js + Prisma)
├── LINE退群/              # LINE 桌面端自動退群與白名單管理工具 (Python + GUI)
└── 定期支付/              # LINE Pay 定期扣款助理與需求規劃 (Next.js + LINE Pay)
```

---

## 子專案詳細介紹

### 1. LINE群組管理 (LINE Store & Group Operations)
- **技術棧**：Next.js, TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL
- **主要功能**：
  - LINE Login & LIFF 身分驗證與顧客端/商家端權限劃分 (RBAC)
  - 門市現場排隊取號與即時叫號狀態更新
  - 線上預約時段管理與可用額度動態計算
  - LINE Pay 結帳流程串接與冪等性 (Idempotency) 保障
  - LINE Messaging API 推播通知與多角色圖文選單 (Rich Menu) 切換

### 2. LINE退群 (LINE Group Batch Leave & Auto-Manager)
- **技術棧**：Python 3, Tkinter GUI, PyAutoGUI, Windows UI Automation
- **主要功能**：
  - LINE 電腦版群組掃描與批次自動退出
  - 核心重要群組白名單 (Whitelist) 機制，防止誤退重要群組
  - 退群頻率限制 (Rate Limiting) 與防封號保護
  - 操作審計日誌 (Audit Log) 與 CSV 記錄匯出
  - 支援 Windows 獨立執行檔 (.exe) 打包

### 3. 定期支付 (LINE Pay Recurring Payment Assistant)
- **技術棧**：Next.js, TypeScript, Prisma, LINE Pay Online API v4
- **主要功能**：
  - 定期訂閱/週期性專案繳費管理
  - LINE Pay 預約扣款與自動定期扣款授權機制
  - 週期性 Cron 排程發送繳費提醒通知
  - 完整交易狀態機追蹤與付款結果確認回呼

---

## 授權說明
本專案集僅供作品展示與學習交流使用。
