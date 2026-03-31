"use client";

import { useSettings } from "@/contexts/SettingsContext";

export default function ConfiguracoesPage() {
  const { enableImport, isLoading, setEnableImport } = useSettings();

  if (isLoading) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--slate)" }}>
          Carregando configurações...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
          Configurações
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          Ajuste o comportamento do sistema
        </p>
      </div>

      {/* Card de Importação */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "24px",
        maxWidth: 560,
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)", marginBottom: 4 }}>
              Habilitar Importação de Planilhas
            </div>
            <div style={{ fontSize: 12, color: "var(--mist)", lineHeight: 1.5 }}>
              Quando desabilitado, o menu de importação de planilhas fica oculto e a conciliação funciona somente por consulta de API (Space + MeLi).
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={() => setEnableImport(!enableImport)}
            aria-label={enableImport ? "Desabilitar importação" : "Habilitar importação"}
            style={{
              position: "relative",
              width: 52,
              height: 28,
              borderRadius: 14,
              border: "none",
              background: enableImport ? "var(--accent)" : "var(--border2)",
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: enableImport ? 27 : 3,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Status atual */}
        <div style={{
          marginTop: 16,
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "DM Mono, monospace",
          background: enableImport ? "var(--green-bg)" : "var(--blue-bg)",
          color: enableImport ? "var(--green)" : "var(--blue)",
          border: `1px solid ${enableImport ? "var(--green-border, #b2dfdb)" : "var(--blue-border)"}`,
        }}>
          {enableImport
            ? "Importação habilitada — menus de planilhas visíveis + consulta por API"
            : "Importação desabilitada — conciliação apenas por API (Space + MeLi)"}
        </div>
      </div>

      {/* Info sobre cenários */}
      <div style={{
        marginTop: 20,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "20px 24px",
        maxWidth: 560,
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>
          Cenários de Conciliação
        </div>
        <div style={{ fontSize: 12, color: "var(--slate)", lineHeight: 1.8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
            <span><b>API Space + API MeLi</b> — conciliação direta por SKU (sem VTEX)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
            <span><b>API Space + Planilha MeLi</b> — conciliação direta por SKU (sem VTEX)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
            <span><b>API MeLi + Planilha Space + Planilha VTEX</b> — conciliação via mapeamento VTEX</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
            <span><b>3 Planilhas (Space + VTEX + MeLi)</b> — conciliação tradicional</span>
          </div>
        </div>
      </div>
    </div>
  );
}
