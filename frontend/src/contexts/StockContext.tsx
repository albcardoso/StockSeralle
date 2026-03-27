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

// ── Persistência server-side (por fonte individual) ─────────────────────────

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
 * Comprime com gzip para caber no limite de 4.5MB da Vercel
 * (a planilha VTEX com 142K linhas tem ~15MB em JSON, mas ~1-2MB comprimida).
 */
async function saveSource(
  source: "erp" | "vtex" | "meli",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const json = JSON.stringify({ source, ...payload });
    const jsonSizeKB = (json.length / 1024).toFixed(0);

    // Comprime com gzip para payloads grandes
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
      body: new Blob([compressed], { type: "application/gzip" }),
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

/** Carrega estado combinado do servidor (GET retorna todas as fontes juntas). */
async function loadFromServer(): Promise<PersistedState | null> {
  try {
    // Cache-busting: adiciona timestamp para evitar cache do browser
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
      console.log("[StockContext] loadFromServer — servidor retornou vazio (sem dados salvos)");
      return null;
    }

    const erpCount = data.erpData ? Object.keys(data.erpData).length : 0;
    const vtexCount = data.vtexMap ? Object.keys(data.vtexMap).length : 0;
    const meliCount = data.meliData ? Object.keys(data.meliData).length : 0;
    console.log(
      `[StockContext] loadFromServer — recebido: ERP=${erpCount}, VTEX=${vtexCount}, MeLi=${meliCount}, lastUpdated=${data.lastUpdated}`
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
    lastUpdated: null,
    isLoading: true,
  });

  // Flag para evitar salvar quando estamos carregando do servidor
  const isRestoring = useRef(false);

  // ── Carrega dados salvos ao montar ──────────────────────────────────────────
  useEffect(() => {
    isRestoring.current = true;
    loadFromServer().then((saved) => {
      if (saved) {
        const erpData = saved.erpData ?? {};
        const vtexMap = saved.vtexMap ?? {};
        const meliData = saved.meliData ?? {};

        const hasData = Object.keys(erpData).length > 0
          || Object.keys(vtexMap).length > 0
          || Object.keys(meliData).length > 0;

        if (hasData) {
          const conciliacao = recompute(erpData, vtexMap, meliData);

          setState({
            erpData,
            vtexMap,
            meliData,
            conciliacao,
            supplyFlow: [],
            erpFileName: saved.erpFileName ?? null,
            vtexFileName: saved.vtexFileName ?? null,
            meliFileName: saved.meliFileName ?? null,
            supplyFlowFileName: null,
            lastUpdated: saved.lastUpdated ? new Date(saved.lastUpdated) : null,
            isLoading: false,
          });

          console.log(
            `[StockContext] ✓ Dados restaurados do servidor (${conciliacao.length} itens conciliados)`
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
      // Salva apenas a fonte ERP no servidor
      saveSource("erp", {
        erpData: data,
        erpFileName: fileName,
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
          conciliacao: recompute(prev.erpData, data, prev.meliData),
          lastUpdated: new Date(),
        };
        // Salva apenas a fonte VTEX no servidor
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
    (data: Record<string, MeliItem>, fileName: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          meliData: data,
          meliFileName: fileName,
          conciliacao: recompute(prev.erpData, prev.vtexMap, data),
          lastUpdated: new Date(),
        };
        // Salva apenas a fonte MeLi no servidor
        saveSource("meli", {
          meliData: data,
          meliFileName: fileName,
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
