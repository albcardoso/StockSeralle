"use client";

import UploadCard from "@/components/features/importar/UploadCard";
import { useStock } from "@/contexts/StockContext";
import { parseErpXlsx } from "@/lib/xlsx-parser";

export default function ImportarVtexPage() {
  const { setErpData, erpFileName } = useStock();

  async function handleFile(file: File) {
    const { data, diag } = await parseErpXlsx(file);

    console.log("[ImportarVtex] Diagnóstico:", diag);

    if (Object.keys(data).length === 0) {
      const cols = diag.detectedColumns.length > 0
        ? `\n\nColunas encontradas no arquivo:\n${diag.detectedColumns.join(", ")}\n\nColunas esperadas para SKU: "RefId", "Sku", "Código"\nColunas esperadas para Qtd: "Estoque Total", "Disponível"`
        : "\n\nArquivo parece vazio.";

      throw new Error(`Nenhum item extraído (${diag.totalRows} linhas lidas).${cols}`);
    }

    setErpData(data, file.name);
    console.log(`[ImportarVtex] ✓ ${Object.keys(data).length} itens importados de ${file.name}`);
  }

  return (
    <div>
      <PageHeader title="Importar VTEX (ERP)" description="Importe o relatório de estoque exportado da VTEX." badge="ERP" badgeColor="var(--purple)" badgeBg="var(--purple-bg)" />
      {erpFileName && <StatusBanner message={`Arquivo atual: ${erpFileName}`} color="var(--purple)" bg="var(--purple-bg)" border="var(--purple-border)" />}
      <UploadCard title="Planilha VTEX" description="Arquivo .xlsx exportado da VTEX com RefId, Sku e Estoque Total." icon="□" color="var(--purple)" bg="var(--purple-bg)" onFile={handleFile} />
      <FormatHint>
        <b>Colunas detectadas automaticamente.</b> Se der erro, abra o Console (F12) para ver as colunas detectadas.
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
      💡 {children}
    </div>
  );
}
