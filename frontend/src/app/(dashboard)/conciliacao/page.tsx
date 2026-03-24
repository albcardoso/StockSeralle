"use client";

/**
 * Página de Conciliação ERP × MeLi
 *
 * Esta página é a migração React do fluxo original do HTML legado.
 * A lógica de parsing XLSX foi movida para src/lib/xlsx-parser.ts
 *
 * TODO (próximos passos):
 * 1. Conectar ao backend via Server Actions quando a API estiver pronta
 * 2. Substituir parsers client-side por upload + processamento no backend
 * 3. Adicionar persistência dos dados no MongoDB
 */

import { useState } from "react";
import ConciliacaoTable from "@/components/features/conciliacao/ConciliacaoTable";
import ImportZone from "@/components/features/conciliacao/ImportZone";
import type { ConciliacaoItem } from "@/types";

export default function ConciliacaoPage() {
  const [items, setItems] = useState<ConciliacaoItem[]>([]);
  const [filter, setFilter] = useState<"all" | "div" | "ok" | "erp-only" | "meli-only">("all");
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "div" && item.status === "divergente") ||
      (filter === "ok" && item.status === "ok") ||
      (filter === "erp-only" && item.status === "so_erp") ||
      (filter === "meli-only" && item.status === "so_meli");

    const matchesSearch =
      !search ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.descricao?.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.5px",
          }}
        >
          Conciliação ERP × MeLi
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          Compare o estoque do ERP com os anúncios do Mercado Livre
        </p>
      </div>

      {items.length === 0 ? (
        <ImportZone onDataLoaded={setItems} />
      ) : (
        <>
          {/* Filtro */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              flexWrap: "wrap",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--mist)",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              Filtrar
            </span>

            {(
              [
                { value: "all", label: "Todos" },
                { value: "div", label: "Divergentes" },
                { value: "ok", label: "OK" },
                { value: "erp-only", label: "Só ERP" },
                { value: "meli-only", label: "Só MeLi" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `1px solid ${filter === opt.value ? "var(--blue)" : "var(--border2)"}`,
                  background:
                    filter === opt.value ? "var(--blue-bg)" : "var(--surface2)",
                  color:
                    filter === opt.value ? "var(--blue)" : "var(--slate)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: filter === opt.value ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >
                {opt.label}
              </button>
            ))}

            <input
              type="text"
              placeholder="Buscar SKU ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: 180,
                padding: "7px 12px",
                background: "var(--surface)",
                border: "1.5px solid var(--border2)",
                borderRadius: 6,
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
              }}
            />

            <span
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 10,
                color: "var(--slate)",
              }}
            >
              {filtered.length} itens
            </span>

            <button
              onClick={() => setItems([])}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border2)",
                background: "var(--surface2)",
                color: "var(--slate)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ↩ Novo import
            </button>
          </div>

          <ConciliacaoTable items={filtered} />
        </>
      )}
    </div>
  );
}
