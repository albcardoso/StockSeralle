"use client";

import UploadCard from "@/components/features/importar/UploadCard";
import { useStock } from "@/contexts/StockContext";
import { parseMeliXlsx } from "@/lib/xlsx-parser";

export default function ImportarMeliPage() {
  const { setMeliData, meliFileName } = useStock();

  async function handleFile(file: File) {
    const data = await parseMeliXlsx(file);
    if (Object.keys(data).length === 0) {
      throw new Error("Nenhum item encontrado. Verifique o formato do arquivo MeLi.");
    }
    setMeliData(data, file.name);
  }

  return (
    <div>
      <PageHeader
        title="Importar Mercado Livre"
        description='Importe o relatório exportado do Mercado Livre (Gerenciador de Anúncios → Exportar).'
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
        description="Arquivo .xlsx exportado do Gerenciador de Anúncios com SKU do vendedor, título e quantidade."
        icon="◈"
        color="var(--amber)"
        bg="var(--amber-bg)"
        onFile={handleFile}
      />

      <FormatHint>
        <b>Colunas esperadas:</b> SKU (ou Seller SKU), Título (ou Title), Quantidade (ou Stock)
      </FormatHint>
    </div>
  );
}

function PageHeader({ title, description, badge, badgeColor, badgeBg }: {
  title: string; description: string; badge: string; badgeColor: string; badgeBg: string;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
          {title}
        </h1>
        <span style={{ padding: "3px 10px", background: badgeBg, color: badgeColor, borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
          {badge}
        </span>
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
    <div style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "var(--slate)", lineHeight: 1.6 }}>
      💡 {children}
    </div>
  );
}
