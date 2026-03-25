"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", icon: "▣", label: "Dashboard" },
  { href: "/conciliacao", icon: "⇄", label: "Conciliação" },
  { href: "/importar/space", icon: "↑", label: "ERP" },
  { href: "/importar/meli", icon: "↑", label: "MeLi" },
  { href: "/so-erp", icon: "□", label: "Só ERP" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Navegação mobile">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              textDecoration: "none",
              color: isActive ? "var(--accent)" : "var(--mist)",
              borderTop: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              background: isActive ? "var(--surface2)" : "transparent",
              fontSize: 9,
              fontFamily: "DM Mono, monospace",
              fontWeight: isActive ? 600 : 400,
              padding: "6px 2px 4px",
              transition: "color 0.12s, background 0.12s",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ letterSpacing: "0.3px", textTransform: "uppercase" }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
