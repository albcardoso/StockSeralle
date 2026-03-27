"use client";

import { useState, useCallback } from "react";
import { useStock } from "@/contexts/StockContext";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna "01-MM-YYYY" do primeiro dia do mês atual */
function defaultInicio(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `01-${mm}-${yyyy}`;
}

/** Retorna "DD-MM-YYYY" do último dia do mês atual */
function defaultFim(): string {
  const d = new Date();
  const mm = d.getMonth() + 1;
  const yyyy = d.getFullYear();
  const last = new Date(yyyy, mm, 0).getDate();
  return `${String(last).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${yyyy}`;
}

/** Converte "YYYY-MM-DD" (input[date]) → "DD-MM-YYYY" (Space API) */
function toSpaceDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Converte "DD-MM-YYYY" → "YYYY-MM-DD" para input[date] */
function toInputDate(spaceDate: string): string {
  const [d, m, y] = spaceDate.split("-");
  return `${y}-${m}-${d}`;
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportarSpaceApiPage() {
  const { setErpData } = useStock();

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

  // ── Consulta API ─────────────────────────────────────────────────────────

  const handleConsultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawData(null);
    setImported(false);

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

  // ── Importar para o contexto (mesmo formato parseSpaceErp) ───────────────

  const handleImportar = useCallback(() => {
    if (!rawData || rawData.length === 0) return;

    // Detectar nomes de colunas dinamicamente
    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

    const codKey = keys.find((k) => {
      const n = norm(k);
      return n === "CODPRODUTO" || n === "CODPRODUTO" || n === "SKU" || n === "REFID" || n.includes("CODPRODUTO");
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
      setError(
        `Colunas necessárias não encontradas. Colunas disponíveis: ${keys.join(", ")}`
      );
      return;
    }

    const data: Record<string, number> = {};
    let validRows = 0;

    for (const row of rawData) {
      // Filtro filial 98 (se a coluna existir)
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

    console.log(
      `[ImportarSpaceAPI] ✓ ${Object.keys(data).length} itens importados via API`
    );
  }, [rawData, filters, setErpData]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1
            style={{
              fontFamily: "Syne, sans-serif",
              fontWeight: 800,
              fontSize: 22,
              color: "var(--ink)",
              letterSpacing: "-0.5px",
            }}
          >
            Importar Dados Space API
          </h1>
          <span
            style={{
              padding: "3px 10px",
              background: "var(--blue-bg)",
              color: "var(--blue)",
              borderRadius: 5,
              fontSize: 11,
              fontFamily: "DM Mono, monospace",
              fontWeight: 600,
            }}
          >
            API
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--mist)" }}>
          Consulte o estoque diretamente da API Space Report com filtros personalizados.
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--ink)",
            marginBottom: 16,
          }}
        >
          Filtros da Consulta
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Período Início */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Período Início</span>
            <input
              type="date"
              value={toInputDate(filters.periodoInicio)}
              onChange={(e) =>
                setFilters((f) => ({ ...f, periodoInicio: toSpaceDate(e.target.value) }))
              }
              style={inputStyle}
            />
          </label>

          {/* Período Fim */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Período Fim</span>
            <input
              type="date"
              value={toInputDate(filters.periodoFim)}
              onChange={(e) =>
                setFilters((f) => ({ ...f, periodoFim: toSpaceDate(e.target.value) }))
              }
              style={inputStyle}
            />
          </label>

          {/* Empresa (ID_CAD_EMPRESA) */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Empresa (ID)</span>
            <input
              type="number"
              value={filters.idEmpresa}
              onChange={(e) =>
                setFilters((f) => ({ ...f, idEmpresa: Number(e.target.value) || 0 }))
              }
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
              onChange={(e) =>
                setFilters((f) => ({ ...f, empresaEstoque: Number(e.target.value) || 0 }))
              }
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
              onChange={(e) =>
                setFilters((f) => ({ ...f, empresaVenda: Number(e.target.value) || 0 }))
              }
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
            marginTop: 20,
            padding: "10px 28px",
            background: loading ? "var(--ghost)" : "var(--blue)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Consultando..." : "Consultar Space API"}
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div
          style={{
            background: "#ffeaea",
            border: "1px solid var(--red-border)",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 18,
            fontSize: 13,
            color: "var(--red)",
            fontFamily: "DM Mono, monospace",
          }}
        >
          ✗ {error}
        </div>
      )}

      {/* Resultado: preview + botão importar */}
      {rawData && rawData.length > 0 && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          {/* Resumo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--ink)",
                }}
              >
                Resultado da Consulta
              </span>
              <span
                style={{
                  marginLeft: 10,
                  padding: "3px 8px",
                  background: "var(--blue-bg)",
                  color: "var(--blue)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "DM Mono, monospace",
                  fontWeight: 600,
                }}
              >
                {rawData.length} registros
              </span>
            </div>

            <button
              onClick={handleImportar}
              disabled={imported}
              style={{
                padding: "8px 22px",
                background: imported ? "var(--green)" : "var(--purple)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: imported ? "default" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {imported ? "✓ Importado" : "Importar para Conciliação"}
            </button>
          </div>

          {/* Banner de sucesso */}
          {imported && (
            <div
              style={{
                background: "var(--green-bg, #eafbe7)",
                border: "1px solid var(--green-border, #b4dfa8)",
                borderRadius: 8,
                padding: "10px 16px",
                marginBottom: 16,
                fontSize: 13,
                color: "var(--green, #2e7d32)",
                fontFamily: "DM Mono, monospace",
              }}
            >
              ✓ Dados importados com sucesso! Os dados do ERP foram atualizados.
            </div>
          )}

          {/* Tabela preview (primeiras 50 linhas) */}
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "DM Mono, monospace",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  {Object.keys(rawData[0]).map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "8px 10px",
                        textAlign: "left",
                        borderBottom: "2px solid var(--border)",
                        color: "var(--slate)",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        background: "var(--card)",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawData.slice(0, 50).map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "transparent" : "var(--surface)",
                    }}
                  >
                    {Object.values(row).map((val, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "6px 10px",
                          borderBottom: "1px solid var(--border)",
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {val == null ? "" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rawData.length > 50 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "10px",
                  fontSize: 12,
                  color: "var(--mist)",
                  fontFamily: "DM Mono, monospace",
                }}
              >
                ... mostrando 50 de {rawData.length} registros
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dica */}
      <div
        style={{
          marginTop: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 18px",
          fontSize: 13,
          color: "var(--slate)",
          lineHeight: 1.8,
        }}
      >
        💡 <b>Como funciona:</b> Esta consulta acessa a mesma base de dados da planilha Space, mas via API direta.
        <br />
        Selecione o período desejado e a empresa, clique em &quot;Consultar&quot; para visualizar os dados e depois em &quot;Importar&quot;
        para carregá-los na conciliação.
        <br />
        Apenas a filial <b>98 (Sampa Full)</b> é considerada na importação para conciliação.
      </div>
    </div>
  );
}

// ── Estilos inline reutilizáveis ─────────────────────────────────────────────

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
