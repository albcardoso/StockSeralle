"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { mergeData } from "@/lib/xlsx-parser";
import type { ConciliacaoItem } from "@/types";

interface StockState {
  erpData: Record<string, number>;
  meliData: Record<string, { qty: number; desc: string }>;
  conciliacao: ConciliacaoItem[];
  erpFileName: string | null;
  meliFileName: string | null;
  lastUpdated: Date | null;
}

interface StockContextValue extends StockState {
  setErpData: (data: Record<string, number>, fileName: string) => void;
  setMeliData: (data: Record<string, { qty: number; desc: string }>, fileName: string) => void;
  clearAll: () => void;
}

const StockContext = createContext<StockContextValue | null>(null);

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StockState>({
    erpData: {},
    meliData: {},
    conciliacao: [],
    erpFileName: null,
    meliFileName: null,
    lastUpdated: null,
  });

  const setErpData = useCallback((data: Record<string, number>, fileName: string) => {
    setState((prev) => {
      const merged =
        Object.keys(data).length > 0 && Object.keys(prev.meliData).length > 0
          ? mergeData(data, prev.meliData)
          : prev.conciliacao;
      return { ...prev, erpData: data, erpFileName: fileName, conciliacao: merged, lastUpdated: new Date() };
    });
  }, []);

  const setMeliData = useCallback((data: Record<string, { qty: number; desc: string }>, fileName: string) => {
    setState((prev) => {
      const merged =
        Object.keys(prev.erpData).length > 0 && Object.keys(data).length > 0
          ? mergeData(prev.erpData, data)
          : prev.conciliacao;
      return { ...prev, meliData: data, meliFileName: fileName, conciliacao: merged, lastUpdated: new Date() };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState({ erpData: {}, meliData: {}, conciliacao: [], erpFileName: null, meliFileName: null, lastUpdated: null });
  }, []);

  return (
    <StockContext.Provider value={{ ...state, setErpData, setMeliData, clearAll }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStock deve ser usado dentro de StockProvider");
  return ctx;
}
