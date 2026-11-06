"use client";

import { useEffect, useState } from "react";
import CustomerNav from "@/components/CustomerNav";
import { QrCode, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export default function CustomerQueuePage() {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 本地暫存票券 ID
  useEffect(() => {
    const savedTicketId = localStorage.getItem("my_active_ticket_id");
    if (savedTicketId) {
      fetchTicket(savedTicketId);
    }
  }, []);

  const fetchTicket = async (ticketId: string) => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/v1/queue/tickets/${ticketId}`);
      const data = await res.json();
      if (data.ticket) {
        setTicket(data.ticket);
      } else {
        localStorage.removeItem("my_active_ticket_id");
        setTicket(null);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const handleTakeTicket = async () => {
    setLoading(true);
    setError(null);
    try {
      // 示範以預設旗艦店進行取號
      const res = await fetch("/api/v1/branches/taipei-main/queue/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "LINE 自助取號" }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error.message);
      } else if (data.ticket) {
        setTicket(data.ticket);
        localStorage.setItem("my_active_ticket_id", data.ticket.id);
        fetchTicket(data.ticket.id);
      }
    } catch (err: any) {
      setError(err.message || "連線異常");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!ticket || !confirm("確定要取消此號碼牌嗎？")) return;
    try {
      await fetch(`/api/v1/queue/tickets/${ticket.id}/cancel`, { method: "POST" });
      localStorage.removeItem("my_active_ticket_id");
      setTicket(null);
    } catch (err: any) {
      alert(err.message || "取消失敗");
    }
  };

  return (
    <div className="app-viewport">
      {/* 頂部標題 */}
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 19 }}>現場候位取號</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>青禾風格美髮・台北旗艦店</p>
        </div>
        {ticket && (
          <button
            onClick={() => fetchTicket(ticket.id)}
            style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--primary)" }}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} /> 重新整理
          </button>
        )}
      </div>

      <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* 情況 A: 已有生效中的號碼牌 */}
        {ticket ? (
          <div className="card" style={{ textAlign: "center", padding: "28px 20px", border: "2px solid var(--primary)" }}>
            <span
              className={`badge ${
                ticket.status === "CALLED"
                  ? "badge-called"
                  : ticket.status === "SERVING"
                  ? "badge-serving"
                  : ticket.status === "PASSED"
                  ? "badge-passed"
                  : "badge-waiting"
              }`}
              style={{ fontSize: 13, padding: "6px 14px", marginBottom: 16 }}
            >
              {ticket.status === "CALLED"
                ? "🔔 輪到您了，請至櫃台！"
                : ticket.status === "SERVING"
                ? "✂️ 服務進行中"
                : ticket.status === "PASSED"
                ? "⚠️ 已過號 (請告知店員)"
                : "⏳ 等待候位中"}
            </span>

            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>您的專屬號碼</div>
            <div style={{ fontSize: 48, fontWeight: 900, color: "var(--text-main)", letterSpacing: 2, marginBottom: 8 }}>
              {ticket.displayNumber}
            </div>

            <div style={{ background: "var(--bg-main)", borderRadius: 12, padding: 14, margin: "16px 0", fontSize: 14, lineHeight: 1.8 }}>
              <div>{ticket.estimatedWaitText || "前方約 3 組等待中"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                取號時間：{new Date(ticket.joinedAt || Date.now()).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              我們會在即將輪到您的號碼時，透過 LINE 官方帳號推播提醒您。
            </p>

            {ticket.status === "WAITING" && (
              <button onClick={handleCancelTicket} className="btn btn-outline" style={{ width: "100%", color: "#ef4444", borderColor: "#fca5a5" }}>
                取消號碼牌
              </button>
            )}
          </div>
        ) : (
          /* 情況 B: 尚未取號，顯示取號 CTA */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 24,
                  background: "var(--primary-light)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--primary)",
                  marginBottom: 16,
                }}
              >
                <QrCode size={36} />
              </div>
              <h2 style={{ fontSize: 20, marginBottom: 6 }}>領取現場號碼牌</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
                點擊下方按鈕即可領取今日門市候位流水號
              </p>

              <button onClick={handleTakeTicket} disabled={loading} className="btn btn-primary btn-large" style={{ width: "100%" }}>
                {loading ? "正在為您產生號碼牌..." : "立即取號"}
              </button>
            </div>

            <div className="card" style={{ background: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                <Clock size={16} color="var(--primary)" /> 叫號與過號守則
              </div>
              <ul style={{ fontSize: 12, color: "var(--text-muted)", paddingLeft: 18, lineHeight: 1.8 }}>
                <li>每位顧客同時間僅能領取一張有效號碼牌。</li>
                <li>叫號連續三次未到將標記為過號。</li>
                <li>過號顧客回到現場後，由店員安排補插為下一位，不需重新重頭排隊。</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <CustomerNav />
    </div>
  );
}
