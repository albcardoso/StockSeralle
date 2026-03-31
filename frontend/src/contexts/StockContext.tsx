"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { mergeData, mergeDataFull } from "@/lib/xlsx-parser";
import type { VtexEntry } from "@/lib/xlsx-parser";
import type { ConciliacaoItem, MeliItem, SupplyFlowItem } from "@/types";

// ── Tipos de fonte dos dados ────────────────────────────────────────────────

type DataSource = "planilha" | "api";

interface StockState {
  erpData: Record<string, number>;                         // Space ERP: cod_produto|tamanho → estoque
  vtexMap: Record<string, VtexEntry>;                      // VTEX: sku → {cod_produto, nome_sku}
  meliData: Record<string, MeliItem>;                      // MeLi: sku → {qty, desc, entradaPendente, mlb}
  conciliacao: ConciliacaoItem[];
  supplyFlow: SupplyFlowItem[];
  erpFileName: string | null;
  vtexFileName: string | null;
  meliFileName: string | null;
  supplyFlowFileName: string | null;
  erpSource: DataSource | null;
  meliSource: DataSource | null;
  lastUpdated: Date | null;
  isLoading: boolean;
}

/**
 * Cenários de conciliação possíveis:
 *
 * Cenário 1: Planilha MeLi + API Space      → mergeData (2-way direto por SKU)
 * Cenário 2: 3 Planilhas (MeLi + Space + VTEX) → mergeDataFull (3-way via VTEX)
 * Cenário 3: API MeLi + API Space            → mergeData (2-way direto por SKU)
 * Cenário 4: API MeLi + Planilha Space + VTEX → mergeDataFull (3-way via VTEX)
 *
 * Regra: quando ERP vem da API Space, ele já traz SKU como chave,
 * então NÃO precisa do mapeamento VTEX → usa mergeData (2-way).
 * Quando ERP vem da planilha Space, a chave é cod_produto|tamanho,
 * então PRECISA do VTEX → usa mergeDataFull (3-way).
 */

interface StockContextValue extends StockState {
  setErpData: (data: Record<string, number>, fileName: string, source?: DataSource) => void;
  setVtexData: (data: Record<string, VtexEntry>, fileName: string) => void;
  setMeliData: (data: Record<string, MeliItem>, fileName: string, source?: DataSource) => void;
  setSupplyFlowData: (data: SupplyFlowItem[], fileName: string) => void;
  clearAll: () => void;
  /** Retorna o cenário atual de conciliação, ou null se dados insuficientes */
  getConciliationScenario: () => ConciliationScenario | null;
  /** Indica se há dados suficientes para conciliar */
  canReconcile: boolean;
}

export type ConciliationScenario =
  | "api_space_api_meli"         // Cenário 3
  | "api_space_planilha_meli"    // Cenário 1
  | "planilha_space_vtex_api_meli"     // Cenário 4
  | "planilha_space_vtex_planilha_meli" // Cenário 2
  ;

const StockContext = createContext<StockContextValue | null>(null);

/** Recalcula a conciliação com base no cenário identificado. */
function recompute(
  erpData: Record<string, number>,
  vtexMap: Record<string, VtexEntry>,
  meliData: Record<string, MeliItem>,
  erpSource: DataSource | null,
): ConciliacaoItem[] {
  const hasErp = Object.keys(erpData).length > 0;
  const hasVtex = Object.keys(vtexMap).length > 0;
  const hasMeli = Object.keys(meliData).length > 0;

  if (!hasErp || !hasMeli) return [];

  // Se ERP veio da API Space → chave já é SKU → join direto (sem VTEX)
  if (erpSource === "api") {
    return mergeData(erpData, meliData);
  }

  // Se ERP veio de planilha → precisa VTEX para mapear cod_produto → SKU
  if (hasVtex) {
    return mergeDataFull(erpData, vtexMap, meliData);
  }

  // Fallback 2-way (caso ERP e MeLi compartilhem mesmas chaves)
  return mergeData(erpData, meliData);
}

// ── Persistência server-side (por fonte individual) ─────────────────────────

