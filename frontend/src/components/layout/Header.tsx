"use client";

interface HeaderProps {
  filial?: string;
  syncTime?: string;
}

export default function Header({
  filial = "98 · SAMPA — FULL",
  syncTime,
}: HeaderProps) {
  const displayTime =
    syncTime ?? new Date().toLocaleDateString("pt-BR");

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        height: 58,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: "-0.4px",
          color: "var(--ink)",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            background: "var(--accent)",
            clipPath: "polygon(0 0, 100% 0, 100% 72%, 72% 100%, 0 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            color: "white",
            fontFamily: "DM Mono, monospace",
            flexShrink: 0,
          }}
        >
          S
        </div>
        StockSync
      </div>

      {/* Meta */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            background: "var(--blue-bg)",
            border: "1px solid var(--blue-border)",
            padding: "4px 12px",
            borderRadius: 5,
            fontFamily: "DM Mono, monospace",
            fontSize: 11,
            color: "var(--blue)",
            letterSpacing: "0.2px",
          }}
        >
          {filial}
        </div>
        <div
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: 11,
            color: "var(--mist)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {displayTime}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              display: "inline-block",
            }}
          />
        </div>
      </div>
    </header>
  );
}
