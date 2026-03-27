"use client";

import { useState, useMemo, useEffect } from "react";
import type { ConciliacaoItem } from "@/types";

const PAGE_SIZE = 200;

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
  const [page, setPage] = useState(0);

  // Reset page when items list changes (new filter/search)
  useEffect(() => {
    setPage(0);
  }, [items]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));

  const displayItems = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, safePage]);

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
    <div>
      {/* Paginação superior */}
      {totalPages > 1 && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          totalItems={items.length}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setPage(p)}
        />
      )}

      <div
        className="table-scroll-wrapper"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          marginTop: totalPages > 1 ? 8 : 0,
        }}
      >
        <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                background: "var(--surface2)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {["SKU", "Cod. Produto", "Tamanho", "Descrição", "ERP", "MeLi", "Diferença", "Status", "MLB"].map(
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
            {displayItems.map((item, i) => (
              <TableRow key={item.sku + i} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação inferior */}
      {totalPages > 1 && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          totalItems={items.length}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setPage(p)}
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}

// ── Row isolada para evitar re-render em cascata ────────────────────────────

function TableRow({ item }: { item: ConciliacaoItem }) {
  const cfg = statusConfig[item.status];
  const diff =
    item.qtdMeli !== undefined && item.qtdErp !== undefined
      ? item.qtdMeli - item.qtdErp
      : null;

  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--surface2)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
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
          fontFamily: "DM Mono, monospace",
          fontSize: 11,
          color: "var(--mist)",
          whiteSpace: "nowrap",
        }}
      >
        {item.codProduto ?? "—"}
      </td>
      <td
        style={{
          padding: "10px 14px",
          fontFamily: "DM Mono, monospace",
          fontSize: 12,
          color: "var(--ink2)",
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {item.tamanho ?? "—"}
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
      <td
        style={{
          padding: "10px 14px",
          fontFamily: "DM Mono, monospace",
          fontSize: 11,
          color: "var(--mist)",
          whiteSpace: "nowrap",
        }}
      >
        {item.mlb ?? "—"}
      </td>
    </tr>
  );
}

// ── Componente de paginação ─────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  style,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  style?: React.CSSProperties;
}) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  // Gera array de páginas visíveis (max 7 botões)
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("...");
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  const btnBase: React.CSSProperties = {
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid var(--border2)",
    background: "var(--surface)",
    color: "var(--slate)",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "DM Mono, monospace",
    minWidth: 32,
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "var(--blue-bg)",
    color: "var(--blue)",
    border: "1px solid var(--blue-border)",
    fontWeight: 700,
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.4,
    cursor: "default",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <button
        style={page === 0 ? btnDisabled : btnBase}
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ‹
      </button>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span
            key={`ellipsis-${idx}`}
            style={{ fontSize: 12, color: "var(--ghost)", padding: "0 4px" }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            style={p === page ? btnActive : btnBase}
            onClick={() => onPageChange(p as number)}
          >
            {(p as number) + 1}
          </button>
        )
      )}

      <button
        style={page === totalPages - 1 ? btnDisabled : btnBase}
        disabled={page === totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        ›
      </button>

      <span
        style={{
          fontSize: 11,
          color: "var(--mist)",
          fontFamily: "DM Mono, monospace",
          marginLeft: 4,
        }}
      >
        {start}–{end} de {totalItems.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}
