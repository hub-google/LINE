"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CustomerNav from "@/components/CustomerNav";
import { QrCode, Calendar, ShoppingBag, Clock, ChevronRight } from "lucide-react";

export default function CustomerHomePage() {
  const [storeInfo, setStoreInfo] = useState<{
    branchName: string;
    isOpen: boolean;
    currentCalling: string;
    waitingCount: number;
    estimatedWaitText: string;
  } | null>(null);

  useEffect(() => {
    // 預設抓取示範台北旗艦店公開狀態 (若尚未有資料顯示預設)
    fetch("/api/v1/branches/taipei-main-placeholder/queue/public-status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setStoreInfo(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-viewport">
      {/* 門市頂部 Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #06c755 0%, #059669 100%)",
          color: "#fff",
          padding: "24px 20px 30px",
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, background: "rgba(255,255,255,0.2)", padding: "4px 10px", borderRadius: 20 }}>
            🟢 營業中・現場開放取號
          </span>
          <Link href="/" style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, textDecoration: "none" }}>
            回首頁
          </Link>
        </div>
        <h1 style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>青禾風格美髮沙龍</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>台北大安旗艦店 (忠孝東路四段100號)</p>
      </div>

      <div style={{ padding: "0 16px", marginTop: -18, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 即時排隊概況快照卡片 */}
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>目前叫號</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)" }}>
              {storeInfo?.currentCalling || "A050"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>前方等待組數</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{storeInfo?.waitingCount ?? 6} 組</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {storeInfo?.estimatedWaitText || "預估約 20–30 分鐘"}
            </div>
          </div>
        </div>

        {/* 核心快捷入口卡片 */}
        <Link
          href="/c/queue"
          className="card"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 16,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "var(--primary-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <QrCode size={26} color="var(--primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, marginBottom: 2 }}>現場線上取號</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>無須在店門口罰站，接近叫號 LINE 自動通知</p>
          </div>
          <ChevronRight size={18} color="var(--text-muted)" />
        </Link>

        <Link
          href="/c/reserve"
          className="card"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 16,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Calendar size={26} color="#3b82f6" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, marginBottom: 2 }}>預約日期與時段</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>提前預約指定時段，到店一鍵報到免等待</p>
          </div>
          <ChevronRight size={18} color="var(--text-muted)" />
        </Link>

        <Link
          href="/c/order"
          className="card"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 16,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShoppingBag size={26} color="#d97706" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, marginBottom: 2 }}>線上點單・LINE Pay</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>剪髮／護髮／染髮線上選購，到店追加也能結</p>
          </div>
          <ChevronRight size={18} color="var(--text-muted)" />
        </Link>

        {/* 溫馨提醒 */}
        <div className="card" style={{ background: "#f8fafc", marginTop: 4, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            <Clock size={16} color="var(--primary)" /> 門市叫號說明
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            過號顧客若回到現場，店員可為您安排下一位優先叫號，不會將您的號碼作廢，請直接告知櫃台。
          </p>
        </div>
      </div>

      <div style={{ height: 20 }} />
      <CustomerNav />
    </div>
  );
}
