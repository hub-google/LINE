"use client";

import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { Users, PhoneCall, Check, Play, UserX, CornerDownRight, RefreshCw, AlertCircle } from "lucide-react";

export default function StaffQueuePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 取得登入狀態或使用示範 Session
  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/staff/branches/taipei-main/queue");
      const resData = await res.json();
      if (resData.error) {
        // 如果未登入，先自動以 mock staff 登入方便演示
        await autoLoginMockStaff();
      } else {
        setData(resData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const autoLoginMockStaff = async () => {
    try {
      const loginRes = await fetch("/api/v1/auth/line/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineAccessToken: "mock_demo_staff_01" }),
      });
      const loginData = await loginRes.json();
      if (loginData.sessionToken) {
        localStorage.setItem("session_token", loginData.sessionToken);
        const qRes = await fetch("/api/v1/staff/branches/taipei-main/queue", {
          headers: { Authorization: `Bearer ${loginData.sessionToken}` },
        });
        const qData = await qRes.json();
        if (qData) setData(qData);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000); // 5秒輪詢
    return () => clearInterval(interval);
  }, []);

  const getHeaders = () => {
    const token = localStorage.getItem("session_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleAction = async (endpoint: string, method = "POST") => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method, headers: getHeaders() });
      const resData = await res.json();
      if (resData.error) {
        setError(resData.error.message);
      } else {
        await fetchQueue();
      }
    } catch (err: any) {
      setError(err.message || "操作失敗");
    } finally {
      setActionLoading(false);
    }
  };

  const queue = data?.queue;
  const servingTicket = data?.serving || data?.called?.[0];

  return (
    <div className="staff-viewport">
      <StaffNav />

      <main style={{ padding: 20 }}>
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* 頂部叫號大控制板 (S04) */}
        <div className="card" style={{ marginBottom: 20, border: "2px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge badge-serving" style={{ fontSize: 13 }}>
                當前服務對象
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                佇列日期：{queue?.businessDate || new Date().toISOString().split("T")[0]}
              </span>
            </div>
            <button onClick={fetchQueue} style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "var(--primary)", fontSize: 13 }}>
              <RefreshCw size={14} className={loading ? "spin" : ""} /> 重新整理
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24, alignItems: "center" }}>
            {/* 當前號碼 */}
            <div style={{ textAlign: "center", borderRight: "1px solid var(--border)", paddingRight: 20 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                {servingTicket ? (servingTicket.status === "SERVING" ? "正在服務中" : "已呼叫・等待就位") : "目前無服務中顧客"}
              </div>
              <div style={{ fontSize: 64, fontWeight: 900, color: servingTicket ? "var(--primary)" : "var(--text-muted)", letterSpacing: 2 }}>
                {servingTicket ? servingTicket.displayNumber : "---"}
              </div>
              {servingTicket && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {servingTicket.user?.displayName || "現場散客"}
                </div>
              )}
            </div>

            {/* 大尺寸按鍵群組 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {/* 下一位 */}
              <button
                disabled={actionLoading || !queue}
                onClick={() => handleAction(`/api/v1/staff/queues/${queue?.id}/call-next`)}
                className="btn btn-primary"
                style={{ gridColumn: "span 3", padding: "16px", fontSize: 18, borderRadius: 12 }}
              >
                <PhoneCall size={22} /> 叫下一位號碼
              </button>

              {/* 再叫一次 */}
              <button
                disabled={actionLoading || !servingTicket}
                onClick={() => servingTicket && handleAction(`/api/v1/staff/tickets/${servingTicket.id}/recall`)}
                className="btn btn-secondary"
                style={{ padding: "12px" }}
              >
                <RefreshCw size={16} /> 再叫一次
              </button>

              {/* 開始服務 */}
              <button
                disabled={actionLoading || !servingTicket || servingTicket.status === "SERVING"}
                onClick={() => servingTicket && handleAction(`/api/v1/staff/tickets/${servingTicket.id}/start-service`)}
                className="btn btn-secondary"
                style={{ padding: "12px" }}
              >
                <Play size={16} /> 開始服務
              </button>

              {/* 完成服務 */}
              <button
                disabled={actionLoading || !servingTicket}
                onClick={() => servingTicket && handleAction(`/api/v1/staff/tickets/${servingTicket.id}/complete`)}
                className="btn btn-secondary"
                style={{ padding: "12px" }}
              >
                <Check size={16} /> 服務完成
              </button>

              {/* 標記過號 */}
              <button
                disabled={actionLoading || !servingTicket}
                onClick={() => servingTicket && handleAction(`/api/v1/staff/tickets/${servingTicket.id}/pass`)}
                className="btn btn-outline"
                style={{ gridColumn: "span 3", color: "#ef4444", borderColor: "#fca5a5", marginTop: 4 }}
              >
                <UserX size={16} /> 叫號未到・標記為過號 (移出當前等待)
              </button>
            </div>
          </div>
        </div>

        {/* 門市候位看板多欄分區 (S02) */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
          {/* 等待中佇列 */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={18} color="var(--primary)" /> 等待中候位名單
              </h2>
              <span className="badge badge-waiting">{data?.waitingQueue?.length || 0} 組</span>
            </div>

            {!data?.waitingQueue || data.waitingQueue.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>
                目前無等待中號碼
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.waitingQueue.map((item: any, idx: number) => (
                  <div
                    key={item.positionId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--bg-main)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text-muted)", minWidth: 20 }}>
                        #{idx + 1}
                      </span>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>{item.ticket.displayNumber}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {item.ticket.notes || "現場排隊"}
                        </div>
                      </div>
                    </div>

                    {item.insertedReason === "INSERT_NEXT" && (
                      <span className="badge" style={{ background: "#ffedd5", color: "#c2410c", fontSize: 11 }}>
                        過號回歸・下一位
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 過號名單 (具備安排下一位插單功能) */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <UserX size={18} color="#ef4444" /> 過號顧客名單
              </h2>
              <span className="badge badge-passed">{data?.passed?.length || 0} 組</span>
            </div>

            {!data?.passed || data.passed.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>
                今日尚無過號顧客
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.passed.map((item: any) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "#fef2f2",
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: "#991b1b" }}>{item.displayNumber}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        過號時間：{new Date(item.passedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* 過號回來插單按鈕 (關鍵解耦排序) */}
                    <button
                      disabled={actionLoading}
                      onClick={() => handleAction(`/api/v1/staff/tickets/${item.id}/insert-next`)}
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: 12, background: "#ffffff", border: "1px solid #fca5a5", color: "#b91c1c" }}
                    >
                      <CornerDownRight size={14} /> 安排下一位
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
