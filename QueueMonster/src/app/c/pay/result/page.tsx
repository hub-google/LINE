"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, ChevronRight, ShoppingBag } from "lucide-react";

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "SUCCESS";
  const orderId = searchParams.get("orderId");
  const errorMsg = searchParams.get("error");

  const isSuccess = status === "SUCCESS";

  return (
    <div className="app-viewport" style={{ padding: 24, justifyContent: "center" }}>
      <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
        <div style={{ color: isSuccess ? "#06c755" : "#ef4444", marginBottom: 16, display: "inline-flex" }}>
          {isSuccess ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
        </div>

        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{isSuccess ? "付款完成！" : "付款未完成"}</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          {isSuccess
            ? "LINE Pay 款項已成功核銷，各項品項狀態已更新為已付款。"
            : errorMsg || "交易已被取消或核銷過程發生異常，項目仍保持待付款。"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/c/my" className="btn btn-primary btn-large" style={{ textDecoration: "none" }}>
            查看我的訂單與票夾 <ChevronRight size={18} />
          </Link>
          <Link href="/c" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            返回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: 40 }}>載入中...</div>}>
      <PaymentResultContent />
    </Suspense>
  );
}
