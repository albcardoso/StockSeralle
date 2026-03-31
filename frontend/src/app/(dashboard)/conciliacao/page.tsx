"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStock } from "@/contexts/StockContext";
import { useSettings } from "@/contexts/SettingsContext";
import ConciliacaoTable from "@/components/features/conciliacao/ConciliacaoTable";
import type { ConciliacaoItem } from "@/types";
import type { ConciliationScenario } from "@/contexts/StockContext";

const SCENARIO_LABELS: Record<ConciliationScenario, string> = {
  api_space_api_meli: "API Space + API MeLi (direto por SKU)",
  api_space_planilha_meli: "API Space + Planilha MeLi (direto por SKU)",
  planilha_space_vtex_api_meli: "Planilha Space + VTEX + API MeLi (via mapeamento)",
  planilha_space_vtex_planilha_meli: "3 Planilhas: Space + VTEX + MeLi (via mapeamento)",
};

export default function ConciliacaoPage() {
  const {
    conciliacao, erpFileName, vtexFileName, meliFileName,
    erpSource, meliSource, lastUpdated, isLoading, clearAll,
    getConciliationScenario, canReconcile,
  } = useStock();
  const { enableImport } = useSettings();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "div" | "ok" | "erp-only" | "meli-only">("all");
  const [search, setSearch] = useState("");

  const scenario = getConciliationScenario();

  const counts = useMemo(() => ({
    div: conciliacao.filter((i) => i.status === "divergente").length,
    ok: conciliacao.filter((i) => i.status === "ok").length,
    erp: conciliacao.filter((i) => i.status === "so_erp").length,
    meli: conciliacao.filter((i) => i.status === "so_meli").length,
  }), [conciliacao]);

  const filtered = useMemo(() => conciliacao.filter((item) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "div" && item.status === "divergente") ||
      (filter === "ok" && item.status === "ok") ||
      (filter === "erp-only" && item.status === "so_erp") ||
      (filter === "meli-only" && item.status === "so_meli");

    const matchesSearch =
      !search ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.codProduto?.toLowerCase().includes(search.toLowerCase()) ||
      item.descricao?.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  }), [conciliacao, filter, search]);

  // Carregando dados do servidor
  if (isLoading) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--slate)" }}>
          Carregando dados da última importação...
        </div>
      </div>
    );
  }

  // Nenhum dado — guia de como carregar dados
  if (!canReconcile) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Conciliação ERP × MeLi
          </h1>
          <p style={{ fontSize: 13, color: "var(--mist)", marginTop: 4 }}>
            Compare o estoque do ERP com os anúncios do Mercado Livre
          </p>
        </div>

        {/* Status das fontes de dados */}
        <DataSourceStatus
          erpFileName={erpFileName}
          erpSource={erpSource}
          vtexFileName={vtexFileName}
          meliFileName={meliFileName}
          meliSource={meliSource}
          enableImport={enableImport}
          router={router}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Conciliação ERP × MeLi
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            {erpFileName && (
              <FileBadge
                label={erpFileName}
                color={erpSource === "api" ? "var(--blue)" : "var(--purple)"}
                bg={erpSource === "api" ? "var(--blue-bg)" : "var(--purple-bg)"}
              />
            )}
            {vtexFileName && <FileBadge label={vtexFileName} color="var(--purple)" bg="var(--purple-bg)" />}
            {meliFileName && (
              <FileBadge
                label={meliFileName}
                color={meliSource === "api" ? "var(--blue)" : "var(--amber)"}
                bg={meliSource === "api" ? "var(--blue-bg)" : "var(--amber-bg)"}
              />
            )}
          </div>
          {scenario && (
            <div style={{
              marginTop: 6, fontSize: 11, fontFamily: "DM Mono, monospace",
              color: "var(--blue)", background: "var(--blue-bg)",
              padding: "3px 10px", borderRadius: 5, display: "inline-block",
              border: "1px solid var(--blue-border)",
            }}>
              {SCENARIO_LABELS[scenario]}
            </div>
          )}
          {lastUpdated && (
            <div style={{ marginTop: 6, fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--mist)" }}>
              Última importação: {lastUpdated.toLocaleDateString("pt-BR")} às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
        <button
          onClick={clearAll}
          style={{ padding: "7px 14px", background: "var(--surface2)", color: "var(--slate)", border: "1px solid var(--border2)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}
        >
          ↩ Novo import
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Divergências" value={counts.div} color="var(--red)" bg="var(--red-bg)" onClick={() => setFilter("div")} active={filter === "div"} />
        <SummaryCard label="Só no ERP" value={counts.erp} color="var(--purple)" bg="var(--purple-bg)" onClick={() => setFilter("erp-only")} active={filter === "erp-only"} />
        <SummaryCard label="Só no MeLi" value={counts.meli} color="var(--amber)" bg="var(--amber-bg)" onClick={() => setFilter("meli-only")} active={filter === "meli-only"} />
        <SummaryCard label="OK" value={counts.ok} color="var(--green)" bg="var(--green-bg)" onClick={() => setFilter("ok")} active={filter === "ok"} />
      </div>

      {/* Barra de filtros + busca */}
      <div className="filter-bar" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap", boxShadow: "var(--shadow-sm)" }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500, color: "var(--mist)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Filtrar
        </span>
        {([ { value: "all", label: "Todos" }, { value: "div", label: "Divergentes" }, { value: "ok", label: "OK" }, { value: "erp-only", label: "Só ERP" }, { value: "meli-only", label: "Só MeLi" } ] as const).map((opt) => (
          <button key={opt.value} onClick={() => setFilter(opt.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${filter === opt.value ? "var(--blue)" : "var(--border2)"}`, background: filter === opt.value ? "var(--blue-bg)" : "var(--surface2)", color: filter === opt.value ? "var(--blue)" : "var(--slate)", fontSize: 12, cursor: "pointer", fontWeight: filter === opt.value ? 600 : 400 }}>
            {opt.label}
          </button>
        ))}
        <input type="text" placeholder="Buscar SKU ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: "7px 12px", background: "var(--surface)", border: "1.5px solid var(--border2)", borderRadius: 6, color: "var(--ink)", fontSize: 13, outline: "none" }} />
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--slate)" }}>
          {filtered.length} / {conciliacao.length} itens
        </span>
        <ExportButton items={filtered} />
      </div>

      <ConciliacaoTable items={filtered} />
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

/** Mostra o status de cada fonte de dados e os caminhos possíveis */
function DataSourceStatus({
  erpFileName, erpSource, vtexFileName, meliFileName, meliSource,
  enableImport, router,
}: {
  erpFileName: string | null;
  erpSource: string | null;
  vtexFileName: string | null;
  meliFileName: string | null;
  meliSource: string | null;
  enableImport: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
}) {
  const hasErp = !!erpFileName;
  const hasMeli = !!meliFileName;
  const hasVtex = !!vtexFileName;
  const erpIsApi = erpSource === "api";

  // Determina o que falta para conciliar
  const needsErp = !hasErp;
  const needsMeli = !hasMeli;
  const needsVtex = hasErp && !erpIsApi && !hasVtex && hasMeli;

  return (
    <div>
      {/* Caminho por API (sempre visível) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500,
          color: "var(--blue)", letterSpacing: "1px", textTransform: "uppercase",
          marginBottom: 10,
        }}>
          Via Consulta API (recomendado)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <StepCard
            step={1}
            title="Consultar API Space"
            description="Estoque ERP via API"
            done={hasErp && erpIsApi}
            fileName={hasErp && erpIsApi ? erpFileName : null}
            onClick={() => router.push("/importar/space-api")}
            color="var(--blue)"
            bg="var(--blue-bg)"
            icon="⚡"
          />
          <StepCard
            step={2}
            title="Consultar API MeLi"
            description="Vendas via API"
            done={hasMeli && meliSource === "api"}
            fileName={hasMeli && meliSource === "api" ? meliFileName : null}
            onClick={() => router.push("/importar/meli-api")}
            color="var(--blue)"
            bg="var(--blue-bg)"
            icon="⚡"
          />
        </div>
      </div>

      {/* Caminho por planilha (só se importação habilitada) */}
      {enableImport && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: "DM Mono, monospace", fontSize: 10, fontWeight: 500,
            color: "var(--purple)", letterSpacing: "1px", textTransform: "uppercase",
            marginBottom: 10,
          }}>
            Via Importação de Planilhas
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <StepCard
              step={1}
              title="Importar Space (ERP)"
              description="CSV de estoque"
              done={hasErp && !erpIsApi}
              fileName={hasErp && !erpIsApi ? erpFileName : null}
              onClick={() => router.push("/importar/space")}
              color="var(--purple)"
              bg="var(--purple-bg)"
              icon="↑"
            />
            <StepCard
              step={2}
              title="Importar VTEX"
              description="Mapeamento SKU → ERP"
              done={hasVtex}
              fileName={vtexFileName}
              onClick={() => router.push("/importar/vtex")}
              color="var(--purple)"
              bg="var(--purple-bg)"
              icon="↑"
            />
            <StepCard
              step={3}
              title="Importar MeLi"
              description="Gerenciador de Anúncios"
              done={hasMeli && meliSource !== "api"}
              fileName={hasMeli && meliSource !== "api" ? meliFileName : null}
              onClick={() => router.push("/importar/meli")}
              color="var(--amber)"
              bg="var(--amber-bg)"
              icon="↑"
            />
          </div>
        </div>
      )}

      {/* Info box */}
      <div style={{
        background: needsErp || needsMeli
          ? "var(--amber-bg)"
          : needsVtex
            ? "var(--amber-bg)"
            : "var(--blue-bg)",
        border: `1px solid ${needsErp || needsMeli ? "var(--amber-border)" : "var(--blue-border)"}`,
        borderRadius: 10, padding: "12px 16px", fontSize: 13,
        color: needsErp || needsMeli ? "var(--amber)" : "var(--blue)",
      }}>
        {needsErp && needsMeli && (
          <>⚡ Consulte as APIs do Space e MeLi para conciliar automaticamente por SKU (sem VTEX). {enableImport && "Ou importe as 3 planilhas (Space + VTEX + MeLi)."}</>
        )}
        {needsErp && !needsMeli && (
          <>Dados do MeLi carregados. Falta o ERP — consulte a API Space ou importe a planilha Space{!erpIsApi && enableImport ? " + VTEX" : ""}.</>
        )}
        {!needsErp && needsMeli && (
          <>Dados do ERP carregados. Falta o MeLi — consulte a API MeLi ou importe a planilha MeLi.</>
        )}
        {needsVtex && (
          <>ERP veio de planilha — importe também a VTEX para mapear SKU → cod_produto. Ou use a API Space (que já retorna SKU diretamente).</>
        )}
        {!needsErp && !needsMeli && !needsVtex && (
          <>Os dados estão carregados mas não foi possível conciliar. Verifique se os SKUs batem entre as fontes.</>
        )}
      </div>
    </div>
  );
}

function StepCard({ step, title, description, done, fileName, onClick, color, bg, icon }: {
  step: number; title: string; description: string; done: boolean; fileName: string | null;
  onClick: () => void; color: string; bg: string; icon?: string;
}) {
  return (
    <div onClick={!done ? onClick : undefined}
      style={{ background: done ? bg : "var(--surface)", border: `1.5px solid ${done ? color : "var(--border)"}`, borderRadius: 12, padding: "20px", cursor: done ? "default" : "pointer", transition: "all 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: done ? color : "var(--surface2)", color: done ? "white" : "var(--slate)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Mono, monospace" }}>{done ? "✓" : step}</span>
        <span style={{ fontWeight: 600, fontSize: 14, color: done ? color : "var(--ink)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: done ? color : "var(--mist)" }}>
        {done ? `✓ ${fileName}` : `Clique para ${icon === "⚡" ? "consultar" : "importar"} · ${description}`}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg, onClick, active }: {
  label: string; value: number; color: string; bg: string; onClick: () => void; active: boolean;
}) {
  return (
    <div onClick={onClick}
      style={{ background: active ? bg : "var(--surface)", border: `1px solid ${active ? color : "var(--border)"}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", transition: "all 0.15s", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11, color: active ? color : "var(--mist)", marginBottom: 6, fontFamily: "DM Mono, monospace" }}>{label}</div>
      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 24, fontWeight: 500, color: active ? color : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function FileBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ padding: "3px 10px", background: bg, color, border: `1px solid ${color}`, borderRadius: 5, fontSize: 11, fontFamily: "DM Mono, monospace", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ExportButton({ items }: { items: ConciliacaoItem[] }) {
  function exportCSV() {
    const headers = ["SKU", "Cod. Produto", "Tamanho", "Descrição", "Qtd ERP", "Qtd MeLi", "Diferença", "Status", "MLB"];
    const rows = items.map((i) => [
      i.sku,
      i.codProduto ?? "",
      i.tamanho ?? "",
      i.descricao ?? "",
      i.qtdErp ?? "",
      i.qtdMeli ?? "",
      i.qtdMeli !== undefined && i.qtdErp !== undefined ? i.qtdMeli - i.qtdErp : "",
      i.status,
      i.mlb ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={exportCSV}
      style={{ padding: "6px 14px", background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-border)", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
      ↓ Exportar CSV
    </button>
  );
}
