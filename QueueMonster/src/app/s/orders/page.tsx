"use client";

import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { CreditCard, Plus, CheckCircle2, AlertCircle, ShoppingBag } from "lucide-react";

export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [selectedAddItem, setSelectedAddItem] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/staff/orders?branchId=taipei-main");
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/v1/branches/taipei-main/catalog");
      const data = await res.json();
      if (data.items) setCatalogItems(data.items);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCatalog();
  }, []);

  // 現場現金結帳
  const handleCashPayment = async (orderId: string, orderItemIds: string[]) => {
    try {
      const res = await fetch(`/api/v1/staff/orders/${orderId}/payments/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemIds,
          paymentMethod: "CASH",
        }),
      });

      const data = await res.json();
      if (data.error) {
        alert(data.error.message);
      } else {
        alert("現場現金收款成功！已標記品項為已付款。");
        fetchOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(data.order);
        }
      }
    } catch (err: any) {
      alert(err.message || "收款失敗");
    }
  };

  // 現場追加品項
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !selectedAddItem) return;

    try {
      const res = await fetch(`/api/v1/orders/${selectedOrder.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ catalogItemId: selectedAddItem, quantity: 1 }],
        }),
      });

      const data = await res.json();
      if (data.error) {
        alert(data.error.message);
      } else {
        alert("追加品項成功！應付差額已即時更新。");
        setSelectedOrder(data.order);
        fetchOrders();
      }
    } catch (err: any) {
      alert(err.message || "追加失敗");
    }
  };

  return (
    <div className="staff-viewport">
      <StaffNav />

      <main style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20 }}>門市訂單與收款管理</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              支援項目級付款 (Item-Level)・現場追加服務・現金/刷卡手動核銷
            </p>
          </div>
          <button onClick={fetchOrders} className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: 13 }}>
            重新整理
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
          {/* 左側：訂單清單 */}
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>今日訂單列表</h2>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                目前尚無訂單紀錄
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {orders.map((o) => {
                  const isSelected = selectedOrder?.id === o.id;
                  return (
                    <div
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        border: isSelected ? "2px solid #3b82f6" : "1px solid var(--border)",
                        background: isSelected ? "#eff6ff" : "var(--bg-main)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{o.orderNumber}</span>
                        <span
                          className={`badge ${
                            o.status === "PAID"
                              ? "badge-paid"
                              : o.status === "PARTIALLY_PAID"
                              ? "badge-partially"
                              : "badge-unpaid"
                          }`}
                        >
                          {o.status === "PAID" ? "已結清" : o.status === "PARTIALLY_PAID" ? "部分付款" : "待付款"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                        <span>品項合計：{o.items?.length || 0} 項</span>
                        <span>
                          已付 <strong>${o.paidTotal}</strong> / 待付{" "}
                          <strong style={{ color: o.dueTotal > 0 ? "#ef4444" : "inherit" }}>${o.dueTotal}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右側：選定訂單細項與現場收款 (S06) */}
          <div className="card">
            {selectedOrder ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h2 style={{ fontSize: 16 }}>訂單細項 ({selectedOrder.orderNumber})</h2>
                  <span className="badge badge-waiting">總計: NT$ {selectedOrder.subtotal}</span>
                </div>

                {/* 各品項 Item-Level 狀態 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {selectedOrder.items?.map((item: any) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 10,
                        background: "var(--bg-main)",
                        borderRadius: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.nameSnapshot}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          ${item.unitPrice} × {item.quantity} = ${item.totalAmount}
                        </div>
                      </div>
                      <span className={`badge ${item.paymentStatus === "PAID" ? "badge-paid" : "badge-unpaid"}`}>
                        {item.paymentStatus === "PAID" ? "已付款" : "未付款"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 現場追加品項表單 */}
                <form onSubmit={handleAddItem} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Plus size={15} color="var(--primary)" /> 現場追加服務／加購品項
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={selectedAddItem}
                      onChange={(e) => setSelectedAddItem(e.target.value)}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">-- 請選擇追加品項 --</option>
                      {catalogItems.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} (${cat.price})
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={!selectedAddItem} className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: 13 }}>
                      追加
                    </button>
                  </div>
                </form>

                {/* 現場現金核銷按鈕 */}
                {selectedOrder.dueTotal > 0 ? (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                      <span>尚待收取現金：</span>
                      <strong style={{ fontSize: 18, color: "#ef4444" }}>NT$ {selectedOrder.dueTotal}</strong>
                    </div>

                    <button
                      onClick={() => {
                        const unpaidIds = selectedOrder.items
                          .filter((i: any) => i.paymentStatus === "UNPAID")
                          .map((i: any) => i.id);
                        handleCashPayment(selectedOrder.id, unpaidIds);
                      }}
                      className="btn btn-primary"
                      style={{ width: "100%", padding: 12 }}
                    >
                      <CreditCard size={18} /> 收取全額待付現金 (NT$ {selectedOrder.dueTotal})
                    </button>
                  </div>
                ) : (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, textAlign: "center", color: "#16a34a", fontSize: 14, fontWeight: 700 }}>
                    <CheckCircle2 size={24} style={{ marginBottom: 4 }} />
                    <div>此訂單所有品項均已結清！</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 14 }}>
                請點選左側訂單檢視品項級明細與收款
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
