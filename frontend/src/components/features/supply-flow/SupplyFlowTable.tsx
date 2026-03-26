"use client";

import { useState, useMemo, useEffect } from "react";
import type { SupplyFlowItem } from "@/types";

const PAGE_SIZE = 200;

interface Props {
  items: SupplyFlowItem[];
}

const columns: { key: keyof SupplyFlowItem; label: string; align: "left" | "center" | "right"; width?: number; mono?: boolean; format?: (v: unknown) => string }[] = [
  { key: "produto", label: "Produto", align: "left", width: 340 },
  { key: "entradas", label: "Entradas", align: "center", mono: true },
  { key: "estoque", label: "Estoque", align: "center", mono: true },
  { key: "vendas", label: "Vendas", align: "center", mono: true },
  { key: "transferencias", label: "Transferências", align: "center", mono: true },
  { key: "pmv", label: "PMV", align: "center", mono: true, format: (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { key: "markup", label: "Markup", align: "center", mono: true },
  { key: "giro", label: "% Giro", align: "center", mono: true, format: (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { key: "cobertura", label: "Cobertura", align: "center", mono: true },
  { key: "itens", label: "Itens", align: "center", mono: true },
  { key: "ultimaEntrada", label: "Última Entrada", align: "center", mono: true },
];

export default function SupplyFlowTable({ items }: Props) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<keyof SupplyFlowItem | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => { setPage(0); }, [items]);

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb), "pt-BR")
        : String(vb).localeCompare(String(va), "pt-BR");
    });
  }, [items, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const displayItems = useMemo(() => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE), [sorted, safePage]);

  function handleSort(key: keyof SupplyFlowItem) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--slate)" }}>
          Nenhum item encontrado
        </div>
      </div>
    );
  }

  return (
    <div>
      {totalPages > 1 && (
        <PaginationBar page={safePage} totalPages={totalPages} totalItems={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}

      <div className="table-scroll-wrapper" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)", marginTop: totalPages > 1 ? 8 : 0 }}>
        <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              {columns.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  style={{
                    padding: "10px 12px", textAlign: col.align as "left" | "center" | "right",
                    fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500,
                    color: sortKey === col.key ? "var(--blue)" : "var(--mist)",
                    textTransform: "uppercase", letterSpacing: "0.8px", whiteSpace: "nowrap",
                    cursor: "pointer", userSelect: "none",
                    maxWidth: col.width,
                  }}>
                  {col.label} {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, i) => (
              <TableRow key={item.produto + i} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <PaginationBar page={safePage} totalPages={totalPages} totalItems={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} style={{ marginTop: 8 }} />
      )}
    </div>
  );
}

function TableRow({ item }: { item: SupplyFlowItem }) {
  const transferColor = item.transferencias < 0 ? "var(--red)" : item.transferencias > 0 ? "var(--green)" : "var(--slate)";
  const estoqueColor = item.estoque <= 0 ? "var(--red)" : item.estoque < 10 ? "var(--amber)" : "var(--ink)";

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface2)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--ink)", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.produto}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.entradas}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: estoqueColor, textAlign: "center", fontWeight: 600 }}>
        {item.estoque}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.vendas}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: transferColor, textAlign: "center", fontWeight: 600 }}>
        {item.transferencias}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.pmv.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.markup}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.giro.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.cobertura}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", textAlign: "center" }}>
        {item.itens}
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--slate)", textAlign: "center", whiteSpace: "nowrap" }}>
        {item.ultimaEntrada}
      </td>
    </tr>
  );
}

function PaginationBar({ page, totalPages, totalItems, pageSize, onPageChange, style }: {
  page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (p: number) => void; style?: React.CSSProperties;
}) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("...");
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i);
    if (page < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  const btnBase: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--slate)", fontSize: 12, cursor: "pointer", fontFamily: "DM Mono, monospace", minWidth: 32 };
  const btnActive: React.CSSProperties = { ...btnBase, background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-border)", fontWeight: 700 };
  const btnDisabled: React.CSSProperties = { ...btnBase, opacity: 0.4, cursor: "default" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...style }}>
      <button style={page === 0 ? btnDisabled : btnBase} disabled={page === 0} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} style={{ fontSize: 12, color: "var(--ghost)", padding: "0 4px" }}>…</span>
        ) : (
          <button key={p} style={p === page ? btnActive : btnBase} onClick={() => onPageChange(p as number)}>{(p as number) + 1}</button>
        )
      )}
      <button style={page === totalPages - 1 ? btnDisabled : btnBase} disabled={page === totalPages - 1} onClick={() => onPageChange(page + 1)}>›</button>
      <span style={{ fontSize: 11, color: "var(--mist)", fontFamily: "DM Mono, monospace", marginLeft: 4 }}>
        {start}–{end} de {totalItems.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}