interface PersistedState {
  erpData: Record<string, number>;
  vtexMap: Record<string, VtexEntry>;
  meliData: Record<string, MeliItem>;
  supplyFlow?: SupplyFlowItem[];
  erpFileName: string | null;
  vtexFileName: string | null;
  meliFileName: string | null;
  supplyFlowFileName?: string | null;
  erpSource?: DataSource | null;
  meliSource?: DataSource | null;
  lastUpdated: string | null;
  savedAt?: string;
  empty?: boolean;
}

/**
 * Comprime uma string com gzip usando a CompressionStream API do browser.
 * Retorna um Uint8Array comprimido.
 */
async function gzipCompress(text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Salva UMA fonte de dados no servidor.
 * Comprime com gzip para caber no limite de 4.5MB da Vercel.
 */
async function saveSource(
  source: "erp" | "vtex" | "meli" | "supply",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const json = JSON.stringify({ source, ...payload });
    const jsonSizeKB = (json.length / 1024).toFixed(0);

    const compressed = await gzipCompress(json);
    const compressedSizeKB = (compressed.length / 1024).toFixed(0);

    console.log(
      `[StockContext] Salvando ${source}: ${jsonSizeKB} KB → ${compressedSizeKB} KB gzip`
    );

    const r = await fetch("/api/stock-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/gzip",
        "Content-Encoding": "gzip",
      },
      body: compressed as unknown as BodyInit,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.warn(`[StockContext] Erro ao salvar ${source}:`, r.status, text);
      return false;
    }
    const result = await r.json().catch(() => ({}));
    console.log(`[StockContext] ✓ ${source} salvo no servidor em`, result.savedAt);
    return true;
  } catch (err) {
    console.warn(`[StockContext] Erro ao salvar ${source}:`, err);
    return false;
  }
}

