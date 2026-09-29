"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";

type Transaction = {
  id: string;
  payerId: string;
  status: string;
  billingMonth: string;
  amount: string;
};

type Project = {
  id: string;
  initiatorId: string;
  name: string;
  amount: string;
  payDay: number;
  paymentLink: string;
  memberships: Array<{ id: string; role: string; userId: string }>;
  transactions: Transaction[];
};

export default function Home() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState(liffId ? "正在連接 LINE…" : "尚未設定 NEXT_PUBLIC_LIFF_ID");
  const [form, setForm] = useState({ name: "", amount: "", payDay: "10", paymentLink: "" });

  async function loadProjects(jwt: string) {
    const res = await fetch("/api/projects", { headers: { Authorization: "Bearer " + jwt } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "讀取專案失敗");
    setProjects(data.projects || []);
  }

  useEffect(() => {
    if (!liffId) return;
    liff.init({ liffId }).then(async () => {
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      setToken(data.token);
      setUserId(data.user.id);
      setMessage("你好，" + (data.user.displayName || "LINE 使用者"));
      await loadProjects(data.token);
    }).catch((e: Error) => setMessage(e.message));
  }, [liffId]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ ...form, amount: Number(form.amount), payDay: Number(form.payDay) }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "建立失敗");
    setForm({ name: "", amount: "", payDay: "10", paymentLink: "" });
    await loadProjects(token);
  }

  async function patch(url: string) {
    const res = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer " + token } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "操作失敗");
    await loadProjects(token);
  }

  async function leave(projectId: string) {
    if (!confirm("確定退出這個專案？退出後不再收到繳費提醒。")) return;
    const res = await fetch("/api/projects/" + projectId + "/leave", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "退出失敗");
    await loadProjects(token);
  }

  async function share(project: Project) {
    if (!liff.isApiAvailable("shareTargetPicker")) return alert("目前環境不支援 LINE 分享選擇器");
    await liff.shareTargetPicker([{
      type: "flex",
      altText: "加入「" + project.name + "」定期收款專案",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: project.name, weight: "bold", size: "xl", wrap: true },
            { type: "text", text: "每月 NT$ " + Number(project.amount).toLocaleString() + "｜" + project.payDay + " 日前", margin: "md", wrap: true },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "button",
            style: "primary",
            action: { type: "uri", label: "加入專案", uri: window.location.origin + "/join/" + project.id },
          }],
        },
      },
    }]);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl p-5 space-y-5">
        <header className="pt-4">
          <p className="text-sm text-zinc-500">LINE 定期收款對帳小幫手</p>
          <h1 className="text-3xl font-bold">固定收費，不再人工逐個催</h1>
          <p className="mt-2 text-sm text-zinc-600">{message}</p>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm border border-zinc-200">
          <h2 className="font-bold text-lg mb-3">建立收費專案</h2>
          <form onSubmit={createProject} className="grid gap-3">
            <input required className="border rounded-xl p-3" placeholder="專案名稱" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/>
            <input required min="1" type="number" className="border rounded-xl p-3" placeholder="每月金額" value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/>
            <input required min="1" max="31" type="number" className="border rounded-xl p-3" placeholder="每月繳款日" value={form.payDay} onChange={(e)=>setForm({...form,payDay:e.target.value})}/>
            <input required type="url" className="border rounded-xl p-3" placeholder="LINE Pay／轉帳收款連結" value={form.paymentLink} onChange={(e)=>setForm({...form,paymentLink:e.target.value})}/>
            <button disabled={!token} className="rounded-xl bg-[#06c755] p-3 font-bold text-white disabled:opacity-40">建立專案</button>
          </form>
          <p className="mt-3 text-xs text-zinc-500">本服務只提供提醒與對帳紀錄，不代收款、不保管資金。實際轉帳由付款人與第三方支付服務完成。</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-lg">我的專案</h2>
          {projects.length === 0 && <div className="rounded-2xl bg-white p-5 border">尚無專案。</div>}
          {projects.map((p)=>{
            const isInitiator = p.initiatorId === userId;
            const myTransactions = p.transactions.filter((t)=>t.payerId === userId);
            const pending = p.transactions.filter((t)=>t.status === "PENDING");
            return (
              <article key={p.id} className="rounded-2xl bg-white p-5 border border-zinc-200 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <p className="text-sm text-zinc-600">每月 NT$ {Number(p.amount).toLocaleString()}｜{p.payDay} 日前</p>
                    <p className="text-xs text-zinc-500 mt-1">身分：{isInitiator ? "發起人" : "付款人"}</p>
                  </div>
                  {isInitiator ? <button onClick={()=>share(p)} className="rounded-lg border px-3 py-2 text-sm">分享邀請</button> :
                    <button onClick={()=>leave(p.id)} className="rounded-lg border px-3 py-2 text-sm">退出專案</button>}
                </div>

                {!isInitiator && myTransactions.map((t)=>(
                  <div key={t.id} className="rounded-xl bg-zinc-50 p-3">
                    <div className="text-sm font-medium">{t.billingMonth}｜NT$ {Number(t.amount).toLocaleString()}</div>
                    <div className="text-xs text-zinc-500 mt-1">狀態：{t.status}</div>
                    {(t.status === "UNPAID" || t.status === "OVERDUE") && (
                      <div className="mt-3 flex gap-2">
                        <a href={p.paymentLink} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm">前往轉帳</a>
                        <button onClick={()=>patch("/api/transactions/" + t.id + "/pay").catch((e)=>alert(e.message))} className="rounded-lg bg-[#06c755] text-white px-3 py-2 text-sm">我已轉帳</button>
                      </div>
                    )}
                  </div>
                ))}

                {isInitiator && pending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-bold">待確認收款</div>
                    {pending.map((t)=>(
                      <div key={t.id} className="rounded-xl bg-amber-50 p-3 flex items-center justify-between gap-2">
                        <span className="text-sm">{t.billingMonth}｜NT$ {Number(t.amount).toLocaleString()}</span>
                        <button onClick={()=>patch("/api/transactions/" + t.id + "/confirm").catch((e)=>alert(e.message))} className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm">確認收款</button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
