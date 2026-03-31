"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  badgeVariant?: "red" | "purple" | "amber" | "blue";
}

interface NavSection {
  section: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Se true, só aparece quando enableImport=true */
  requiresImport?: boolean;
}

const badgeColors: Record<string, string> = {
  red: "background: #ffeaea; color: var(--red); border: 1px solid var(--red-border)",
  purple: "background: var(--purple-bg); color: var(--purple); border: 1px solid var(--purple-border)",
  amber: "background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border)",
  blue: "background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border)",
};

function buildNavItems(): NavSection[] {
  return [
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
      section: "Fluxo de Suprimentos",
      items: [
        { href: "/fluxo-suprimentos", icon: "📦", label: "Suprimentos" },
        { href: "/importar/suprimentos", icon: "↑", label: "Importar Suprimentos" },
      ],
    },
    {
      section: "Consulta por API",
      collapsible: true,
      defaultOpen: true,
      items: [
        { href: "/importar/space-api", icon: "⚡", label: "Consulta API Space" },
        { href: "/importar/meli-api", icon: "⚡", label: "Consulta API MeLi" },
      ],
    },
    {
      section: "Importação de Planilhas",
      collapsible: true,
      defaultOpen: false,
      requiresImport: true,
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
    {
      section: "Sistema",
      items: [
        { href: "/configuracoes", icon: "⚙", label: "Configurações" },
      ],
    },
  ];
}

export default function Sidebar() {
  const pathname = usePathname();
  const { enableImport, isLoading: settingsLoading } = useSettings();

  // Estado de menus colapsáveis: armazena quais seções estão abertas
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const navItems = buildNavItems();

  function isSectionOpen(section: NavSection): boolean {
    // Se tem estado explícito do usuário, usa ele
    if (openSections[section.section] !== undefined) {
      return openSections[section.section];
    }
    // Se algum item filho está ativo, abre automaticamente
    if (section.items.some((item) => pathname === item.href)) {
      return true;
    }
    // Usa o default
    return section.defaultOpen ?? true;
  }

  function toggleSection(sectionName: string) {
    setOpenSections((prev) => ({
      ...prev,
      [sectionName]: !isSectionOpen(
        navItems.find((s) => s.section === sectionName)!
      ),
    }));
  }

  return (
    <nav className="app-sidebar" aria-label="Navegação principal">
      {navItems.map((group, gi) => {
        // Oculta seções que requerem importação quando desabilitado
        if (group.requiresImport && !settingsLoading && !enableImport) {
          return null;
        }

        const isOpen = isSectionOpen(group);

        return (
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

            {/* Section header */}
            <div
              onClick={group.collapsible ? () => toggleSection(group.section) : undefined}
              style={{
                padding: "0 16px 6px",
                fontFamily: "DM Mono, monospace",
                fontSize: 9,
                fontWeight: 500,
                color: "var(--ghost)",
                letterSpacing: "1px",
                textTransform: "uppercase",
                cursor: group.collapsible ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.section}</span>
              {group.collapsible && (
                <span
                  style={{
                    fontSize: 10,
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    opacity: 0.6,
                  }}
                >
                  ▾
                </span>
              )}
            </div>

            {/* Items (colapsável) */}
            <div
              style={{
                maxHeight: isOpen ? "500px" : "0px",
                overflow: "hidden",
                transition: "max-height 0.25s ease-in-out",
              }}
            >
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
          </div>
        );
      })}
    </nav>
  );
}
