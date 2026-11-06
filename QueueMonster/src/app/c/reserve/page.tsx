"use client";

import { useEffect, useState } from "react";
import CustomerNav from "@/components/CustomerNav";
import { Calendar, Clock, User, Phone, CheckCircle2, AlertCircle } from "lucide-react";

export default function CustomerReservationPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [loading, setLoading] = useState(false);
  const [successReservation, setSuccessReservation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]);

  const fetchSlots = async (date: string) => {
    try {
      const res = await fetch(`/api/v1/branches/taipei-main/reservation/availability?date=${date}`);
      const data = await res.json();
      if (data.slots) setSlots(data.slots);
    } catch {
      // ignore
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotId || !customerName) {
      setError("請選取預約時段並填寫姓名");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: "taipei-main",
          slotId: selectedSlotId,
          customerName,
          customerPhone,
          partySize,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error.message);
      } else if (data.reservation) {
        setSuccessReservation(data.reservation);
      }
    } catch (err: any) {
      setError(err.message || "預約失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-viewport">
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 19 }}>預約服務時段</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>線上預約・到店免排隊自動報到</p>
      </div>

      <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {successReservation ? (
          <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ color: "var(--primary)", marginBottom: 12, display: "inline-flex" }}>
              <CheckCircle2 size={56} />
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>預約成功！</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              我們已收到您的預約，並會於預約前透過 LINE 發送提醒通知。
            </p>

            <div style={{ background: "var(--bg-main)", borderRadius: 12, padding: 16, textAlign: "left", fontSize: 13, lineHeight: 2, marginBottom: 20 }}>
              <div><strong>預約姓名：</strong> {successReservation.customerName}</div>
              <div><strong>預約人數：</strong> {successReservation.partySize} 位</div>
              <div><strong>狀態：</strong> <span className="badge badge-serving">已確認 (CONFIRMED)</span></div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                💡 到店當日向店員告知姓名或掃描門市 QR Code 即可一鍵報到！
              </div>
            </div>

            <button onClick={() => setSuccessReservation(null)} className="btn btn-secondary" style={{ width: "100%" }}>
              繼續預約其他時段
            </button>
          </div>
        ) : (
          <form onSubmit={handleBooking} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 選擇日期 */}
            <div className="card">
              <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Calendar size={16} color="var(--primary)" /> 選擇預約日期
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
              />
            </div>

            {/* 選擇時段 */}
            <div className="card">
              <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Clock size={16} color="var(--primary)" /> 選擇時段 (容量即時防超賣)
              </label>
              {slots.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                  本日暫無開放可預約時段
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {slots.map((s) => {
                    const time = new Date(s.startAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
                    const isSelected = selectedSlotId === s.id;
                    return (
                      <button
                        type="button"
                        key={s.id}
                        disabled={s.isFull}
                        onClick={() => setSelectedSlotId(s.id)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: isSelected ? "var(--primary-light)" : s.isFull ? "#f1f5f9" : "#ffffff",
                          color: s.isFull ? "#94a3b8" : "inherit",
                          cursor: s.isFull ? "not-allowed" : "pointer",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{time}</div>
                        <div style={{ fontSize: 11, color: s.isFull ? "#ef4444" : "var(--text-muted)" }}>
                          {s.isFull ? "已額滿" : `餘額 ${s.availableCount} 名`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 客戶聯絡資料 */}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>姓名</label>
                <input
                  type="text"
                  required
                  placeholder="請輸入您的姓名"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>電話 (選填)</label>
                <input
                  type="tel"
                  placeholder="0912-345-678"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>人數</label>
                <select
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value))}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                >
                  <option value={1}>1 位</option>
                  <option value={2}>2 位</option>
                  <option value={3}>3 位</option>
                  <option value={4}>4 位以上</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-large" style={{ width: "100%" }}>
              {loading ? "正在確認預約名額..." : "確認送出預約"}
            </button>
          </form>
        )}
      </div>

      <CustomerNav />
    </div>
  );
}
