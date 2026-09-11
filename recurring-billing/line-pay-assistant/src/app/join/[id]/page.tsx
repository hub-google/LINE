"use client";

import { useEffect, useState, use } from "react";
import liff from "@line/liff";

type Project = {
  id: string;
  name: string;
  amount: string;
  payDay: number;
  initiator: { displayName: string | null };
};

export default function JoinProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(liffId ? null : "LIFF ID is not configured.");
  const [loading, setLoading] = useState(Boolean(liffId));
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!liffId) return;
    Promise.all([
      fetch("/api/projects/" + projectId).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "找不到專案");
        return data.project as Project;
      }),
      liff.init({ liffId }).then(() => {
        if (!liff.isLoggedIn()) liff.login({ redirectUri: window.location.href });
      }),
    ]).then(([p]) => setProject(p))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [liffId, projectId]);

  async function handleJoin() {
    setJoining(true);
    try {
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("無法取得 LINE 登入資訊");
      const authRes = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const auth = await authRes.json();
      if (!authRes.ok) throw new Error(auth.error || "登入失敗");
      const joinRes = await fetch("/api/projects/" + projectId + "/join", {
        method: "POST",
        headers: { Authorization: "Bearer " + auth.token },
      });
      const result = await joinRes.json();
      if (!joinRes.ok) throw new Error(result.error || "加入失敗");
      alert("加入成功！");
      if (liff.isInClient()) liff.closeWindow();
      else window.location.href = "/";
    } catch (e) {
      alert(e instanceof Error ? e.message : "加入失敗");
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">載入中…</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
  if (!project) return <div className="min-h-screen flex items-center justify-center">找不到專案</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 w-full max-w-sm">
        <p className="text-sm text-gray-500">受邀加入固定收費專案</p>
        <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
        <div className="my-6 rounded-2xl bg-gray-50 p-4">
          <div className="text-sm text-gray-500">每月應付</div>
          <div className="text-3xl font-bold">NT$ {Number(project.amount).toLocaleString()}</div>
          <div className="text-sm text-gray-600 mt-2">每月 {project.payDay} 日前繳款</div>
          <div className="text-sm text-gray-600">發起人：{project.initiator.displayName || "LINE 使用者"}</div>
        </div>
        <p className="text-xs text-gray-500 mb-5">系統只提供提醒與人工對帳，不會自動扣款；實際付款在第三方支付服務完成。</p>
        <button disabled={joining} onClick={handleJoin} className="w-full bg-[#06c755] disabled:opacity-50 text-white font-semibold py-4 rounded-2xl">
          {joining ? "加入中…" : "同意並加入"}
        </button>
      </div>
    </main>
  );
}
