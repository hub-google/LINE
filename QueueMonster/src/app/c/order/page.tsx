"use client";

import { useEffect, useState } from "react";
import CustomerNav from "@/components/CustomerNav";
import { Plus, Minus, ShoppingBag, CreditCard, AlertCircle } from "lucide-react";

export default function CustomerOrderPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/branches/taipei-main/catalog")
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setItems(data.items);
      })
      .catch(() => {});
  }, []);

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const totalItemsCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalAmount = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = items.find((i) => i.id === itemId);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const handleCheckout = async () => {
    if (totalItemsCount === 0) return;
    setLoading(true);
    setError(null);

    try {
      // 1. 建立訂單
      const orderItems = Object.entries(cart).map(([catalogItemId, quantity]) => ({
        catalogItemId,
        quantity,
      }));

      const orderRes = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: "taipei-main",
          items: orderItems,
        }),
      });

      const orderData = await orderRes.json();
      if (orderData.error) throw new Error(orderData.error.message);

      const orderId = orderData.order.id;
      const unpaidItemIds = orderData.order.items.map((i: any) => i.id);

      // 2. 發起 LINE Pay 付款請求
      const payRes = await fetch(`/api/v1/orders/${orderId}/payments/line-pay/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemIds: unpaidItemIds }),
      });

      const payData = await payRes.json();
      if (payData.error) throw new Error(payData.error.message);

      // 3. 跳轉至 LINE Pay 授權網址 (沙盒模擬或正式付款頁)
      window.location.href = payData.paymentUrl;
    } catch (err: any) {
      setError(err.message || "結帳失敗");
      setLoading(false);
    }
  };

  return (
    <div className="app-viewport">
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 19 }}>服務與品項選購</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>線上選單・支援 LINE Pay 安全結帳</p>
      </div>

      <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>
            品項載入中...
          </div>
        ) : (
          items.map((item) => {
            const qty = cart[item.id] || 0;
            return (
              <div key={item.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, paddingRight: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span className="badge" style={{ background: "#f1f5f9", fontSize: 10 }}>
                      {item.type === "SERVICE" ? "專業服務" : item.type === "ADDON" ? "現場加點" : "門市商品"}
                    </span>
                    <h3 style={{ fontSize: 15 }}>{item.name}</h3>
                  </div>
                  {item.description && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{item.description}</p>
                  )}
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-main)" }}>
                    NT$ {item.price.toLocaleString()}
                  </div>
                </div>

                {/* 數量增減按鈕 */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {qty > 0 ? (
                    <>
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: "center" }}>{qty}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <Plus size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="btn btn-secondary"
                      style={{ padding: "6px 14px", fontSize: 13, borderRadius: 8 }}
                    >
                      <Plus size={14} /> 選購
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部購物車與結帳浮動 Bar */}
      {totalItemsCount > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 56, // 在 CustomerNav 上方
            background: "#ffffff",
            borderTop: "1px solid var(--border)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>已選 {totalItemsCount} 個品項</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: "#06c755" }}>
              NT$ {totalAmount.toLocaleString()}
            </div>
          </div>

          <button onClick={handleCheckout} disabled={loading} className="btn btn-primary" style={{ padding: "12px 20px" }}>
            <CreditCard size={18} />
            {loading ? "處理中..." : "LINE Pay 結帳"}
          </button>
        </div>
      )}

      <CustomerNav />
    </div>
  );
}
