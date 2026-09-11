"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, QrCode, ShoppingBag, User } from "lucide-react";

export default function CustomerNav() {
  const pathname = usePathname();

  const navs = [
    { label: "首頁", href: "/c", icon: Home },
    { label: "取號看號", href: "/c/queue", icon: QrCode },
    { label: "點餐服務", href: "/c/order", icon: ShoppingBag },
    { label: "我的票夾", href: "/c/my", icon: User },
  ];

  return (
    <nav className="bottom-nav">
      {navs.map((n) => {
        const Icon = n.icon;
        const isActive = pathname === n.href;
        return (
          <Link key={n.href} href={n.href} className={`nav-item ${isActive ? "active" : ""}`}>
            <Icon size={22} color={isActive ? "var(--primary)" : "var(--text-muted)"} />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
