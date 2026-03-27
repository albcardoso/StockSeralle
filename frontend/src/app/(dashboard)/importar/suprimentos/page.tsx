"use client";

import { useState } from "react";
import UploadCard from "@/components/features/importar/UploadCard";
import { useStock } from "@/contexts/StockContext";
import { parseSupplyFlowCsv } from "@/lib/xlsx-parser";

export default function ImportarSuprimentosPage() {
  const { setSupplyFlowData, supplyFlowFileName } = useStock();
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  async function handleFile(file: File) {
    setProcessingMsg("Processando arquivo...");
    await new Promise((r) => setTimeout(r, 100));

    const { data, diag } = await parseSupplyFlowCsv(file);
    setProcessingMsg(null);

    console.log("[ImportarSuprimentos] Diagnóstico:", diag);

    if (data.length === 0) {
      throw new Error(
        `Nenhum produto extraído do arquivo.\n\n${diag.totalRows} linhas lidas.\nColunas: ${diag.detectedColumns.join(", ")}`
      );
    }

    setSupplyFlowData(data, file.name);
    console.log(`[ImportarSuprimentos] ✓ ${data.length} produtos importados de ${file.name}`);
  }

  return (
    <div>
      <PageHeader
        title="Importar Fluxo de Suprimentos"
        description="Importe o relatório de fluxo de suprimentos do Space ERP."
        badge="Space"
        badgeColor="var(--blue)"
        badgeBg="var(--blue-bg)"
      />

      {supplyFlowFileName && (
        <StatusBanner
          message={`Arquivo atual: ${supplyFlowFileName}`}
          color="var(--blue)"
          bg="var(--blue-bg)"
          border="var(--blue-border)"
        />
      )}

      {processingMsg && (
        <div style={{
          background: "var(--blue-bg)", border: "1px solid var(--blue-border)",
          borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          fontSize: 13, color: "var(--blue)", fontFamily: "DM Mono, monospace",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
          {processingMsg}
        </div>
      )}

      <UploadCard
        title="Planilha Space — Fluxo de Suprimentos"
        description="CSV exportado do Space ERP com dados de compras, estoque, vendas, markup e cobertura."
        icon="▤"
        color="var(--blue)"
        bg="var(--blue-bg)"
        onFile={handleFile}
        redirectTo="/fluxo-suprimentos"
        redirectLabel="Suprimentos"
      />

      <FormatHint>
        <b>Formato esperado:</b> CSV separado por <code>;</code> com colunas: DESCRICAO_PRODUTO, COMPRAS, ESTOQUE, VENDAS, TRANSFERENCIAS, PRECOM, MKP_R, GIRO, COBERTURA, ITENS, DT_ULT_COMPRA.
      </FormatHint>
    </div>
  );
}

function PageHeader({ title, description, badge, badgeColor, badgeBg }: { title: string; description: string; badge: string; badgeColor: string; badgeBg: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>{title}</h1>
        <span style={{ padding: "3px 10px", background: badgeBg, color: badgeColor, borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>{badge}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--mist)" }}>{description}</p>
    </div>
  );
}

function StatusBanner({ message, color, bg, border }: { message: string; color: string; bg: string; border: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", marginBottom: 18, fontSize: 13, color, fontFamily: "DM Mono, monospace" }}>
      ✓ {message}
    </div>
  );
}

function FormatHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "var(--slate)", lineHeight: 1.8 }}>
      {children}
    </div>
  );
}