/** Carrega estado combinado do servidor. */
async function loadFromServer(): Promise<PersistedState | null> {
  try {
    const resp = await fetch(`/api/stock-data?_t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (!resp.ok) {
      console.warn("[StockContext] loadFromServer — resposta não-ok:", resp.status);
      return null;
    }

    const data = (await resp.json()) as PersistedState;

    if (data.empty) {
      console.log("[StockContext] loadFromServer — servidor retornou vazio");
      return null;
    }

    const erpCount = data.erpData ? Object.keys(data.erpData).length : 0;
    const vtexCount = data.vtexMap ? Object.keys(data.vtexMap).length : 0;
    const meliCount = data.meliData ? Object.keys(data.meliData).length : 0;
    console.log(
      `[StockContext] loadFromServer — ERP=${erpCount} (${data.erpSource || "?"}), VTEX=${vtexCount}, MeLi=${meliCount} (${data.meliSource || "?"})`
    );

    return data;
  } catch (err) {
    console.error("[StockContext] loadFromServer — erro:", err);
    return null;
  }
}

/** Limpa dados no servidor. */
function clearServer() {
  fetch("/api/stock-data", { method: "DELETE" }).catch(() => {});
}

// ── Provider ────────────────────────────────────────────────────────────────────

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StockState>({
    erpData: {},
    vtexMap: {},
    meliData: {},
    conciliacao: [],
    supplyFlow: [],
    erpFileName: null,
    vtexFileName: null,
    meliFileName: null,
    supplyFlowFileName: null,
    erpSource: null,
    meliSource: null,
    lastUpdated: null,
    isLoading: true,
  });

  const isRestoring = useRef(false);

  // ── Carrega dados salvos ao montar ──────────────────────────────────────────
  useEffect(() => {
    isRestoring.current = true;
    loadFromServer().then((saved) => {
      if (saved) {
        const erpData = saved.erpData ?? {};
        const vtexMap = saved.vtexMap ?? {};
        const meliData = saved.meliData ?? {};
        const erpSource = saved.erpSource ?? null;
        const meliSource = saved.meliSource ?? null;

        const hasData = Object.keys(erpData).length > 0
          || Object.keys(vtexMap).length > 0
          || Object.keys(meliData).length > 0;

        if (hasData || (saved.supplyFlow && saved.supplyFlow.length > 0)) {
          const conciliacao = recompute(erpData, vtexMap, meliData, erpSource);

          setState({
            erpData,
            vtexMap,
            meliData,
            conciliacao,
            supplyFlow: saved.supplyFlow ?? [],
            erpFileName: saved.erpFileName ?? null,
            vtexFileName: saved.vtexFileName ?? null,
            meliFileName: saved.meliFileName ?? null,
            supplyFlowFileName: saved.supplyFlowFileName ?? null,
            erpSource,
            meliSource,
            lastUpdated: saved.lastUpdated ? new Date(saved.lastUpdated) : null,
            isLoading: false,
          });

          console.log(
            `[StockContext] ✓ Dados restaurados (${conciliacao.length} itens conciliados)`
          );
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
      isRestoring.current = false;
    });
  }, []);

  // ── Callbacks de importação ────────────────────────────────────────────────

  const setSupplyFlowData = useCallback(
    (data: SupplyFlowItem[], fileName: string) => {
      setState((prev) => ({
        ...prev,
        supplyFlow: data,
        supplyFlowFileName: fileName,
        lastUpdated: new Date(),
      }));
      saveSource("supply", {
        supplyFlow: data,
        supplyFlowFileName: fileName,
        lastUpdated: new Date().toISOString(),
      });
    },
    []
  );

  const setErpData = useCallback((data: Record<string, number>, fileName: string, source: DataSource = "planilha") => {
    setState((prev) => {
      const next = {
        ...prev,
        erpData: data,
        erpFileName: fileName,
        erpSource: source,
        conciliacao: recompute(data, prev.vtexMap, prev.meliData, source),
        lastUpdated: new Date(),
      };
      saveSource("erp", {
        erpData: data,
        erpFileName: fileName,
        erpSource: source,
        lastUpdated: new Date().toISOString(),
      });
      return next;
    });
  }, []);

  const setVtexData = useCallback(
    (data: Record<string, VtexEntry>, fileName: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          vtexMap: data,
          vtexFileName: fileName,
          conciliacao: recompute(prev.erpData, data, prev.meliData, prev.erpSource),
          lastUpdated: new Date(),
        };
        saveSource("vtex", {
          vtexMap: data,
          vtexFileName: fileName,
          lastUpdated: new Date().toISOString(),
        });
        return next;
      });
    },
    []
  );

  const setMeliData = useCallback(
    (data: Record<string, MeliItem>, fileName: string, source: DataSource = "planilha") => {
      setState((prev) => {
        const next = {
          ...prev,
          meliData: data,
          meliFileName: fileName,
          meliSource: source,
          conciliacao: recompute(prev.erpData, prev.vtexMap, data, prev.erpSource),
          lastUpdated: new Date(),
        };
        saveSource("meli", {
          meliData: data,
          meliFileName: fileName,
          meliSource: source,
          lastUpdated: new Date().toISOString(),
        });
        return next;
      });
    },
    []
  );

  const clearAll = useCallback(() => {
    clearServer();
    setState({
      erpData: {},
      vtexMap: {},
      meliData: {},
      conciliacao: [],
      supplyFlow: [],
      erpFileName: null,
      vtexFileName: null,
      meliFileName: null,
      supplyFlowFileName: null,
      erpSource: null,
      meliSource: null,
      lastUpdated: null,
      isLoading: false,
    });
  }, []);

  const getConciliationScenario = useCallback((): ConciliationScenario | null => {
    const hasErp = Object.keys(state.erpData).length > 0;
    const hasVtex = Object.keys(state.vtexMap).length > 0;
    const hasMeli = Object.keys(state.meliData).length > 0;

    if (!hasErp || !hasMeli) return null;

    const erpIsApi = state.erpSource === "api";
    const meliIsApi = state.meliSource === "api";

    if (erpIsApi && meliIsApi) return "api_space_api_meli";
    if (erpIsApi && !meliIsApi) return "api_space_planilha_meli";
    if (!erpIsApi && meliIsApi && hasVtex) return "planilha_space_vtex_api_meli";
    if (!erpIsApi && !meliIsApi && hasVtex) return "planilha_space_vtex_planilha_meli";

    return null;
  }, [state.erpData, state.vtexMap, state.meliData, state.erpSource, state.meliSource]);

  const canReconcile = state.conciliacao.length > 0;

  return (
    <StockContext.Provider
      value={{
        ...state,
        setErpData,
        setVtexData,
        setMeliData,
        setSupplyFlowData,
        clearAll,
        getConciliationScenario,
        canReconcile,
      }}
    >
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStock deve ser usado dentro de StockProvider");
  return ctx;
}
