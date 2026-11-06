"use client";

import { useEffect, useState } from "react";
import CustomerNav from "@/components/CustomerNav";
import { User, QrCode, Calendar, ShoppingBag, CreditCard, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function CustomerMyPage() {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem("my_active_ticket_id");
    if (saved) {
      setActiveTicketId(saved);
      fetch(`/api/v1/queue/tickets/${saved}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ticket) setTicket(data.ticket);
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="app-viewport">
      <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--primary-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary)",
          }}
        >
          <User size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: 18 }}>LINE 顧客專區</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>個人票夾・預約紀錄・項目級帳單明細</p>
        </div>
      </div>

      <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 目前生效中票券 */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <QrCode size={16} color="var(--primary)" /> 現場候位號碼牌
            </span>
            {ticket && (
              <span className={`badge ${ticket.status === "CALLED" ? "badge-called" : "badge-waiting"}`}>
                {ticket.status}
              </span>
            )}
          </div>

          {ticket ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "var(--primary)" }}>{ticket.displayNumber}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ticket.estimatedWaitText}</div>
              </div>
              <Link href="/c/queue" className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: 12 }}>
                查看進度 <ChevronRight size={14} />
              </Link>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontSize: 13 }}>
              目前沒有進行中的排隊號碼牌
              <div style={{ marginTop: 8 }}>
                <Link href="/c/queue" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>
                  立即取號
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* 示範項目級付款帳單卡片 (Item-Level Payment) */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <ShoppingBag size={16} color="#3b82f6" /> 訂單與品項付款狀態 (Item-Level)
            </span>
            <span className="badge badge-partially">部分付款 (PARTIALLY_PAID)</span>
          </div>

          <div style={{ background: "var(--bg-main)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>經典男女剪髮</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>$600</span>
                <span className="badge badge-paid" style={{ fontSize: 10 }}>已付 (LINE Pay)</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>深層水潤角蛋白護髮</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>$800</span>
                <span className="badge badge-paid" style={{ fontSize: 10 }}>已付 (LINE Pay)</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>日系晶透冷暖染髮 (現場追加)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>$2,000</span>
                <span className="badge badge-unpaid" style={{ fontSize: 10 }}>未付款</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>頭皮舒壓 SPA (加購)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>$500</span>
                <span className="badge badge-unpaid" style={{ fontSize: 10 }}>未付款</span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>待付款差額</span>
              <span style={{ color: "#ef4444" }}>NT$ 2,500</span>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Link href="/c/order" className="btn btn-primary" style={{ flex: 1, padding: "8px 12px", fontSize: 13, textDecoration: "none" }}>
              <CreditCard size={15} /> 支付未付差額
            </Link>
          </div>
        </div>

        {/* 預約紀錄 */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={16} color="#d97706" /> 我的預約
            </span>
            <Link href="/c/reserve" style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none" }}>
              預約新時段
            </Link>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            您在台北大安旗艦店預約確認後，將於此處即時列出報到憑據。
          </p>
        </div>
      </div>

      <CustomerNav />
    </div>
  );
}
