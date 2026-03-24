"use client";

import type { ConciliacaoItem } from "@/types";

interface Props {
  items: ConciliacaoItem[];
}

const statusConfig = {
  ok: { label: "OK", color: "var(--green)", bg: "var(--green-bg)" },
  divergente: { label: "Divergente", color: "var(--red)", bg: "var(--red-bg)" },
  so_erp: { label: "Só ERP", color: "var(--purple)", bg: "var(--purple-bg)" },
  so_meli: { label: "Só MeLi", color: "var(--amber)", bg: "var(--amber-bg)" },
};

export default function ConciliacaoTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
        <div
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--slate)",
          }}
        >
          Nenhum item encontrado
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{
              background: "var(--surface2)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["SKU", "Descrição", "ERP", "MeLi", "Diferença", "Status"].map(
              (h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    color: "var(--mist)",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const cfg = statusConfig[item.status];
            const diff =
              item.qtdMeli !== undefined && item.qtdErp !== undefined
                ? item.qtdMeli - item.qtdErp
                : null;

            return (
              <tr
                key={item.sku + i}
                style={{
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "var(--surface2)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "transparent")
                }
              >
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 12,
                    color: "var(--ink2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.sku}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "var(--slate)",
                    maxWidth: 280,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.descricao ?? "—"}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 13,
                    color: "var(--ink)",
                    textAlign: "center",
                  }}
                >
                  {item.qtdErp ?? "—"}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 13,
                    color: "var(--ink)",
                    textAlign: "center",
                  }}
                >
                  {item.qtdMeli ?? "—"}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      diff === null
                        ? "var(--ghost)"
                        : diff < 0
                        ? "var(--red)"
                        : diff > 0
                        ? "var(--green)"
                        : "var(--slate)",
                    textAlign: "center",
                  }}
                >
                  {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 9px",
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "DM Mono, monospace",
                      color: cfg.color,
                      background: cfg.bg,
                    }}
                  >
                    {cfg.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
