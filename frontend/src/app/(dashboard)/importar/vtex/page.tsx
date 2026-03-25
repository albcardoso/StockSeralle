"use client";

import UploadCard from "@/components/features/importar/UploadCard";
import { useStock } from "@/contexts/StockContext";
import { parseVtexMapping } from "@/lib/xlsx-parser";

export default function ImportarVtexPage() {
  const { setVtexData, vtexFileName } = useStock();

  async function handleFile(file: File) {
    const { data, diag } = await parseVtexMapping(file);

    console.log("[ImportarVtex] Diagnóstico:", diag);

    if (Object.keys(data).length === 0) {
      const detail =
        diag.totalRows > 0
          ? `\n\n${diag.totalRows} linhas lidas.\nColunas usadas: ${diag.detectedColumns.join(", ")}`
          : "\n\nArquivo parece vazio ou sem linhas válidas.";

      throw new Error(`Nenhum SKU extraído do mapeamento VTEX.${detail}`);
    }

    setVtexData(data, file.name);
    console.log(
      `[ImportarVtex] ✓ ${Object.keys(data).length} SKUs mapeados de ${file.name}`
    );
  }

  return (
    <div>
      <PageHeader
        title="Importar VTEX (Mapeamento)"
        description="Importe o export de catálogo da VTEX para mapear SKU → Código do Produto."
        badge="VTEX"
        badgeColor="var(--purple)"
        badgeBg="var(--purple-bg)"
      />

      {vtexFileName && (
        <StatusBanner
          message={`Arquivo atual: ${vtexFileName}`}
          color="var(--purple)"
          bg="var(--purple-bg)"
          border="var(--purple-border)"
        />
      )}

      <UploadCard
        title="Planilha VTEX"
        description="Export de produtos/SKUs da VTEX (.xlsx). Usado para mapear SKU do MeLi → Código do Produto do ERP."
        icon="□"
        color="var(--purple)"
        bg="var(--purple-bg)"
        onFile={handleFile}
      />

      <FormatHint>
        <b>Colunas utilizadas (fixas, igual ao MVP):</b><br />
        Col 22 (índice 21) = Código de referência do produto &nbsp;·&nbsp;
        Col 25 (índice 24) = Nome do SKU &nbsp;·&nbsp;
        Col 29 (índice 28) = Código de referência do SKU<br />
        Dados a partir da linha 3. Arquivo de ~35 MB pode levar alguns segundos para processar.
      </FormatHint>
    </div>
  );
}

function PageHeader({
  title,
  description,
  badge,
  badgeColor,
  badgeBg,
}: {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.5px",
          }}
        >
          {title}
        </h1>
        <span
          style={{
            padding: "3px 10px",
            background: badgeBg,
            color: badgeColor,
            borderRadius: 5,
            fontSize: 11,
            fontFamily: "DM Mono, monospace",
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--mist)" }}>{description}</p>
    </div>
  );
}

function StatusBanner({
  message,
  color,
  bg,
  border,
}: {
  message: string;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "10px 16px",
        marginBottom: 18,
        fontSize: 13,
        color,
        fontFamily: "DM Mono, monospace",
      }}
    >
      ✓ {message}
    </div>
  );
}

function FormatHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 20,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        fontSize: 13,
        color: "var(--slate)",
        lineHeight: 1.8,
      }}
    >
      💡 {children}
    </div>
  );
}
