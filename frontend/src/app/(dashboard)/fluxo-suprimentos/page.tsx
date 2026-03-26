"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStock } from "@/contexts/StockContext";
import SupplyFlowTable from "@/components/features/supply-flow/SupplyFlowTable";
import type { SupplyFlowItem } from "@/types";

type FilterCol = "all" | "sem-estoque" | "estoque-baixo" | "sem-giro" | "sem-entradas";

export default function FluxoSuprimentosPage() {
  const { supplyFlow, supplyFlowFileName, meliData, vtexMap, erpData } = useStock();
  const router = useRouter();

  // Verifica se os 3 imports estão feitos para habilitar "Entrada Pendente"
  const hasAllImports = Object.keys(erpData).length > 0
    && Object.keys(vtexMap).length > 0
    && Object.keys(meliData).length > 0;

  // Enriquece supplyFlow com entradaPendente do MeLi (cruzado via VTEX)
  const enrichedData = useMemo(() => {
    if (!hasAllImports) return supplyFlow;

    // Mapa inverso: cod_produto → MeLi SKU (para cruzar com Space)
    const codToMeliSku: Record<string, string[]> = {};
    for (const [meliSku, entry] of Object.entries(vtexMap)) {
      if (!codToMeliSku[entry.cod_produto]) codToMeliSku[entry.cod_produto] = [];
      codToMeliSku[entry.cod_produto].push(meliSku);
    }

    return supplyFlow.map((item) => {
      const meliSkus = codToMeliSku[item.sku] ?? [];
      let totalEntradaPendente = 0;
      for (const ms of meliSkus) {
        const meli = meliData[ms];
        if (meli) totalEntradaPendente += meli.entradaPendente;
      }
      return { ...item, entradaPendente: totalEntradaPendente };
    });
  }, [supplyFlow, hasAllImports, vtexMap, meliData]);
  const [filter, setFilter] = useState<FilterCol>("all");
  const [search, setSearch] = useState("");
  const [colFilter, setColFilter] = useState<{ column: keyof SupplyFlowItem | ""; op: ">" | "<" | "=" | ">="; value: string }>({ column: "", op: ">=", value: "" });

  const counts = useMemo(() => ({
    semEstoque: enrichedData.filter((i) => i.estoque <= 0).length,
    estoqueBaixo: enrichedData.filter((i) => i.estoque > 0 && i.estoque <= 10).length,
    semGiro: enrichedData.filter((i) => i.giro === 0).length,
    semEntradas: enrichedData.filter((i) => i.entradas === 0).length,
  }), [enrichedData]);

  const filtered = useMemo(() => {
    return enrichedData.filter((item) => {
      // Filtro rápido
      const matchesFilter =
        filter === "all" ||
        (filter === "sem-estoque" && item.estoque <= 0) ||
        (filter === "estoque-baixo" && item.estoque > 0 && item.estoque <= 10) ||
        (filter === "sem-giro" && item.giro === 0) ||
        (filter === "sem-entradas" && item.entradas === 0);

      // Busca textual
      const matchesSearch =
        !search || item.produto.toLowerCase().includes(search.toLowerCase());

      // Filtro avançado por coluna
      let matchesColFilter = true;
      if (colFilter.column && colFilter.value) {
        const cellVal = Number(item[colFilter.column]);
        const filterVal = parseFloat(colFilter.value.replace(",", "."));
        if (!isNaN(cellVal) && !isNaN(filterVal)) {
          switch (colFilter.op) {
            case ">": matchesColFilter = cellVal > filterVal; break;
            case "<": matchesColFilter = cellVal < filterVal; break;
            case "=": matchesColFilter = cellVal === filterVal; break;
            case ">=": matchesColFilter = cellVal >= filterVal; break;
          }
        }
      }

      return matchesFilter && matchesSearch && matchesColFilter;
    });
  }, [enrichedData, filter, search, colFilter]);

  // Estado vazio — nenhum dado importado
  if (supplyFlow.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Fluxo de Suprimentos
          </h1>
          <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
            Visualize entradas, estoque, vendas, markup e cobertura dos produtos
          </p>
        </div>

        <div onClick={() => router.push("/importar/suprimentos")}
          style={{ background: "var(--surface)", border: "1.5px dashed var(--border2)", borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📦</div>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 6 }}>
            Importar planilha de suprimentos
          </div>
          <div style={{ fontSize: 13, color: "var(--mist)" }}>
            Clique para importar o CSV do Space ERP
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Fluxo de Suprimentos
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            {supplyFlowFileName && <FileBadge label={supplyFlowFileName} color="var(--blue)" bg="var(--blue-bg)" />}
            <span style={{ fontSize: 12, color: "var(--mist)", fontFamily: "DM Mono, monospace", alignSelf: "center" }}>
              {enrichedData.length.toLocaleString("pt-BR")} produtos
            </span>
          </div>
        </div>
      </div>

      {/* Aviso: imports pendentes para Entrada Pendente */}
      {!hasAllImports && (
        <div style={{ background: "var(--amber-bg)", border: "1px solid var(--amber-border)", borderRadius: 8, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>
            Para exibir a coluna &quot;Entrada Pendente&quot;, importe as 3 planilhas: Space, VTEX e MeLi.
          </span>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Sem Estoque" value={counts.semEstoque} color="var(--red)" bg="var(--red-bg)" onClick={() => setFilter(filter === "sem-estoque" ? "all" : "sem-estoque")} active={filter === "sem-estoque"} />
        <SummaryCard label="Estoque Baixo" value={counts.estoqueBaixo} color="var(--amber)" bg="var(--amber-bg)" onClick={() => setFilter(filter === "estoque-baixo" ? "all" : "estoque-baixo")} active={filter === "estoque-baixo"} />
        <SummaryCard label="Sem Giro" value={counts.semGiro} color="var(--purple)" bg="var(--purple-bg)" onClick={() => setFilter(filter === "sem-giro" ? "all" : "sem-giro")} active={filter === "sem-giro"} />
        <SummaryCard label="Sem Entradas" value={counts.semEntradas} color="var(--blue)" bg="var(--blue-bg)" onClick={() => setFilter(filter === "sem-entradas" ? "all" : "sem-entradas")} active={filter === "sem-entradas"} />
      </div>

      {/* Barra de filtros + busca */}
      <div className="filter-bar" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, flexWrap: "wrap", boxShadow: "var(--shadow-sm)" }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500, color: "var(--mist)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Buscar
        </span>
        <input type="text" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: "7px 12px", background: "var(--surface)", border: "1.5px solid var(--border2)", borderRadius: 6, color: "var(--ink)", fontSize: 13, outline: "none" }} />
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--slate)" }}>
          {filtered.length} / {enrichedData.length}
        </span>
        <ExportButton items={filtered} showEntradaPendente={hasAllImports} />
      </div>

      {/* Filtro avançado por coluna */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500, color: "var(--mist)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Filtrar coluna
        </span>
        <select value={colFilter.column} onChange={(e) => setColFilter((f) => ({ ...f, column: e.target.value as keyof SupplyFlowItem | "" }))}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--ink)", fontSize: 12 }}>
          <option value="">Nenhuma</option>
          <option value="entradas">Entradas</option>
          <option value="estoque">Estoque</option>
          <option value="vendas">Vendas</option>
          <option value="transferencias">Transferências</option>
          <option value="pmv">PMV</option>
          <option value="giro">% Giro</option>
          <option value="cobertura">Cobertura</option>
          <option value="itens">Itens</option>
          {hasAllImports && <option value="entradaPendente">Entrada Pendente</option>}
        </select>
        {colFilter.column && (
          <>
            <select value={colFilter.op} onChange={(e) => setColFilter((f) => ({ ...f, op: e.target.value as ">" | "<" | "=" | ">=" }))}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--ink)", fontSize: 12, width: 60 }}>
              <option value=">=">≥</option>
              <option value=">">{">"}</option>
              <option value="<">{"<"}</option>
              <option value="=">=</option>
            </select>
            <input type="text" placeholder="Valor" value={colFilter.value} onChange={(e) => setColFilter((f) => ({ ...f, value: e.target.value }))}
              style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--ink)", fontSize: 12, fontFamily: "DM Mono, monospace" }} />
            <button onClick={() => setColFilter({ column: "", op: ">=", value: "" })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--slate)", fontSize: 11, cursor: "pointer" }}>
              Limpar
            </button>
          </>
        )}
      </div>

      <SupplyFlowTable items={filtered} showEntradaPendente={hasAllImports} />
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, bg, onClick, active }: {
  label: string; value: number; color: string; bg: string; onClick: () => void; active: boolean;
}) {
  return (
    <div onClick={onClick}
      style={{ background: active ? bg : "var(--surface)", border: `1px solid ${active ? color : "var(--border)"}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", transition: "all 0.15s", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11, color: active ? color : "var(--mist)", marginBottom: 6, fontFamily: "DM Mono, monospace" }}>{label}</div>
      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 24, fontWeight: 500, color: active ? color : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function FileBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ padding: "3px 10px", background: bg, color, border: `1px solid ${color}`, borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ExportButton({ items, showEntradaPendente }: { items: SupplyFlowItem[]; showEntradaPendente: boolean }) {
  function exportCSV() {
    const headers = ["Produto", "Entradas", "Estoque", "Vendas", "Transferências", "PMV", "Markup", "% Giro", "Cobertura", "Itens", "Última Entrada"];
    if (showEntradaPendente) headers.push("Entrada Pendente");
    const rows = items.map((i) => {
      const row: (string | number)[] = [
        i.produto, i.entradas, i.estoque, i.vendas, i.transferencias,
        i.pmv, i.markup, i.giro, i.cobertura, i.itens, i.ultimaEntrada,
      ];
      if (showEntradaPendente) row.push(i.entradaPendente ?? 0);
      return row;
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo_suprimentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={exportCSV}
      style={{ padding: "6px 14px", background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-border)", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
      ↓ Exportar CSV
    </button>
  );
}
