"use client";

import { useState, useCallback, useMemo } from "react";
import { useStock } from "@/contexts/StockContext";

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultInicio(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `01-${mm}-${yyyy}`;
}

function defaultFim(): string {
  const d = new Date();
  const mm = d.getMonth() + 1;
  const yyyy = d.getFullYear();
  const last = new Date(yyyy, mm, 0).getDate();
  return `${String(last).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${yyyy}`;
}

function toSpaceDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function toInputDate(spaceDate: string): string {
  const [d, m, y] = spaceDate.split("-");
  return `${y}-${m}-${d}`;
}

/** Formata valor: números com decimais ficam com 2 casas */
function fmt(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "number") {
    return val % 1 !== 0 ? val.toFixed(2) : String(val);
  }
  const s = String(val);
  const n = Number(s);
  if (!isNaN(n) && s.includes(".") && n % 1 !== 0) {
    return n.toFixed(2);
  }
  return s;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface SpaceApiRow {
  [key: string]: unknown;
}

interface FilterState {
  periodoInicio: string;
  periodoFim: string;
  idEmpresa: number;
  empresaEstoque: number;
  empresaVenda: number;
}

const PAGE_SIZES = [25, 50, 100, 200];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportarSpaceApiPage() {
  const { setErpData, erpFileName, lastUpdated } = useStock();

  const [filters, setFilters] = useState<FilterState>({
    periodoInicio: defaultInicio(),
    periodoFim: defaultFim(),
    idEmpresa: 98,
    empresaEstoque: 98,
    empresaVenda: 98,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<SpaceApiRow[] | null>(null);
  const [imported, setImported] = useState(false);

  // ── Filtro por coluna ────────────────────────────────────────────────────
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // ── Paginação ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Colunas dinâmicas
  const columns = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return Object.keys(rawData[0]);
  }, [rawData]);

  // Dados filtrados por coluna
  const filteredData = useMemo(() => {
    if (!rawData) return [];
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.trim() !== "");
    if (activeFilters.length === 0) return rawData;

    return rawData.filter((row) =>
      activeFilters.every(([col, term]) => {
        const cellVal = String(row[col] ?? "").toLowerCase();
        return cellVal.includes(term.toLowerCase());
      })
    );
  }, [rawData, columnFilters]);

  // Paginação computada
  const totalFiltered = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);
  const pagedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safeCurrentPage, pageSize]);

  // ── Consulta API ─────────────────────────────────────────────────────────

  const handleConsultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawData(null);
    setImported(false);
    setColumnFilters({});
    setPage(1);

    try {
      const resp = await fetch("/api/space-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idRelatorio: 85,
          idEmpresa: filters.idEmpresa,
          periodoInicio: filters.periodoInicio,
          periodoFim: filters.periodoFim,
          empresaEstoque: filters.empresaEstoque,
          empresaVenda: filters.empresaVenda,
        }),
      });

      const json = await resp.json();

      if (!resp.ok || !json.success) {
        throw new Error(json.error || json.detail || `Erro ${resp.status}`);
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.length === 0) {
        setError("Nenhum registro retornado pela API Space para os filtros informados.");
      } else {
        setRawData(rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // ── Importar para contexto ───────────────────────────────────────────────

  const handleImportar = useCallback(() => {
    if (!rawData || rawData.length === 0) return;

    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

    const codKey = keys.find((k) => {
      const n = norm(k);
      return n === "CODPRODUTO" || n === "SKU" || n === "REFID" || n.includes("CODPRODUTO");
    });

    const estoqueKey = keys.find((k) => {
      const n = norm(k);
      return n === "ESTOQUEDISPONIVEL" || n.includes("ESTOQUE") || n.includes("SALDO") || n.includes("DISPONIVEL");
    });

    const tamanhoKey = keys.find((k) => {
      const n = norm(k);
      return n === "TAMANHO" || n === "NUMERACAO" || n === "GRADE" || n.includes("TAMANHO") || n.includes("NUMERACAO");
    });

    const filialKey = keys.find((k) => {
      const n = norm(k);
      return n === "FILIAL" || n === "LOJA" || n === "CODFILIAL";
    });

    if (!codKey || !estoqueKey) {
      setError(`Colunas necessárias não encontradas. Colunas disponíveis: ${keys.join(", ")}`);
      return;
    }

    const data: Record<string, number> = {};
    let validRows = 0;

    for (const row of rawData) {
      if (filialKey) {
        const filial = String(row[filialKey] ?? "").trim();
        if (filial && !filial.includes("98")) continue;
      }

      const cod = String(row[codKey] ?? "").trim();
      if (!cod) continue;

      const estoque = Number(row[estoqueKey]) || 0;
      const tamanho = tamanhoKey ? String(row[tamanhoKey] ?? "").trim() : "";

      const key = tamanho ? `${cod}|${tamanho}` : cod;
      data[key] = (data[key] || 0) + estoque;
      validRows++;
    }

    if (validRows === 0) {
      setError("Nenhum item válido encontrado nos dados retornados (filial 98).");
      return;
    }

    const label = `Space API (${filters.periodoInicio} a ${filters.periodoFim})`;
    setErpData(data, label);
    setImported(true);
    console.log(`[ImportarSpaceAPI] ✓ ${Object.keys(data).length} itens importados via API`);
  }, [rawData, filters, setErpData]);

  // ── Exportar CSV ─────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!filteredData || filteredData.length === 0) return;
    const cols = Object.keys(filteredData[0]);
    const header = cols.map((c) => `"${c}"`).join(",");
    const rows = filteredData.map((row) =>
      cols.map((c) => `"${fmt(row[c])}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `space-api_${filters.periodoInicio}_${filters.periodoFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredData, filters]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Cabeçalho (estilo conciliação) ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Importar Dados Space API
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ padding: "3px 10px", background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-border)", borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
              API
            </span>
            {erpFileName && (
              <span style={{ padding: "3px 10px", background: "var(--purple-bg)", color: "var(--purple)", border: "1px solid var(--purple-border)", borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {erpFileName}
              </span>
            )}
          </div>
          {lastUpdated && (
            <div style={{ marginTop: 6, fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>
              Última importação: {lastUpdated.toLocaleDateString("pt-BR")} às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
            Consulte o estoque diretamente da API Space Report com filtros personalizados.
          </p>
        </div>
      </div>

      {/* ── Card de Filtros ──────────────────────────────────────────────── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 16 }}>
          Filtros da Consulta
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Período Início */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Período Início</span>
            <DateInput
              value={toInputDate(filters.periodoInicio)}
              onChange={(v) => setFilters((f) => ({ ...f, periodoInicio: toSpaceDate(v) }))}
            />
          </label>

          {/* Período Fim */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Período Fim</span>
            <DateInput
              value={toInputDate(filters.periodoFim)}
              onChange={(v) => setFilters((f) => ({ ...f, periodoFim: toSpaceDate(v) }))}
            />
          </label>

          {/* Empresa (ID) */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Empresa (ID)</span>
            <input
              type="number"
              value={filters.idEmpresa}
              onChange={(e) => setFilters((f) => ({ ...f, idEmpresa: Number(e.target.value) || 0 }))}
              style={inputStyle}
              min={1}
            />
          </label>

          {/* Empresa Estoque */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Empresa Estoque</span>
            <input
              type="number"
              value={filters.empresaEstoque}
              onChange={(e) => setFilters((f) => ({ ...f, empresaEstoque: Number(e.target.value) || 0 }))}
              style={inputStyle}
              min={1}
            />
          </label>

          {/* Empresa Venda */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Empresa Venda</span>
            <input
              type="number"
              value={filters.empresaVenda}
              onChange={(e) => setFilters((f) => ({ ...f, empresaVenda: Number(e.target.value) || 0 }))}
              style={inputStyle}
              min={1}
            />
          </label>
        </div>

        {/* Botão Consultar */}
        <button
          onClick={handleConsultar}
          disabled={loading}
          style={{
            marginTop: 20, padding: "10px 28px",
            background: loading ? "var(--ghost)" : "var(--blue)", color: "#fff", border: "none", borderRadius: 8,
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s",
          }}
        >
          {loading ? "Consultando..." : "Consultar Space API"}
        </button>
      </div>

      {/* ── Erro ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: "#ffeaea", border: "1px solid var(--red-border)", borderRadius: 8, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: "var(--red)", fontFamily: "DM Mono, monospace" }}>
          ✗ {error}
        </div>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {rawData && rawData.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>

          {/* Barra topo: resumo + ações */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                Resultado da Consulta
              </span>
              <span style={{ padding: "3px 8px", background: "var(--blue-bg)", color: "var(--blue)", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
                {totalFiltered} de {rawData.length} registros
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleExport}
                style={{ padding: "8px 16px", background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-border)", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ↓ Exportar CSV
              </button>
              <button
                onClick={handleImportar}
                disabled={imported}
                style={{
                  padding: "8px 22px",
                  background: imported ? "var(--green)" : "var(--purple)", color: "#fff", border: "none", borderRadius: 8,
                  fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13,
                  cursor: imported ? "default" : "pointer", transition: "background 0.15s",
                }}
              >
                {imported ? "✓ Importado" : "Importar para Conciliação"}
              </button>
            </div>
          </div>

          {/* Banner de sucesso */}
          {imported && (
            <div style={{ background: "var(--green-bg, #eafbe7)", border: "1px solid var(--green-border, #b4dfa8)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--green, #2e7d32)", fontFamily: "DM Mono, monospace" }}>
              ✓ Dados importados com sucesso! Os dados do ERP foram atualizados.
            </div>
          )}

          {/* Tabela com filtro por coluna + paginação */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
              <thead>
                {/* Cabeçalho */}
                <tr>
                  {columns.map((col) => (
                    <th key={col} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid var(--border)", color: "var(--slate)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--card)", zIndex: 2 }}>
                      {col}
                    </th>
                  ))}
                </tr>
                {/* Filtros por coluna */}
                <tr>
                  {columns.map((col) => (
                    <th key={`filter-${col}`} style={{ padding: "4px 6px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 32, zIndex: 1 }}>
                      <input
                        type="text"
                        placeholder="Filtrar..."
                        value={columnFilters[col] || ""}
                        onChange={(e) => {
                          setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }));
                          setPage(1);
                        }}
                        style={{
                          width: "100%", padding: "4px 6px", border: "1px solid var(--border2)", borderRadius: 4,
                          fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--ink)", background: "var(--card)",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface)" }}>
                    {columns.map((col, j) => (
                      <td key={j} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", color: "var(--ink)", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fmt(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
                {pagedData.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: 20, textAlign: "center", color: "var(--mist)" }}>
                      Nenhum registro encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Paginação ──────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
            {/* Info */}
            <span style={{ fontSize: 12, fontFamily: "DM Mono, monospace", color: "var(--slate)" }}>
              {totalFiltered === 0
                ? "Nenhum registro"
                : `${(safeCurrentPage - 1) * pageSize + 1}–${Math.min(safeCurrentPage * pageSize, totalFiltered)} de ${totalFiltered} registros`}
            </span>

            {/* Controles de página */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setPage(1)} disabled={safeCurrentPage <= 1} style={paginationBtn(safeCurrentPage <= 1)}>
                ««
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1} style={paginationBtn(safeCurrentPage <= 1)}>
                «
              </button>

              {generatePageNumbers(safeCurrentPage, totalPages).map((p, idx) =>
                p === "..." ? (
                  <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--mist)", fontSize: 12 }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    style={{
                      ...paginationBtn(false),
                      background: safeCurrentPage === p ? "var(--blue)" : "var(--surface2)",
                      color: safeCurrentPage === p ? "#fff" : "var(--slate)",
                      fontWeight: safeCurrentPage === p ? 700 : 400,
                    }}
                  >
                    {p}
                  </button>
                )
              )}

              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages} style={paginationBtn(safeCurrentPage >= totalPages)}>
                »
              </button>
              <button onClick={() => setPage(totalPages)} disabled={safeCurrentPage >= totalPages} style={paginationBtn(safeCurrentPage >= totalPages)}>
                »»
              </button>
            </div>

            {/* Page size */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                style={{ padding: "4px 8px", border: "1px solid var(--border2)", borderRadius: 4, fontSize: 12, fontFamily: "DM Mono, monospace", background: "var(--surface)", color: "var(--ink)", cursor: "pointer" }}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Dica ──────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "var(--slate)", lineHeight: 1.8 }}>
        💡 <b>Como funciona:</b> Esta consulta acessa a mesma base de dados da planilha Space, mas via API direta.
        <br />
        Selecione o período desejado e a empresa, clique em &quot;Consultar&quot; para visualizar os dados e depois em &quot;Importar&quot; para carregá-los na conciliação.
        <br />
        Apenas a filial <b>98 (Sampa Full)</b> é considerada na importação para conciliação.
      </div>
    </div>
  );
}

// ── DateInput: campo com calendário que permite digitação livre ──────────────

function DateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [textValue, setTextValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Formata a data para exibição "DD/MM/YYYY" quando não está em foco
  const displayValue = useMemo(() => {
    if (isFocused && textValue) return textValue;
    if (!value) return "";
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }, [value, isFocused, textValue]);

  function handleTextChange(raw: string) {
    // Permite digitar livremente e auto-formata
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    setTextValue(formatted);

    // Quando temos 8 dígitos, converte para ISO
    if (digits.length === 8) {
      const dd = digits.slice(0, 2);
      const mm = digits.slice(2, 4);
      const yyyy = digits.slice(4, 8);
      const iso = `${yyyy}-${mm}-${dd}`;
      // Valida se é data válida
      const testDate = new Date(iso);
      if (!isNaN(testDate.getTime())) {
        onChange(iso);
      }
    }
  }

  return (
    <div style={{ position: "relative", display: "flex", gap: 0 }}>
      {/* Campo de texto para digitação DD/MM/YYYY */}
      <input
        type="text"
        placeholder="DD/MM/AAAA"
        value={displayValue}
        onFocus={() => {
          setIsFocused(true);
          const [y, m, d] = value.split("-");
          setTextValue(`${d}/${m}/${y}`);
        }}
        onBlur={() => {
          setIsFocused(false);
          setTextValue("");
        }}
        onChange={(e) => handleTextChange(e.target.value)}
        style={{
          ...inputStyle,
          flex: 1,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          borderRight: "none",
        }}
      />
      {/* Botão calendário nativo */}
      <div style={{ position: "relative" }}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            width: 40,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            opacity: 0,
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            cursor: "pointer",
          }}
        />
        <div style={{
          ...inputStyle,
          width: 40,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          pointerEvents: "none",
          fontSize: 16,
        }}>
          📅
        </div>
      </div>
    </div>
  );
}

// ── Gera números de página com elipses ──────────────────────────────────────

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelTextStyle: React.CSSProperties = {
  fontFamily: "DM Mono, monospace",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--slate)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "DM Mono, monospace",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--surface)",
  outline: "none",
};

function paginationBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    border: "1px solid var(--border2)",
    borderRadius: 5,
    background: disabled ? "var(--surface)" : "var(--surface2)",
    color: disabled ? "var(--ghost)" : "var(--slate)",
    fontSize: 12,
    fontFamily: "DM Mono, monospace",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 500,
    transition: "all 0.1s",
  };
}
