"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { mergeData, mergeDataFull } from "@/lib/xlsx-parser";
import type { VtexEntry } from "@/lib/xlsx-parser";
import type { ConciliacaoItem, MeliItem, SupplyFlowItem } from "@/types";

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
  lastUpdated: Date | null;
  isLoading: boolean;
}

interface StockContextValue extends StockState {
  setErpData: (data: Record<string, number>, fileName: string) => void;
  setVtexData: (data: Record<string, VtexEntry>, fileName: string) => void;
  setMeliData: (data: Record<string, MeliItem>, fileName: string) => void;
  setSupplyFlowData: (data: SupplyFlowItem[], fileName: string) => void;
  clearAll: () => void;
}

const StockContext = createContext<StockContextValue | null>(null);

/** Recalcula a conciliação com os dados disponíveis. */
function recompute(
  erpData: Record<string, number>,
  vtexMap: Record<string, VtexEntry>,
  meliData: Record<string, MeliItem>
): ConciliacaoItem[] {
  const hasErp = Object.keys(erpData).length > 0;
  const hasVtex = Object.keys(vtexMap).length > 0;
  const hasMeli = Object.keys(meliData).length > 0;

  if (!hasErp || !hasMeli) return [];

  if (hasVtex) {
    // Join completo: MeLi.sku → vtexMap → cod_produto → erpData
    return mergeDataFull(erpData, vtexMap, meliData);
  }

  // Fallback 2-way: erpData e meliData compartilham as mesmas chaves
  return mergeData(erpData, meliData);
}

// ── Persistência server-side ───────────────────────────────────────────────────

interface PersistedState {
  erpData: Record<string, number>;
  vtexMap: Record<string, VtexEntry>;
  meliData: Record<string, MeliItem>;
  erpFileName: string | null;
  vtexFileName: string | null;
  meliFileName: string | null;
  lastUpdated: string | null;
  savedAt?: string;
  empty?: boolean;
}

/** Salva estado no servidor (fire-and-forget). */
function saveToServer(state: StockState) {
  const payload: PersistedState = {
    erpData: state.erpData,
    vtexMap: state.vtexMap,
    meliData: state.meliData,
    erpFileName: state.erpFileName,
    vtexFileName: state.vtexFileName,
    meliFileName: state.meliFileName,
    lastUpdated: state.lastUpdated?.toISOString() ?? null,
  };

  fetch("/api/stock-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => {
      if (!r.ok) console.warn("[StockContext] Erro ao salvar no servidor:", r.status);
      else console.log("[StockContext] ✓ Dados salvos no servidor");
    })
    .catch((err) => console.warn("[StockContext] Erro ao salvar:", err));
}

/** Carrega estado do servidor. */
async function loadFromServer(): Promise<PersistedState | null> {
  try {
    const resp = await fetch("/api/stock-data");
    if (!resp.ok) return null;
    const data = (await resp.json()) as PersistedState;
    if (data.empty) return null;
    return data;
  } catch {
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
    lastUpdated: null,
    isLoading: true,
  });

  // Flag para evitar salvar quando estamos carregando do servidor
  const isRestoring = useRef(false);

  // ── Carrega dados salvos ao montar ──────────────────────────────────────────
  useEffect(() => {
    isRestoring.current = true;
    loadFromServer().then((saved) => {
      if (saved && saved.erpData && saved.meliData) {
        const erpData = saved.erpData;
        const vtexMap = saved.vtexMap ?? {};
        const meliData = saved.meliData;
        const conciliacao = recompute(erpData, vtexMap, meliData);

        setState({
          erpData,
          vtexMap,
          meliData,
          conciliacao,
          supplyFlow: [],
          erpFileName: saved.erpFileName,
          vtexFileName: saved.vtexFileName,
          meliFileName: saved.meliFileName,
          supplyFlowFileName: null,
          lastUpdated: saved.lastUpdated ? new Date(saved.lastUpdated) : null,
          isLoading: false,
        });

        console.log(
          `[StockContext] ✓ Dados restaurados do servidor (${conciliacao.length} itens, importado em ${saved.lastUpdated})`
        );
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
      isRestoring.current = false;
    });
  }, []);

  // ── Callbacks de importação (salvam no servidor automaticamente) ────────────

  const setSupplyFlowData = useCallback(
    (data: SupplyFlowItem[], fileName: string) => {
      setState((prev) => ({
        ...prev,
        supplyFlow: data,
        supplyFlowFileName: fileName,
        lastUpdated: new Date(),
      }));
    },
    []
  );

  const setErpData = useCallback((data: Record<string, number>, fileName: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        erpData: data,
        erpFileName: fileName,
        conciliacao: recompute(data, prev.vtexMap, prev.meliData),
        lastUpdated: new Date(),
      };
      // Salva no servidor após atualizar
      saveToServer(next);
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
          conciliacao: recompute(prev.erpData, data, prev.meliData),
          lastUpdated: new Date(),
        };
        saveToServer(next);
        return next;
      });
    },
    []
  );

  const setMeliData = useCallback(
    (data: Record<string, MeliItem>, fileName: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          meliData: data,
          meliFileName: fileName,
          conciliacao: recompute(prev.erpData, prev.vtexMap, data),
          lastUpdated: new Date(),
        };
        saveToServer(next);
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
      lastUpdated: null,
      isLoading: false,
    });
  }, []);

  return (
    <StockContext.Provider
      value={{ ...state, setErpData, setVtexData, setMeliData, setSupplyFlowData, clearAll }}
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
