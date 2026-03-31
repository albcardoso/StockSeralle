"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface SettingsState {
  enableImport: boolean;
  isLoading: boolean;
}

interface SettingsContextValue extends SettingsState {
  setEnableImport: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SettingsState>({
    enableImport: true,
    isLoading: true,
  });

  // Carrega configurações do servidor ao montar
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setState({
          enableImport: data.enableImport ?? true,
          isLoading: false,
        });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  const setEnableImport = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, enableImport: value }));
    // Salva no servidor
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enableImport: value }),
    }).catch((err) => console.warn("[Settings] Erro ao salvar:", err));
  }, []);

  return (
    <SettingsContext.Provider value={{ ...state, setEnableImport }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve ser usado dentro de SettingsProvider");
  return ctx;
}
