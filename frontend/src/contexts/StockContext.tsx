"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { mergeData, mergeDataFull } from "@/lib/xlsx-parser";
import type { VtexEntry } from "@/lib/xlsx-parser";
import type { ConciliacaoItem, SupplyFlowItem } from "@/types";

interface StockState {
  erpData: Record<string, number>;                         // Space ERP: cod_produto → estoque
  vtexMap: Record<string, VtexEntry>;                      // VTEX: sku → {cod_produto, nome_sku}
  meliData: Record<string, { qty: number; desc: string }>; // MeLi: sku → {qty, desc}
  conciliacao: ConciliacaoItem[];
  supplyFlow: SupplyFlowItem[];
  erpFileName: string | null;
  vtexFileName: string | null;
  meliFileName: string | null;
  supplyFlowFileName: string | null;
  lastUpdated: Date | null;
}

interface StockContextValue extends StockState {
  setErpData: (data: Record<string, number>, fileName: string) => void;
  setVtexData: (data: Record<string, VtexEntry>, fileName: string) => void;
  setMeliData: (data: Record<string, { qty: number; desc: string }>, fileName: string) => void;
  setSupplyFlowData: (data: SupplyFlowItem[], fileName: string) => void;
  clearAll: () => void;
}

const StockContext = createContext<StockContextValue | null>(null);

/** Recalcula a conciliação com os dados disponíveis. */
function recompute(
  erpData: Record<string, number>,
  vtexMap: Record<string, VtexEntry>,
  meliData: Record<string, { qty: number; desc: string }>
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
  });

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
    setState((prev) => ({
      ...prev,
      erpData: data,
      erpFileName: fileName,
      conciliacao: recompute(data, prev.vtexMap, prev.meliData),
      lastUpdated: new Date(),
    }));
  }, []);

  const setVtexData = useCallback(
    (data: Record<string, VtexEntry>, fileName: string) => {
      setState((prev) => ({
        ...prev,
        vtexMap: data,
        vtexFileName: fileName,
        conciliacao: recompute(prev.erpData, data, prev.meliData),
        lastUpdated: new Date(),
      }));
    },
    []
  );

  const setMeliData = useCallback(
    (data: Record<string, { qty: number; desc: string }>, fileName: string) => {
      setState((prev) => ({
        ...prev,
        meliData: data,
        meliFileName: fileName,
        conciliacao: recompute(prev.erpData, prev.vtexMap, data),
        lastUpdated: new Date(),
      }));
    },
    []
  );

  const clearAll = useCallback(() => {
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
