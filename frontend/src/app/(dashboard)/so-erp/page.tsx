"use client";

import { useStock } from "@/contexts/StockContext";
import ConciliacaoTable from "@/components/features/conciliacao/ConciliacaoTable";

export default function SoErpPage() {
  const { conciliacao } = useStock();
  const items = conciliacao.filter((i) => i.status === "so_erp");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
          Só no ERP
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          {items.length} itens presentes no ERP mas ausentes no Mercado Livre
        </p>
      </div>
      <ConciliacaoTable items={items} />
    </div>
  );
}
