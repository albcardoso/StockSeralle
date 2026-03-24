"use client";

import UploadCard from "@/components/features/importar/UploadCard";
import { useStock } from "@/contexts/StockContext";
import { parseMeliXlsx } from "@/lib/xlsx-parser";

export default function ImportarMeliPage() {
  const { setMeliData, meliFileName } = useStock();

  async function handleFile(file: File) {
    const { data, diag } = await parseMeliXlsx(file);

    // Log completo no console do browser para debug
    console.log("[ImportarMeli] Diagnóstico:", diag);

    if (Object.keys(data).length === 0) {
      const cols = diag.detectedColumns.length > 0
        ? `\n\nColunas encontradas no arquivo:\n${diag.detectedColumns.join(", ")}\n\nColunas esperadas para SKU: "SKU do vendedor", "SKU", "Seller SKU"\nColunas esperadas para Qtd: "Quantidade disponível", "Quantidade", "Stock"`
        : "\n\nArquivo parece vazio ou sem linhas válidas.";

      throw new Error(
        `Nenhum item extraído do arquivo (${diag.totalRows} linhas lidas).${cols}`
      );
    }

    setMeliData(data, file.name);
    console.log(`[ImportarMeli] ✓ ${Object.keys(data).length} itens importados de ${file.name}`);
  }

  return (
    <div>
      <PageHeader
        title="Importar Mercado Livre"
        description='Importe o relatório exportado do Gerenciador de Anúncios do MeLi.'
        badge="MeLi"
        badgeColor="var(--amber)"
        badgeBg="var(--amber-bg)"
      />

      {meliFileName && (
        <StatusBanner
          message={`Arquivo atual: ${meliFileName}`}
          color="var(--amber)"
          bg="var(--amber-bg)"
          border="var(--amber-border)"
        />
      )}

      <UploadCard
        title="Planilha Mercado Livre"
        description='No MeLi: Anúncios → Gerenciar anúncios → Exportar planilha'
        icon="◈"
        color="var(--amber)"
        bg="var(--amber-bg)"
        onFile={handleFile}
      />

      <FormatHint>
        <b>Colunas detectadas automaticamente.</b> O parser reconhece qualquer variação de export do MeLi BR.<br />
        Se der erro, abra o Console (F12) para ver as colunas detectadas no arquivo.
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
