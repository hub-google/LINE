"use client";

import { useEffect, useState, use } from "react";
import liff from "@line/liff";

export default function JoinProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [liffError, setLiffError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setLiffError("LIFF ID is not configured.");
      setLoading(false);
      return;
    }

    liff.init({ liffId })
      .then(() => {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
        } else {
          setLoading(false);
          // TODO: Call API to get project details and confirm join
        }
      })
      .catch((err: Error) => {
        setLiffError(err.message);
        setLoading(false);
      });
  }, [liffId]);

  const handleJoin = async () => {
    try {
      const idToken = liff.getIDToken();
      // 1. Auth to get JWT
      const authRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const { token } = await authRes.json();

      // 2. Join project
      const joinRes = await fetch(`/api/projects/${projectId}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (joinRes.ok) {
        alert("加入成功！");
        liff.closeWindow();
      } else {
        alert("加入失敗，請稍後再試。");
      }
    } catch (err) {
      console.error(err);
      alert("發生錯誤");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">載入中...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">加入定期收費專案</h1>
        <p className="text-gray-500 mb-8">
          您即將同意加入此專案。未來每月將會透過 LINE 收到繳費提醒。
        </p>

        {liffError ? (
          <p className="text-red-500 text-sm">{liffError}</p>
        ) : (
          <button 
            onClick={handleJoin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl shadow-md transition-all active:scale-[0.98]"
          >
            同意並加入
          </button>
        )}
      </div>
    </main>
  );
}
