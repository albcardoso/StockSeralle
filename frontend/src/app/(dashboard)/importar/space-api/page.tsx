"use client";

import { useState, useCallback, useMemo, useRef } from "react";
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

/** Retorna a data de hoje no formato DD-MM-YYYY (sysdate) */
function todaySpaceDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
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

// ── Cache em sessionStorage para manter dados entre navegações ─────────────

const CACHE_KEY = "stocksync_space_api_cache";

interface CachedQuery {
  rawData: SpaceApiRow[];
  filters: FilterState;
  imported: boolean;
  timestamp: string;
}

function loadCache(): CachedQuery | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedQuery;
  } catch { return null; }
}

function saveCache(data: CachedQuery) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* sessionStorage cheio — ignora */ }
}

function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

export default function ImportarSpaceApiPage() {
  const { setErpData, erpFileName, lastUpdated } = useStock();

  // Carrega cache da última consulta (se existir)
  const cached = useMemo(() => loadCache(), []);

  const [filters, setFilters] = useState<FilterState>(
    cached?.filters ?? {
      periodoInicio: defaultInicio(),
      periodoFim: defaultFim(),
      idEmpresa: 98,
      empresaEstoque: 98,
      empresaVenda: 98,
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<SpaceApiRow[] | null>(cached?.rawData ?? null);
  const [imported, setImported] = useState(cached?.imported ?? false);

  // ── Filtro por coluna ────────────────────────────────────────────────────
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // ── Paginação ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Colunas dinâmicas (ordem original da API)
  const columnsFromData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return Object.keys(rawData[0]);
  }, [rawData]);

  // ── Reordenação de colunas (drag & drop) ────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const dragColRef = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);

  // Colunas efetivas: usa a ordem customizada se existir, senão a original
  const columns = useMemo(() => {
    if (!columnOrder) return columnsFromData;
    // Garante que colunas novas (não presentes no order) sejam incluídas no final
    const ordered = columnOrder.filter((c) => columnsFromData.includes(c));
    const extras = columnsFromData.filter((c) => !columnOrder.includes(c));
    return [...ordered, ...extras];
  }, [columnsFromData, columnOrder]);

  // Reset da ordem quando os dados mudam (nova consulta)
  const prevColumnsRef = useRef<string>(JSON.stringify(columnsFromData));
  if (JSON.stringify(columnsFromData) !== prevColumnsRef.current) {
    prevColumnsRef.current = JSON.stringify(columnsFromData);
    setColumnOrder(null);
  }

  const handleColumnDragStart = useCallback((col: string) => {
    dragColRef.current = col;
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, col: string) => {
    e.preventDefault();
    dragOverColRef.current = col;
  }, []);

  const handleColumnDrop = useCallback(() => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    if (!from || !to || from === to) return;

    setColumnOrder((prev) => {
      const current = prev ?? [...columnsFromData];
      const newOrder = [...current];
      const fromIdx = newOrder.indexOf(from);
      const toIdx = newOrder.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return current;
      // Remove da posição original e insere na nova
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, from);
      return newOrder;
    });

    dragColRef.current = null;
    dragOverColRef.current = null;
  }, [columnsFromData]);

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
      const hoje = todaySpaceDate();

      // ── Duas chamadas em paralelo: período selecionado + sysdate (hoje) ──
      const [respPeriodo, respHoje] = await Promise.all([
        // 1) Consulta com o período do filtro (como já funcionava)
        fetch("/api/space-estoque", {
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
        }),
        // 2) Consulta com sysdate (hoje) para "estoque_hoje"
        fetch("/api/space-estoque", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idRelatorio: 85,
            idEmpresa: filters.idEmpresa,
            periodoInicio: hoje,
            periodoFim: hoje,
            empresaEstoque: filters.empresaEstoque,
            empresaVenda: filters.empresaVenda,
          }),
        }),
      ]);

      const jsonPeriodo = await respPeriodo.json();
      const jsonHoje = await respHoje.json();


      if (!respPeriodo.ok || !jsonPeriodo.success) {
        throw new Error(jsonPeriodo.error || jsonPeriodo.detail || `Erro ${respPeriodo.status}`);
      }

      const rows: SpaceApiRow[] = Array.isArray(jsonPeriodo.data) ? jsonPeriodo.data : [];

      if (rows.length === 0) {
        setError("Nenhum registro retornado pela API Space para os filtros informados.");
        clearCache();
      } else {
        // ── Monta mapa de estoque_hoje por chave (produto_sku ou produto_codigo) ──
        const hojeRows: SpaceApiRow[] =
          respHoje.ok && jsonHoje.success && Array.isArray(jsonHoje.data) ? jsonHoje.data : [];

        const hojeMap = new Map<string, number>();
        if (hojeRows.length > 0) {
          const hojeKeys = Object.keys(hojeRows[0]);
          const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_]/g, "");

          // Detecta chave e coluna de estoque nos dados de hoje
          const skuKeyH = hojeKeys.find((k) => {
            const n = norm(k);
            return n === "PRODUTO_SKU" || n === "PRODUTOSKU" || n === "SKU";
          });
          const codKeyH = hojeKeys.find((k) => {
            const n = norm(k);
            return n === "PRODUTO_CODIGO" || n === "PRODUTOCODIGO" || n === "CODPRODUTO" || n === "COD_PRODUTO";
          });
          const estoqueKeyH = hojeKeys.find((k) => {
            const n = norm(k);
            return n === "ESTOQUE" || n === "ESTOQUE_DISPONIVEL" || n === "ESTOQUEDISPONIVEL" || n.includes("ESTOQUE");
          });
          const tamanhoKeyH = hojeKeys.find((k) => {
            const n = norm(k);
            return n === "TAMANHO_DESCRICAO" || n === "TAMANHODESCRICAO" || n === "TAMANHO" || n.includes("TAMANHO");
          });

          const primaryKeyH = skuKeyH || codKeyH;

          if (primaryKeyH && estoqueKeyH) {
            for (const hRow of hojeRows) {
              const keyVal = String(hRow[primaryKeyH] ?? "").trim();
              if (!keyVal) continue;
              const estoque = Number(hRow[estoqueKeyH]) || 0;
              // Chave composta se não usa SKU direto
              let mapKey = keyVal;
              if (!skuKeyH && tamanhoKeyH) {
                const tam = String(hRow[tamanhoKeyH] ?? "").trim().replace(/\.0$/, "");
                if (tam) mapKey = `${keyVal}|${tam}`;
              }
              hojeMap.set(mapKey, (hojeMap.get(mapKey) || 0) + estoque);
            }
          }
          console.log(`[space-estoque] Mapa estoque_hoje: ${hojeMap.size} itens (sysdate: ${hoje})`);
        }

        // ── Detecta chave nos dados do período para fazer o match ──
        const rowKeys = Object.keys(rows[0]);
        const normR = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_]/g, "");
        const skuKeyR = rowKeys.find((k) => {
          const n = normR(k);
          return n === "PRODUTO_SKU" || n === "PRODUTOSKU" || n === "SKU";
        });
        const codKeyR = rowKeys.find((k) => {
          const n = normR(k);
          return n === "PRODUTO_CODIGO" || n === "PRODUTOCODIGO" || n === "CODPRODUTO" || n === "COD_PRODUTO";
        });
        const tamanhoKeyR = rowKeys.find((k) => {
          const n = normR(k);
          return n === "TAMANHO_DESCRICAO" || n === "TAMANHODESCRICAO" || n === "TAMANHO" || n.includes("TAMANHO");
        });
        const primaryKeyR = skuKeyR || codKeyR;

        // ── Mescla coluna "estoque_hoje" em cada linha ──
        const mergedRows = rows.map((row) => {
          let estoqueHoje: number | string = "";
          if (primaryKeyR && hojeMap.size > 0) {
            const keyVal = String(row[primaryKeyR] ?? "").trim();
            let mapKey = keyVal;
            if (!skuKeyR && tamanhoKeyR) {
              const tam = String(row[tamanhoKeyR] ?? "").trim().replace(/\.0$/, "");
              if (tam) mapKey = `${keyVal}|${tam}`;
            }
            if (hojeMap.has(mapKey)) {
              estoqueHoje = hojeMap.get(mapKey)!;
            }
          }
          return { ...row, estoque_hoje: estoqueHoje };
        });

        setRawData(mergedRows);
        setImported(false);
        saveCache({ rawData: mergedRows, filters, imported: false, timestamp: new Date().toISOString() });
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
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_]/g, "");

    // ── De-para: nomes da planilha CSV ↔ nomes da API Space ──────────────
    //
    // planilha CSV         │ API Space
    // ─────────────────────┼──────────────────────
    // CODPRODUTO           │ produto_codigo
    // (sem equivalente)    │ produto_sku          ← SKU direto! (chave para conciliação sem VTEX)
    // ESTOQUE_DISPONIVEL   │ estoque
    // FILIAL               │ empresa_venda
    // TAMANHO / NUMERACAO  │ tamanho_descricao
    // PRECO                │ venda_avista
    // QTD_VENDAS           │ vendas
    // VALOR_VENDA          │ total_vendido
    // MARCA                │ marca_descricao

    // SKU direto (produto_sku) — quando existe, usa como chave (dispensa VTEX)
    const skuKey = keys.find((k) => {
      const n = norm(k);
      return n === "PRODUTO_SKU" || n === "PRODUTOSKU" || n === "SKU";
    });

    // Código do produto (fallback se não tiver SKU)
    const codKey = keys.find((k) => {
      const n = norm(k);
      return (
        n === "PRODUTO_CODIGO" || n === "PRODUTOCODIGO" ||
        n === "CODPRODUTO" || n === "COD_PRODUTO" ||
        n === "REFID" || n.includes("CODPRODUTO")
      );
    });

    // Estoque
    const estoqueKey = keys.find((k) => {
      const n = norm(k);
      return (
        n === "ESTOQUE" ||
        n === "ESTOQUE_DISPONIVEL" || n === "ESTOQUEDISPONIVEL" ||
        n.includes("ESTOQUE") || n.includes("SALDO") || n.includes("DISPONIVEL")
      );
    });

    // Tamanho
    const tamanhoKey = keys.find((k) => {
      const n = norm(k);
      return (
        n === "TAMANHO_DESCRICAO" || n === "TAMANHODESCRICAO" ||
        n === "TAMANHO" || n === "NUMERACAO" || n === "GRADE" ||
        n.includes("TAMANHO") || n.includes("NUMERACAO")
      );
    });

    // Filial / Empresa de venda
    const filialKey = keys.find((k) => {
      const n = norm(k);
      return (
        n === "EMPRESA_VENDA" || n === "EMPRESAVENDA" ||
        n === "FILIAL" || n === "LOJA" || n === "CODFILIAL" || n === "COD_FILIAL"
      );
    });

    // Precisa de ao menos uma chave (SKU ou cod_produto) e estoque
    const primaryKey = skuKey || codKey;
    if (!primaryKey || !estoqueKey) {
      setError(`Colunas necessárias não encontradas. Preciso de (produto_sku ou produto_codigo) + estoque. Colunas disponíveis: ${keys.join(", ")}`);
      return;
    }

    const data: Record<string, number> = {};
    const meta: Record<string, { codProduto?: string; tamanho?: string }> = {};
    let validRows = 0;
    const usingSku = !!skuKey; // Se tem SKU direto, a chave é SKU (sem VTEX)

    for (const row of rawData) {
      // Filtro por filial/empresa_venda = 98
      if (filialKey) {
        const filial = String(row[filialKey] ?? "").trim();
        if (filial && !filial.includes("98")) continue;
      }

      // Chave principal
      const keyValue = usingSku
        ? String(row[skuKey!] ?? "").trim()
        : String(row[codKey!] ?? "").trim();
      if (!keyValue) continue;

      const estoque = Number(row[estoqueKey]) || 0;

      if (usingSku) {
        // Usando SKU direto — chave simples (compatível com MeLi.sku)
        data[keyValue] = (data[keyValue] || 0) + estoque;
        // Guardar metadados extras (codProduto, tamanho) para exibir na conciliação
        if (!meta[keyValue]) {
          const codProduto = codKey ? String(row[codKey] ?? "").trim() : undefined;
          const tamanho = tamanhoKey ? String(row[tamanhoKey] ?? "").trim().replace(/\.0$/, "") : undefined;
          meta[keyValue] = {
            codProduto: codProduto || undefined,
            tamanho: tamanho || undefined,
          };
        }
      } else {
        // Usando cod_produto — precisa de tamanho para chave composta (requer VTEX)
        const tamanho = tamanhoKey ? String(row[tamanhoKey] ?? "").trim().replace(/\.0$/, "") : "";
        const key = tamanho ? `${keyValue}|${tamanho}` : keyValue;
        data[key] = (data[key] || 0) + estoque;
      }
      validRows++;
    }

    if (validRows === 0) {
      setError("Nenhum item válido encontrado nos dados retornados (empresa 98).");
      return;
    }

    const label = `Space API (${filters.periodoInicio} a ${filters.periodoFim})`;
    // Se usou SKU direto → source "api" (não precisa de VTEX para conciliar)
    // Se usou cod_produto → source "planilha" (precisa de VTEX)
    setErpData(data, label, usingSku ? "api" : "planilha", usingSku ? meta : undefined);
    setImported(true);
    // Atualiza cache com status de importado
    if (rawData) {
      saveCache({ rawData, filters, imported: true, timestamp: new Date().toISOString() });
    }
    console.log(`[ImportarSpaceAPI] ✓ ${Object.keys(data).length} itens importados via API (chave: ${usingSku ? "produto_sku" : "produto_codigo"})`);
  }, [rawData, filters, setErpData]);

  // ── Exportar CSV ─────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!filteredData || filteredData.length === 0) return;
    // Usa a ordem customizada das colunas (se houver) para o CSV
    const cols = columns.length > 0 ? columns : Object.keys(filteredData[0]);
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
  }, [filteredData, filters, columns]);

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
          {loading ? "Consultando período + estoque hoje..." : "Consultar Space API"}
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

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {columnOrder && (
                <button
                  onClick={() => setColumnOrder(null)}
                  title="Resetar ordem das colunas"
                  style={{ padding: "8px 12px", background: "var(--surface)", color: "var(--slate)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  ↺ Resetar colunas
                </button>
              )}
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
                {/* Cabeçalho (arrastável para reordenar) */}
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      draggable
                      onDragStart={() => handleColumnDragStart(col)}
                      onDragOver={(e) => handleColumnDragOver(e, col)}
                      onDrop={handleColumnDrop}
                      style={{
                        padding: "8px 10px", textAlign: "left", borderBottom: "2px solid var(--border)",
                        color: col === "estoque_hoje" ? "var(--blue)" : "var(--slate)",
                        fontSize: 11, fontWeight: col === "estoque_hoje" ? 700 : 600, whiteSpace: "nowrap",
                        position: "sticky", top: 0,
                        background: col === "estoque_hoje" ? "var(--blue-bg)" : "var(--card)",
                        zIndex: 2,
                        cursor: "grab",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ opacity: 0.35, fontSize: 10 }}>⠿</span>
                        {col === "estoque_hoje" ? `📦 estoque_hoje (${todaySpaceDate()})` : col}
                      </span>
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
                      <td key={j} style={{
                        padding: "6px 10px", borderBottom: "1px solid var(--border)",
                        color: col === "estoque_hoje" ? "var(--blue)" : "var(--ink)",
                        fontWeight: col === "estoque_hoje" ? 700 : 400,
                        background: col === "estoque_hoje" ? "var(--blue-bg)" : undefined,
                        whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
                      }}>
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
