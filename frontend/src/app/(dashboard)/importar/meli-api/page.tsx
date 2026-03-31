"use client";

import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useStock } from "@/contexts/StockContext";
import type { MeliItem } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultDateFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultDateTo(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function toISORange(date: string, end = false): string {
  return end ? `${date}T23:59:59.000-03:00` : `${date}T00:00:00.000-03:00`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fmt(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "number") return val % 1 !== 0 ? val.toFixed(2) : String(val);
  return String(val);
}

function timeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "expirado";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}min`;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MeliVendaRow {
  [key: string]: unknown;
}

interface MeliConnectionInfo {
  connected: boolean;
  configured: boolean;
  accessToken?: string | null;
  sellerId?: number;
  sellerNickname?: string;
  expiresAt?: string;
  needsReauth?: boolean;
  error?: string;
}

interface FilterState {
  dateFrom: string;
  dateTo: string;
  // Token manual (fallback se OAuth não configurado)
  manualToken: string;
  manualSellerId: string;
}

type AuthMode = "oauth" | "manual";
type TabMode = "vendas" | "fulfillment";

const PAGE_SIZES = [25, 50, 100, 200];

// Colunas exibidas na tabela de vendas
const VENDAS_DISPLAY_COLS = [
  { key: "numero_venda", label: "Nº Venda" },
  { key: "data_venda", label: "Data", format: formatDate },
  { key: "estado", label: "Estado" },
  { key: "sku", label: "SKU" },
  { key: "numero_anuncio", label: "Anuncio" },
  { key: "titulo_anuncio", label: "Titulo" },
  { key: "variacao", label: "Variacao" },
  { key: "unidades", label: "Qtd" },
  { key: "preco_unitario", label: "Preco Unit." },
  { key: "total_brl", label: "Total (BRL)" },
  { key: "forma_entrega", label: "Entrega" },
  { key: "numero_rastreamento", label: "Rastreio" },
  { key: "comprador_nome", label: "Comprador" },
  { key: "comprador_cidade", label: "Cidade" },
  { key: "comprador_estado", label: "Estado (UF)" },
  { key: "venda_publicidade", label: "Publicidade" },
  { key: "tipo_anuncio", label: "Tipo" },
];

// Colunas para fulfillment
const FULFILLMENT_DISPLAY_COLS = [
  { key: "sku", label: "SKU" },
  { key: "numero_anuncio", label: "Anuncio" },
  { key: "produto", label: "Produto" },
  { key: "variacao", label: "Variacao" },
  { key: "quantidade_disponivel", label: "Disponivel" },
  { key: "quantidade_reservada", label: "Reservado" },
  { key: "quantidade_nao_disponivel", label: "Nao Disp." },
  { key: "quantidade_total", label: "Total" },
  { key: "tipo_produto", label: "Condicao" },
  { key: "listing_type", label: "Tipo Anuncio" },
  { key: "classificacao", label: "Classificacao" },
  { key: "codigo_universal", label: "EAN" },
];

// ── Cache em sessionStorage para manter dados entre navegações ─────────────

const MELI_CACHE_KEY = "stocksync_meli_api_cache";

interface MeliCachedQuery {
  rawData: MeliVendaRow[];
  filters: { dateFrom: string; dateTo: string };
  tab: TabMode;
  imported: boolean;
  totalOrders: number;
  resumoFull: any;
  timestamp: string;
}

function loadMeliCache(): MeliCachedQuery | null {
  try {
    const raw = sessionStorage.getItem(MELI_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MeliCachedQuery;
  } catch { return null; }
}

function saveMeliCache(data: MeliCachedQuery) {
  try {
    sessionStorage.setItem(MELI_CACHE_KEY, JSON.stringify(data));
  } catch { /* sessionStorage cheio — ignora */ }
}

function clearMeliCache() {
  try { sessionStorage.removeItem(MELI_CACHE_KEY); } catch {}
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportarMeliApiPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Carregando...</div>}>
      <ImportarMeliApiPage />
    </Suspense>
  );
}

function ImportarMeliApiPage() {
  const { setMeliData, meliFileName, lastUpdated } = useStock();
  const searchParams = useSearchParams();

  // Carrega cache da última consulta
  const cached = useMemo(() => loadMeliCache(), []);

  // ── Estado da conexão OAuth ──────────────────────────────────────────────
  const [connection, setConnection] = useState<MeliConnectionInfo | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("oauth");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    dateFrom: cached?.filters?.dateFrom ?? defaultDateFrom(),
    dateTo: cached?.filters?.dateTo ?? defaultDateTo(),
    manualToken: "",
    manualSellerId: "",
  });

  const [tab, setTab] = useState<TabMode>(cached?.tab ?? "vendas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<MeliVendaRow[] | null>(cached?.rawData ?? null);
  const [imported, setImported] = useState(cached?.imported ?? false);
  const [totalOrders, setTotalOrders] = useState(cached?.totalOrders ?? 0);
  const [resumoFull, setResumoFull] = useState<any>(cached?.resumoFull ?? null);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const displayCols = tab === "vendas" ? VENDAS_DISPLAY_COLS : FULFILLMENT_DISPLAY_COLS;

  // ── Verificar conexão OAuth ao montar ────────────────────────────────────
  useEffect(() => {
    checkConnection();

    // Verificar se veio do callback OAuth
    const authSuccess = searchParams.get("auth_success");
    const authError = searchParams.get("auth_error");
    const seller = searchParams.get("seller");

    if (authSuccess) {
      setAuthMessage(`Conta conectada com sucesso! Seller: ${seller || "OK"}`);
    } else if (authError) {
      setAuthMessage(`Erro na autenticacao: ${authError}`);
    }
  }, [searchParams]);

  const checkConnection = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const resp = await fetch(`/api/auth/meli/token?_t=${Date.now()}`, { cache: "no-store" });
      const data = await resp.json();
      setConnection(data);

      if (data.connected) {
        setAuthMode("oauth");
      } else if (!data.configured) {
        setAuthMode("manual");
      }
    } catch {
      setConnection({ connected: false, configured: false });
      setAuthMode("manual");
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  // ── Desconectar conta ────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/meli/token", { method: "DELETE" });
      setConnection({ connected: false, configured: true });
      setAuthMessage(null);
      setRawData(null);
    } catch (err) {
      console.error("Erro ao desconectar:", err);
    }
  }, []);

  // ── Obter token e sellerId (OAuth ou manual) ──────────────────────────────
  const getCredentials = useCallback(async (): Promise<{ accessToken: string; sellerId: string } | null> => {
    if (authMode === "oauth" && connection?.connected) {
      // Buscar token fresco (com refresh automático)
      const resp = await fetch(`/api/auth/meli/token?_t=${Date.now()}`, { cache: "no-store" });
      const data = await resp.json();

      if (!data.connected || !data.accessToken) {
        setError("Token expirado. Reconecte sua conta MeLi.");
        setConnection({ connected: false, configured: true, needsReauth: true });
        return null;
      }

      return {
        accessToken: data.accessToken,
        sellerId: String(data.sellerId),
      };
    }

    // Modo manual
    if (!filters.manualToken || !filters.manualSellerId) {
      setError("Informe o Access Token e Seller ID.");
      return null;
    }

    return {
      accessToken: filters.manualToken,
      sellerId: filters.manualSellerId,
    };
  }, [authMode, connection, filters.manualToken, filters.manualSellerId]);

  // ── Dados filtrados ──────────────────────────────────────────────────────
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

  const totalFiltered = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);
  const pagedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safeCurrentPage, pageSize]);

  // ── Consulta API Vendas ──────────────────────────────────────────────────

  const handleConsultarVendas = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawData(null);
    setImported(false);
    setColumnFilters({});
    setPage(1);
    setResumoFull(null);

    const creds = await getCredentials();
    if (!creds) { setLoading(false); return; }

    try {
      const allOrders: MeliVendaRow[] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;
      let total = 0;

      while (hasMore) {
        const resp = await fetch("/api/meli-vendas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: creds.accessToken,
            sellerId: creds.sellerId,
            dateFrom: toISORange(filters.dateFrom),
            dateTo: toISORange(filters.dateTo, true),
            limit,
            offset,
          }),
        });

        const json = await resp.json();
        if (!resp.ok || !json.success) throw new Error(json.error || json.detail || `Erro ${resp.status}`);

        const rows = Array.isArray(json.data) ? json.data : [];
        allOrders.push(...rows);
        total = json.total || 0;
        hasMore = json.hasMore && allOrders.length < total;
        offset += limit;
        if (allOrders.length >= 2000) { hasMore = false; }
      }

      setTotalOrders(total);
      if (allOrders.length === 0) {
        setError("Nenhum pedido retornado pela API do Mercado Livre para o periodo informado.");
        clearMeliCache();
      } else {
        setRawData(allOrders);
        saveMeliCache({
          rawData: allOrders, filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
          tab: "vendas", imported: false, totalOrders: total, resumoFull: null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters, getCredentials]);

  // ── Consulta API Fulfillment ─────────────────────────────────────────────

  const handleConsultarFulfillment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawData(null);
    setImported(false);
    setColumnFilters({});
    setPage(1);
    setResumoFull(null);

    const creds = await getCredentials();
    if (!creds) { setLoading(false); return; }

    try {
      const resp = await fetch("/api/meli-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: creds.accessToken,
          sellerId: creds.sellerId,
        }),
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || json.detail || `Erro ${resp.status}`);

      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.length === 0) {
        setError("Nenhum item fulfillment encontrado.");
        clearMeliCache();
      } else {
        setRawData(rows);
        setResumoFull(json.resumo);
        setTotalOrders(json.total || rows.length);
        saveMeliCache({
          rawData: rows, filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
          tab: "fulfillment", imported: false, totalOrders: json.total || rows.length,
          resumoFull: json.resumo, timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters, getCredentials]);

  const handleConsultar = tab === "vendas" ? handleConsultarVendas : handleConsultarFulfillment;

  // ── Importar para contexto ───────────────────────────────────────────────

  const handleImportar = useCallback(() => {
    if (!rawData || rawData.length === 0) return;

    if (tab === "fulfillment") {
      const data: Record<string, MeliItem> = {};
      for (const row of rawData) {
        const sku = String(row.sku ?? "").trim();
        if (!sku) continue;
        data[sku] = {
          qty: Number(row.quantidade_disponivel) || 0,
          desc: String(row.produto ?? ""),
          entradaPendente: 0,
          mlb: String(row.numero_anuncio ?? ""),
        };
      }
      const label = `MeLi API Fulfillment (${new Date().toLocaleDateString("pt-BR")})`;
      setMeliData(data, label, "api");
      setImported(true);
      if (rawData) {
        saveMeliCache({
          rawData, filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
          tab, imported: true, totalOrders, resumoFull,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      const data: Record<string, MeliItem> = {};
      for (const row of rawData) {
        const sku = String(row.sku ?? "").trim();
        if (!sku) continue;
        if (!data[sku]) {
          data[sku] = { qty: 0, desc: String(row.titulo_anuncio ?? ""), entradaPendente: 0, mlb: String(row.numero_anuncio ?? "") };
        }
        data[sku].qty += Number(row.unidades) || 0;
      }
      const label = `MeLi API Vendas (${filters.dateFrom} a ${filters.dateTo})`;
      setMeliData(data, label, "api");
      setImported(true);
      if (rawData) {
        saveMeliCache({
          rawData, filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
          tab, imported: true, totalOrders, resumoFull,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }, [rawData, tab, filters, totalOrders, resumoFull, setMeliData]);

  // ── Exportar CSV ─────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!filteredData || filteredData.length === 0) return;
    const cols = tab === "vendas" ? Object.keys(filteredData[0]) : FULFILLMENT_DISPLAY_COLS.map((c) => c.key);
    const header = cols.map((c) => `"${c}"`).join(",");
    const rows = filteredData.map((row) => cols.map((c) => `"${fmt(row[c])}"`).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meli-api_${tab}_${filters.dateFrom}_${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredData, filters, tab]);

  // ── Determinar se pode consultar ─────────────────────────────────────────
  const canQuery = authMode === "oauth"
    ? connection?.connected === true
    : !!(filters.manualToken && filters.manualSellerId);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Cabecalho ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Importar Dados MeLi API
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ padding: "3px 10px", background: "#FFF3CD", color: "#856404", border: "1px solid #FFEEBA", borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
              API MERCADO LIVRE
            </span>
            {connection?.connected && (
              <span style={{ padding: "3px 10px", background: "var(--green-bg, #eafbe7)", color: "var(--green, #2e7d32)", border: "1px solid var(--green-border, #b4dfa8)", borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
                {connection.sellerNickname || `Seller ${connection.sellerId}`}
              </span>
            )}
            {meliFileName && (
              <span style={{ padding: "3px 10px", background: "var(--purple-bg)", color: "var(--purple)", border: "1px solid var(--purple-border)", borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {meliFileName}
              </span>
            )}
          </div>
          {lastUpdated && (
            <div style={{ marginTop: 6, fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>
              Ultima importacao: {lastUpdated.toLocaleDateString("pt-BR")} as {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
            Consulte vendas e estoque fulfillment diretamente da API do Mercado Livre.
          </p>
        </div>
      </div>

      {/* ── Card de Conexao OAuth ──────────────────────────────────────────── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
            Conexao Mercado Livre
          </div>
          {/* Toggle OAuth / Manual */}
          <div style={{ display: "flex", gap: 0 }}>
            {(["oauth", "manual"] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setAuthMode(m)}
                style={{
                  padding: "5px 14px", border: "1px solid var(--border)", cursor: "pointer",
                  fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600,
                  background: authMode === m ? "var(--ink)" : "var(--surface)",
                  color: authMode === m ? "#fff" : "var(--slate)",
                  borderRadius: m === "oauth" ? "6px 0 0 6px" : "0 6px 6px 0",
                }}
              >
                {m === "oauth" ? "OAuth (automatico)" : "Token manual"}
              </button>
            ))}
          </div>
        </div>

        {/* Mensagem do callback */}
        {authMessage && (
          <div style={{
            background: authMessage.includes("sucesso") ? "var(--green-bg, #eafbe7)" : "#ffeaea",
            border: `1px solid ${authMessage.includes("sucesso") ? "var(--green-border, #b4dfa8)" : "var(--red-border)"}`,
            borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13,
            color: authMessage.includes("sucesso") ? "var(--green, #2e7d32)" : "var(--red)",
            fontFamily: "DM Mono, monospace",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{authMessage}</span>
            <button onClick={() => setAuthMessage(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>x</button>
          </div>
        )}

        {authMode === "oauth" ? (
          /* ── OAuth Mode ────────────────────────────────────────────────────── */
          <div>
            {loadingAuth ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--mist)", fontSize: 13 }}>
                Verificando conexao...
              </div>
            ) : connection?.connected ? (
              /* Conectado */
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2e7d32", display: "inline-block" }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
                      Conectado: {connection.sellerNickname || `Seller ${connection.sellerId}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>
                    Seller ID: {connection.sellerId} | Token expira em: {connection.expiresAt ? timeUntil(connection.expiresAt) : "?"} (refresh automatico)
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  style={{ padding: "8px 16px", background: "#ffeaea", color: "var(--red)", border: "1px solid var(--red-border)", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Desconectar
                </button>
              </div>
            ) : connection?.configured ? (
              /* Configurado mas não conectado */
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ marginBottom: 10, fontSize: 13, color: "var(--slate)" }}>
                  {connection.needsReauth
                    ? "Token expirado. Clique para reconectar sua conta."
                    : "Conecte sua conta do Mercado Livre para consultar via API automaticamente."}
                </div>
                <a
                  href="/api/auth/meli"
                  style={{
                    display: "inline-block", padding: "10px 28px",
                    background: "#FFE600", color: "#333", borderRadius: 8,
                    fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14,
                    textDecoration: "none", transition: "background 0.15s",
                  }}
                >
                  Conectar Mercado Livre
                </a>
              </div>
            ) : (
              /* Não configurado */
              <div style={{ background: "#FFF3CD", border: "1px solid #FFEEBA", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "#856404" }}>
                <b>OAuth nao configurado.</b> Para usar autenticacao automatica, configure as variaveis no <code style={{ background: "#fff8e1", padding: "2px 6px", borderRadius: 3 }}>.env.local</code>:
                <br /><br />
                <code>MELI_APP_ID=seu_app_id</code><br />
                <code>MELI_CLIENT_SECRET=seu_secret</code><br />
                <code>MELI_REDIRECT_URI=http://localhost:3000/api/auth/meli/callback</code>
                <br /><br />
                Enquanto isso, use a aba <b>Token manual</b> para informar o token diretamente.
              </div>
            )}
          </div>
        ) : (
          /* ── Manual Mode ───────────────────────────────────────────────────── */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Access Token</span>
              <input
                type="password"
                value={filters.manualToken}
                onChange={(e) => setFilters((f) => ({ ...f, manualToken: e.target.value }))}
                placeholder="APP_USR-..."
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Seller ID</span>
              <input
                type="text"
                value={filters.manualSellerId}
                onChange={(e) => setFilters((f) => ({ ...f, manualSellerId: e.target.value }))}
                placeholder="Ex: 123456789"
                style={inputStyle}
              />
            </label>
          </div>
        )}
      </div>

      {/* ── Tabs: Vendas / Fulfillment ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
        {(["vendas", "fulfillment"] as TabMode[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setRawData(null); setError(null); setImported(false); setColumnFilters({}); setPage(1); clearMeliCache(); }}
            style={{
              padding: "10px 24px", border: "1px solid var(--border)", cursor: "pointer",
              fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13,
              background: tab === t ? "var(--ink)" : "var(--card)",
              color: tab === t ? "#fff" : "var(--slate)",
              borderRadius: t === "vendas" ? "8px 0 0 8px" : "0 8px 8px 0",
              transition: "all 0.15s",
            }}
          >
            {t === "vendas" ? "Vendas (Orders)" : "Estoque Fulfillment"}
          </button>
        ))}
      </div>

      {/* ── Card de Filtros ──────────────────────────────────────────────── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 16 }}>
          Filtros da Consulta
        </div>

        {tab === "vendas" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Data Inicio</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Data Fim</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {tab === "fulfillment" && (
          <div style={{ fontSize: 13, color: "var(--slate)", padding: "4px 0" }}>
            Busca todo o estoque atual no centro de distribuicao do Mercado Livre (Mercado Envios Full).
          </div>
        )}

        <button
          onClick={handleConsultar}
          disabled={loading || !canQuery}
          style={{
            marginTop: 20, padding: "10px 28px",
            background: loading || !canQuery ? "var(--ghost)" : "#FFE600",
            color: "#333", border: "none", borderRadius: 8,
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14,
            cursor: loading || !canQuery ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading
            ? `Consultando${tab === "vendas" ? " pedidos" : " estoque"}...`
            : !canQuery
              ? "Conecte sua conta primeiro"
              : `Consultar ${tab === "vendas" ? "Vendas" : "Fulfillment"} MeLi`}
        </button>
      </div>

      {/* ── Erro ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: "#ffeaea", border: "1px solid var(--red-border)", borderRadius: 8, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: "var(--red)", fontFamily: "DM Mono, monospace" }}>
          {error}
        </div>
      )}

      {/* ── Resumo Fulfillment ────────────────────────────────────────────── */}
      {resumoFull && tab === "fulfillment" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Unidades", value: resumoFull.total_unidades, color: "var(--blue)" },
            { label: "Boa Qualidade", value: resumoFull.boa_qualidade, color: "var(--green, #2e7d32)" },
            { label: "Impulsionar", value: resumoFull.impulsionar_vendas, color: "var(--amber)" },
            { label: "Colocar a Venda", value: resumoFull.colocar_venda, color: "var(--purple)" },
            { label: "Evitar Descarte", value: resumoFull.evitar_descarte, color: "var(--red)" },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)", marginBottom: 6 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "Syne, sans-serif", color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {rawData && rawData.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                {tab === "vendas" ? "Vendas MeLi" : "Estoque Fulfillment"}
              </span>
              <span style={{ padding: "3px 8px", background: "#FFF3CD", color: "#856404", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
                {totalFiltered} de {rawData.length} registros{tab === "vendas" ? ` (${totalOrders} total)` : ""}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleExport} style={{ padding: "8px 16px", background: "#FFF3CD", color: "#856404", border: "1px solid #FFEEBA", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Exportar CSV
              </button>
              <button
                onClick={handleImportar}
                disabled={imported}
                style={{
                  padding: "8px 22px",
                  background: imported ? "var(--green, #2e7d32)" : "var(--purple)", color: "#fff", border: "none", borderRadius: 8,
                  fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13,
                  cursor: imported ? "default" : "pointer",
                }}
              >
                {imported ? "Importado" : "Importar para Conciliacao"}
              </button>
            </div>
          </div>

          {imported && (
            <div style={{ background: "var(--green-bg, #eafbe7)", border: "1px solid var(--green-border, #b4dfa8)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--green, #2e7d32)", fontFamily: "DM Mono, monospace" }}>
              Dados importados com sucesso! Os dados do MeLi foram atualizados na conciliacao.
            </div>
          )}

          {/* Tabela */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
              <thead>
                <tr>
                  {displayCols.map((col) => (
                    <th key={col.key} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid var(--border)", color: "var(--slate)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--card)", zIndex: 2 }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {displayCols.map((col) => (
                    <th key={`filter-${col.key}`} style={{ padding: "4px 6px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 32, zIndex: 1 }}>
                      <input
                        type="text" placeholder="Filtrar..."
                        value={columnFilters[col.key] || ""}
                        onChange={(e) => { setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value })); setPage(1); }}
                        style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--border2)", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--ink)", background: "var(--card)", outline: "none", boxSizing: "border-box" }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface)" }}>
                    {displayCols.map((col) => {
                      const val = row[col.key];
                      const formatted = (col as any).format ? (col as any).format(val) : fmt(val);
                      return (
                        <td key={col.key} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", color: "var(--ink)", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {pagedData.length === 0 && (
                  <tr>
                    <td colSpan={displayCols.length} style={{ padding: 20, textAlign: "center", color: "var(--mist)" }}>
                      Nenhum registro encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacao */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12, fontFamily: "DM Mono, monospace", color: "var(--slate)" }}>
              {totalFiltered === 0 ? "Nenhum registro" : `${(safeCurrentPage - 1) * pageSize + 1}–${Math.min(safeCurrentPage * pageSize, totalFiltered)} de ${totalFiltered} registros`}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setPage(1)} disabled={safeCurrentPage <= 1} style={paginationBtn(safeCurrentPage <= 1)}>««</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1} style={paginationBtn(safeCurrentPage <= 1)}>«</button>
              {generatePageNumbers(safeCurrentPage, totalPages).map((p, idx) =>
                p === "..." ? (
                  <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--mist)", fontSize: 12 }}>...</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)} style={{ ...paginationBtn(false), background: safeCurrentPage === p ? "#FFE600" : "var(--surface2)", color: safeCurrentPage === p ? "#333" : "var(--slate)", fontWeight: safeCurrentPage === p ? 700 : 400 }}>
                    {p}
                  </button>
                )
              )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages} style={paginationBtn(safeCurrentPage >= totalPages)}>»</button>
              <button onClick={() => setPage(totalPages)} disabled={safeCurrentPage >= totalPages} style={paginationBtn(safeCurrentPage >= totalPages)}>»»</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>Por pagina:</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: "4px 8px", border: "1px solid var(--border2)", borderRadius: 4, fontSize: 12, fontFamily: "DM Mono, monospace", background: "var(--surface)", color: "var(--ink)", cursor: "pointer" }}>
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Dica ──────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "var(--slate)", lineHeight: 1.8 }}>
        <b>Como funciona:</b>
        <br />
        <b>OAuth (recomendado):</b> Conecte sua conta uma vez e o sistema renova o token automaticamente a cada 6 horas. Voce nunca mais precisa copiar tokens manualmente.
        <br />
        <b>Token manual:</b> Se preferir, informe o Access Token e Seller ID obtidos em{" "}
        <a href="https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>developers.mercadolivre.com.br</a>.
        <br />
        <b>Seller ID:</b> Via <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 3 }}>GET /users/me</code> ou no painel da sua conta.
      </div>
    </div>
  );
}

// ── Helpers de paginacao ────────────────────────────────────────────────────

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

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const labelTextStyle: React.CSSProperties = { fontFamily: "DM Mono, monospace", fontSize: 11, fontWeight: 600, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.5px" };
const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink)", background: "var(--surface)", outline: "none" };

function paginationBtn(disabled: boolean): React.CSSProperties {
  return { padding: "5px 10px", border: "1px solid var(--border2)", borderRadius: 5, background: disabled ? "var(--surface)" : "var(--surface2)", color: disabled ? "var(--ghost)" : "var(--slate)", fontSize: 12, fontFamily: "DM Mono, monospace", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500, transition: "all 0.1s" };
}
