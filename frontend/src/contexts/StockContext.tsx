"use client";

/**
 * Contexto global para armazenar os dados importados de ERP e MeLi.
 * Permite que os dados fluam entre as páginas de importação e a conciliação.
 */

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

  const setErpData = useCallback(
    (data: Record<string, number>, fileName: string) => {
      setState((prev) => {
        const newMeli = prev.meliData;
        const merged =
          Object.keys(data).length > 0 && Object.keys(newMeli).length > 0
            ? mergeData(data, newMeli)
            : prev.conciliacao;
        return {
          ...prev,
          erpData: data,
          erpFileName: fileName,
          conciliacao: merged,
          lastUpdated: new Date(),
        };
      });
    },
    []
  );

  const setMeliData = useCallback(
    (data: Record<string, { qty: number; desc: string }>, fileName: string) => {
      setState((prev) => {
        const newErp = prev.erpData;
        const merged =
          Object.keys(newErp).length > 0 && Object.keys(data).length > 0
            ? mergeData(newErp, data)
            : prev.conciliacao;
        return {
          ...prev,
          meliData: data,
          meliFileName: fileName,
          conciliacao: merged,
          lastUpdated: new Date(),
        };
      });
    },
    []
  );

  const clearAll = useCallback(() => {
    setState({
      erpData: {},
      meliData: {},
      conciliacao: [],
      erpFileName: null,
      meliFileName: null,
      lastUpdated: null,
    });
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
