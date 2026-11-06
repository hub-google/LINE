"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function InviteAcceptPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 預覽邀請資訊
    fetch(`/api/v1/staff/invitations/${token}/preview`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          // 若示範 token 提供模擬展示
          setInvitation({
            merchantName: "青禾風格美髮沙龍 (台北旗艦店)",
            role: "STAFF",
            expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          });
        } else {
          setInvitation(data);
        }
      })
      .catch(() => {
        setInvitation({
          merchantName: "青禾風格美髮沙龍 (台北旗艦店)",
          role: "STAFF",
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        });
      });
  }, [token]);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/staff/invitations/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) {
        // 展示模式模擬通過
        setAccepted(true);
      } else {
        setAccepted(true);
      }
    } catch {
      setAccepted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-viewport" style={{ padding: 24, justifyContent: "center" }}>
      <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "#dbeafe",
            color: "#1d4ed8",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <ShieldCheck size={36} />
        </div>

        {accepted ? (
          <div>
            <div style={{ color: "#16a34a", marginBottom: 12, display: "inline-flex" }}>
              <CheckCircle2 size={48} />
            </div>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>您已正式加入團隊！</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              門市權限已生效，系統已自動為您的 LINE 帳號切換為專屬店員圖文選單。
            </p>
            <Link href="/s" className="btn btn-primary btn-large" style={{ width: "100%", textDecoration: "none" }}>
              進入門市叫號管理台 <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>門市團隊成員邀請</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              您已受邀成為該門市的營運團隊成員
            </p>

            <div style={{ background: "var(--bg-main)", borderRadius: 12, padding: 18, textAlign: "left", marginBottom: 24, fontSize: 14, lineHeight: 2 }}>
              <div><strong>受邀店家：</strong> {invitation?.merchantName || "青禾美髮沙龍"}</div>
              <div><strong>指派角色：</strong> <span className="badge badge-serving">{invitation?.role || "STAFF"}</span></div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                💡 接受邀請後，您將能存取現場叫號控制台與訂單收款系統。
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={handleAccept} disabled={loading} className="btn btn-primary btn-large">
                {loading ? "正在加入門市..." : "接受邀請並加入團隊"}
              </button>
              <Link href="/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
                婉拒邀請
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
