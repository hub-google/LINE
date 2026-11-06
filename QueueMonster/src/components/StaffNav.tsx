"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, CreditCard, Calendar, ShieldCheck, ArrowLeft } from "lucide-react";

export default function StaffNav() {
  const pathname = usePathname();

  const links = [
    { label: "叫號看板", href: "/s", icon: Users },
    { label: "訂單收款", href: "/s/orders", icon: CreditCard },
    { label: "預約報到", href: "/s/reservations", icon: Calendar },
    { label: "員工邀請", href: "/s/staff", icon: ShieldCheck },
  ];

  return (
    <header
      style={{
        background: "#ffffff",
        borderBottom: "1px solid var(--border)",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
            門市營運端
          </span>
          <h1 style={{ fontSize: 16, marginTop: 2 }}>青禾美髮・台北旗艦店</h1>
        </div>
      </div>

      <nav style={{ display: "flex", gap: 8 }}>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
              style={{ padding: "8px 14px", fontSize: 13, textDecoration: "none" }}
            >
              <Icon size={16} /> {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
