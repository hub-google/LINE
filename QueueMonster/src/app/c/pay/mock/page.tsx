"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

function MockPaymentContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") || "";
  const transactionId = searchParams.get("transactionId") || "MOCK_TX";
  const amount = searchParams.get("amount") || "0";

  const handleConfirm = () => {
    // 模擬跳轉至後端 Confirm 路由進行核銷
    window.location.href = `/api/v1/payments/line-pay/confirm?paymentId=${paymentId}&transactionId=${transactionId}`;
  };

  const handleCancel = () => {
    window.location.href = `/c/pay/result?status=CANCELLED`;
  };

  return (
    <div className="app-viewport" style={{ padding: 24, justifyContent: "center" }}>
      <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#e8f9ed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#06c755",
            marginBottom: 16,
          }}
        >
          <ShieldCheck size={32} />
        </div>

        <span className="badge" style={{ background: "#fef3c7", color: "#b45309", marginBottom: 12 }}>
          沙盒／本機開發模擬環境
        </span>

        <h1 style={{ fontSize: 20, marginBottom: 6 }}>LINE Pay 支付授權確認</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          您目前處於測試模擬模式，點擊確認即可模擬扣款成功並寫入項目級支付分配。
        </p>

        <div style={{ background: "var(--bg-main)", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>應付總額</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#06c755" }}>NT$ {Number(amount).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Transaction ID: {transactionId}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={handleConfirm} className="btn btn-primary btn-large">
            <CheckCircle2 size={20} /> 模擬授權扣款成功
          </button>
          <button onClick={handleCancel} className="btn btn-outline">
            <XCircle size={18} /> 取消付款
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: 40 }}>載入中...</div>}>
      <MockPaymentContent />
    </Suspense>
  );
}
