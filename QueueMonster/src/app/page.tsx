"use client";

import Link from "next/link";
import { Users, QrCode, Calendar, ShoppingBag, ShieldCheck, CreditCard, ChevronRight } from "lucide-react";

export default function HomePage() {
  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "#06c755",
            color: "#fff",
            marginBottom: 16,
          }}
        >
          <QrCode size={36} />
        </div>
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>LINE 門市整合營運系統</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
          預約時段・現場取號・即時叫號・點餐加點・LINE Pay 整合
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 消費者端 入口 */}
        <div className="card" style={{ borderLeft: "5px solid #06c755" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span className="badge" style={{ background: "#e8f9ed", color: "#06c755", marginBottom: 6 }}>
                LIFF 消費者入口
              </span>
              <h2 style={{ fontSize: 18 }}>顧客服務中心</h2>
            </div>
            <Link href="/c" className="btn btn-primary" style={{ padding: "8px 16px" }}>
              進入體驗 <ChevronRight size={16} />
            </Link>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            透過 LINE 官方帳號 Rich Menu 或門口 QR Code 開啟，支援手機全螢幕原生體驗。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <Link href="/c/queue" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <QrCode size={15} color="#06c755" /> 現場取號與看號
            </Link>
            <Link href="/c/reserve" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={15} color="#06c755" /> 預約時段防超賣
            </Link>
            <Link href="/c/order" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <ShoppingBag size={15} color="#06c755" /> 菜單點購與 LINE Pay
            </Link>
            <Link href="/c/my" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <CreditCard size={15} color="#06c755" /> 我的票夾與訂單明細
            </Link>
          </div>
        </div>

        {/* 店員與管理端 入口 */}
        <div className="card" style={{ borderLeft: "5px solid #3b82f6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8", marginBottom: 6 }}>
                Staff & Admin Portal
              </span>
              <h2 style={{ fontSize: 18 }}>門市現場營運與叫號看板</h2>
            </div>
            <Link href="/s" className="btn btn-secondary" style={{ padding: "8px 16px" }}>
              管理後台 <ChevronRight size={16} />
            </Link>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            供櫃台店員與主管使用的觸控式叫號看板，具備過號插單、現場現金收款與員工邀請機制。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <Link href="/s" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={15} color="#3b82f6" /> 叫號控制台 (下一位/過號)
            </Link>
            <Link href="/s/orders" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <CreditCard size={15} color="#3b82f6" /> 訂單細項與現場收款
            </Link>
            <Link href="/s/reservations" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={15} color="#3b82f6" /> 預約到店 Check-in
            </Link>
            <Link href="/s/staff" style={{ color: "#0f172a", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={15} color="#3b82f6" /> 員工安全邀請 (QR/Token)
            </Link>
          </div>
        </div>

        {/* 系統規格與環境檢視 */}
        <div className="card" style={{ background: "#f8fafc" }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>📋 系統規範與權限設定現況</h3>
          <ul style={{ fontSize: 13, color: "var(--text-muted)", paddingLeft: 18, lineHeight: 1.8 }}>
            <li>依據 <code>系統需求書v2.md</code> 開發，號碼與順序完全解耦，支援過號插單。</li>
            <li>金流採用項目級分配 (Payment Allocation)，精確追蹤每一筆服務付款。</li>
            <li>所有 LINE 憑證與權限均已詳列於 <code>.env</code> 與 <code>.env.example</code>。</li>
            <li>目前處於 <code>MOCK_LINE_SERVICES=true</code> 開發測試模式，填入正式 Key 後可直接無縫切換正式連線。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
