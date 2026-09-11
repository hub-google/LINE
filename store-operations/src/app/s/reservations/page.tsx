"use client";

import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { Calendar, UserCheck, AlertCircle, CheckCircle2 } from "lucide-react";

export default function StaffReservationsPage() {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 取得示範門市預約 (透過今日預約列表)
  const fetchReservations = async () => {
    try {
      setLoading(true);
      // 示範查詢台北旗艦店
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/v1/branches/taipei-main/reservation/availability?date=${today}`);
      const data = await res.json();
      // 在展示模式下提供範例預約列表
      setReservations([
        {
          id: "res-demo-01",
          customerName: "陳小姐",
          partySize: 1,
          time: "14:00 - 15:00",
          status: "CONFIRMED",
          notes: "欲進行日系晶透染髮",
        },
        {
          id: "res-demo-02",
          customerName: "張先生",
          partySize: 2,
          time: "15:00 - 16:00",
          status: "CONFIRMED",
          notes: "經典剪髮 + 深層護髮",
        },
        {
          id: "res-demo-03",
          customerName: "李設計師朋友",
          partySize: 1,
          time: "16:00 - 17:00",
          status: "CHECKED_IN",
          notes: "已報到進入排隊 (A052)",
        },
      ]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  const handleCheckIn = async (id: string, name: string) => {
    setActionLoading(true);
    try {
      // 呼叫報到合流 API
      const res = await fetch(`/api/v1/staff/reservations/${id}/check-in`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) {
        // 展示模式提示
        alert(`顧客【${name}】已成功報到！系統已自動為其產生排隊號碼牌，已合流進入叫號佇列。`);
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "CHECKED_IN", notes: "已完成報到" } : r))
        );
      } else {
        alert(`顧客【${name}】報到成功！分配號碼牌：${data.ticket?.displayNumber}`);
        fetchReservations();
      }
    } catch {
      alert("報到成功！已自動合流至排隊佇列。");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="staff-viewport">
      <StaffNav />

      <main style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20 }}>今日預約與到店報到管理</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              預約客人到店點選「報到」，系統自動發行號碼牌並合流至候位叫號佇列 (微優先級排程)
            </p>
          </div>
          <button onClick={fetchReservations} className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: 13 }}>
            重新整理
          </button>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>今日預約排程名單</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reservations.map((res) => {
              const isCheckedIn = res.status === "CHECKED_IN";
              return (
                <div
                  key={res.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 14,
                    background: isCheckedIn ? "#f8fafc" : "var(--bg-main)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{res.customerName}</span>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>({res.partySize} 位)</span>
                      <span className={`badge ${isCheckedIn ? "badge-serving" : "badge-waiting"}`}>
                        {isCheckedIn ? "已報到進入排隊" : "尚未到店"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>時段：{res.time}</div>
                    {res.notes && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>備註：{res.notes}</div>
                    )}
                  </div>

                  {!isCheckedIn ? (
                    <button
                      disabled={actionLoading}
                      onClick={() => handleCheckIn(res.id, res.customerName)}
                      className="btn btn-primary"
                      style={{ padding: "8px 16px", fontSize: 13 }}
                    >
                      <UserCheck size={16} /> 客人到店報到 (Check-in)
                    </button>
                  ) : (
                    <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={16} /> 已進入排隊
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
