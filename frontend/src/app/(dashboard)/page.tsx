"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStock } from "@/contexts/StockContext";

export default function DashboardPage() {
  const { conciliacao, erpFileName, meliFileName } = useStock();
  const router = useRouter();

  const hasData = conciliacao.length > 0;

  const stats = useMemo(() => hasData
    ? {
        totalErp: conciliacao.filter((i) => i.qtdErp !== undefined).length,
        totalMeli: conciliacao.filter((i) => i.qtdMeli !== undefined).length,
        divergencias: conciliacao.filter((i) => i.status === "divergente").length,
        soErp: conciliacao.filter((i) => i.status === "so_erp").length,
        soMeli: conciliacao.filter((i) => i.status === "so_meli").length,
        okCount: conciliacao.filter((i) => i.status === "ok").length,
      }
    : null, [conciliacao]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          Visão geral da conciliação ERP × Mercado Livre
        </p>
      </div>

      {stats ? (
        <>
          {/* Arquivos importados */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {erpFileName && <FileBadge label={erpFileName} color="var(--purple)" bg="var(--purple-bg)" />}
            {meliFileName && <FileBadge label={meliFileName} color="var(--amber)" bg="var(--amber-bg)" />}
          </div>

          {/* Métricas */}
          <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
            <MetricCard label="Total ERP" value={stats.totalErp} color="var(--blue)" bg="var(--blue-bg)" onClick={() => router.push("/conciliacao")} />
            <MetricCard label="Total MeLi" value={stats.totalMeli} color="var(--purple)" bg="var(--purple-bg)" onClick={() => router.push("/conciliacao")} />
            <MetricCard label="Divergências" value={stats.divergencias} color="var(--red)" bg="var(--red-bg)" highlight onClick={() => router.push("/conciliacao")} />
            <MetricCard label="Só no ERP" value={stats.soErp} color="var(--amber)" bg="var(--amber-bg)" onClick={() => router.push("/so-erp")} />
            <MetricCard label="Só no MeLi" value={stats.soMeli} color="var(--amber)" bg="var(--amber-bg)" onClick={() => router.push("/so-meli")} />
            <MetricCard label="OK" value={stats.okCount} color="var(--green)" bg="var(--green-bg)" onClick={() => router.push("/conciliacao")} />
          </div>

          {/* Ação rápida */}
          <div className="quick-actions" style={{ display: "flex", gap: 10 }}>
            <QuickAction icon="⇄" label="Ver Conciliação" onClick={() => router.push("/conciliacao")} primary />
            <QuickAction icon="↑" label="Reimportar ERP" onClick={() => router.push("/importar/space")} />
            <QuickAction icon="↑" label="Reimportar MeLi" onClick={() => router.push("/importar/meli")} />
          </div>
        </>
      ) : (
        <EmptyState erpDone={!!erpFileName} meliDone={!!meliFileName} router={router} />
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({ label, value, color, bg, onClick, highlight }: {
  label: string; value: number; color: string; bg: string; onClick?: () => void; highlight?: boolean;
}) {
  return (
    <div className="fu" onClick={onClick}
      style={{ background: "var(--surface)", border: `1px solid ${highlight ? color : "var(--border)"}`, borderRadius: 10, padding: "16px 18px", boxShadow: "var(--shadow-sm)", cursor: onClick ? "pointer" : "default", transition: "transform 0.1s" }}
      onMouseEnter={(e) => onClick && ((e.currentTarget as HTMLElement).style.transform = "translateY(-1px)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = "none")}>
      <div style={{ fontSize: 12, color: "var(--mist)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 26, fontWeight: 500, color, background: bg, display: "inline-block", padding: "2px 8px", borderRadius: 6 }}>
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function FileBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ padding: "4px 12px", background: bg, color, borderRadius: 6, fontSize: 11, fontFamily: "DM Mono, monospace" }}>
      ✓ {label}
    </span>
  );
}

function QuickAction({ icon, label, onClick, primary }: { icon: string; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ padding: "9px 18px", background: primary ? "var(--accent)" : "var(--surface)", color: primary ? "white" : "var(--slate)", border: `1px solid ${primary ? "var(--accent)" : "var(--border2)"}`, borderRadius: 8, fontSize: 13, fontWeight: primary ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
      {icon} {label}
    </button>
  );
}

function EmptyState({ erpDone, meliDone, router }: { erpDone: boolean; meliDone: boolean; router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "40px 32px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>📦</div>
      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--slate)", marginBottom: 6 }}>
        Nenhum dado carregado
      </div>
      <div style={{ fontSize: 13, color: "var(--ghost)", marginBottom: 24 }}>
        Importe os arquivos ERP e MeLi para ver a conciliação
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ActionBtn done={erpDone} label={erpDone ? "ERP importado ✓" : "Importar ERP (Space/VTEX)"} onClick={() => router.push("/importar/space")} />
        <ActionBtn done={meliDone} label={meliDone ? "MeLi importado ✓" : "Importar MeLi"} onClick={() => router.push("/importar/meli")} />
      </div>
    </div>
  );
}

function ActionBtn({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={!done ? onClick : undefined}
      style={{ padding: "10px 20px", background: done ? "var(--green-bg)" : "var(--accent)", color: done ? "var(--green)" : "white", border: done ? "1px solid var(--green-border)" : "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: done ? "default" : "pointer" }}>
      {label}
    </button>
  );
}
