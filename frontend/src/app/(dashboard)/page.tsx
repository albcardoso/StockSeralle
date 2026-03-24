import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — StockSync",
};

// Tipagem das métricas do dashboard
interface DashboardStats {
  totalErp: number;
  totalMeli: number;
  divergencias: number;
  soErp: number;
  soMeli: number;
  okCount: number;
}

// TODO: Substituir por chamada real à API quando o backend estiver pronto
async function fetchStats(): Promise<DashboardStats | null> {
  try {
    const res = await fetch(`${process.env.API_URL}/api/estoque/stats`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const stats = await fetchStats();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.5px",
          }}
        >
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
          Visão geral da conciliação ERP × Mercado Livre
        </p>
      </div>

      {/* Métricas */}
      {stats ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <MetricCard
            label="Total ERP"
            value={stats.totalErp}
            color="var(--blue)"
            bg="var(--blue-bg)"
          />
          <MetricCard
            label="Total MeLi"
            value={stats.totalMeli}
            color="var(--purple)"
            bg="var(--purple-bg)"
          />
          <MetricCard
            label="Divergências"
            value={stats.divergencias}
            color="var(--red)"
            bg="var(--red-bg)"
          />
          <MetricCard
            label="Só no ERP"
            value={stats.soErp}
            color="var(--amber)"
            bg="var(--amber-bg)"
          />
          <MetricCard
            label="Só no MeLi"
            value={stats.soMeli}
            color="var(--amber)"
            bg="var(--amber-bg)"
          />
          <MetricCard
            label="OK"
            value={stats.okCount}
            color="var(--green)"
            bg="var(--green-bg)"
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="fu"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--mist)", marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: 26,
          fontWeight: 500,
          color,
          background: bg,
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 6,
        }}
      >
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "48px 24px",
        textAlign: "center",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontSize: 34, marginBottom: 12 }}>📦</div>
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 700,
          fontSize: 16,
          color: "var(--slate)",
          marginBottom: 6,
        }}
      >
        Nenhum dado carregado
      </div>
      <div style={{ fontSize: 13, color: "var(--ghost)" }}>
        Importe os arquivos ERP e MeLi para ver a conciliação
      </div>
    </div>
  );
}
