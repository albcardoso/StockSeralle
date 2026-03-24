"use client";

import { useStock } from "@/contexts/StockContext";
import ConciliacaoTable from "@/components/features/conciliacao/ConciliacaoTable";

export default function SoMeliPage() {
  const { conciliacao } = useStock();
  const items = conciliacao.filter((i) => i.status === "so_meli");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
          Só no MeLi
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          {items.length} itens presentes no Mercado Livre mas ausentes no ERP
        </p>
      </div>
      <ConciliacaoTable items={items} />
    </div>
  );
}
