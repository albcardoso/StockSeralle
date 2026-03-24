"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  badgeVariant?: "red" | "purple" | "amber" | "blue";
}

const navItems: { section: string; items: NavItem[] }[] = [
  {
    section: "Visão Geral",
    items: [
      { href: "/", icon: "▣", label: "Dashboard" },
      { href: "/conciliacao", icon: "⇄", label: "Conciliação", badgeVariant: "red" },
      { href: "/so-erp", icon: "□", label: "Só no ERP", badgeVariant: "purple" },
      { href: "/so-meli", icon: "◈", label: "Só no MeLi", badgeVariant: "amber" },
    ],
  },
  {
    section: "Importação",
    items: [
      { href: "/importar/space", icon: "↑", label: "Importar Space" },
      { href: "/importar/vtex", icon: "↑", label: "Importar Vtex" },
      { href: "/importar/meli", icon: "↑", label: "Importar MeLi" },
    ],
  },
  {
    section: "Monitoramento",
    items: [
      { href: "/devolucoes", icon: "↩", label: "Devoluções" },
      { href: "/anuncios", icon: "◉", label: "Anúncios" },
    ],
  },
];

const badgeColors: Record<string, string> = {
  red: "background: #ffeaea; color: var(--red); border: 1px solid var(--red-border)",
  purple: "background: var(--purple-bg); color: var(--purple); border: 1px solid var(--purple-border)",
  amber: "background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border)",
  blue: "background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border)",
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 210,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        padding: "18px 0",
        overflowY: "auto",
      }}
    >
      {navItems.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div
              style={{
                height: 1,
                background: "var(--border)",
                margin: "8px 16px",
              }}
            />
          )}
          <div
            style={{
              padding: "0 16px 6px",
              fontFamily: "DM Mono, monospace",
              fontSize: 9,
              fontWeight: 500,
              color: "var(--ghost)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {group.section}
          </div>
          {group.items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ink)" : "var(--slate)",
                  background: isActive ? "var(--surface2)" : "transparent",
                  borderLeft: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  cursor: "pointer",
                  textDecoration: "none",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                <span style={{ fontSize: 13, opacity: 0.7 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badgeVariant && item.badge !== undefined && item.badge > 0 && (
                  <span
                    style={{
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontFamily: "DM Mono, monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      ...(badgeColors[item.badgeVariant]
                        ? Object.fromEntries(
                            badgeColors[item.badgeVariant]
                              .split(";")
                              .filter(Boolean)
                              .map((s) => {
                                const [k, v] = s.split(":").map((x) => x.trim());
                                return [
                                  k.replace(/-([a-z])/g, (_, c) =>
                                    c.toUpperCase()
                                  ),
                                  v,
                                ];
                              })
                          )
                        : {}),
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
