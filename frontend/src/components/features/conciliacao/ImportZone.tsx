"use client";

import { useRef } from "react";
import { parseErpXlsx, parseMeliXlsx, mergeData } from "@/lib/xlsx-parser";
import type { ConciliacaoItem, MeliItem } from "@/types";

interface Props {
  onDataLoaded: (items: ConciliacaoItem[]) => void;
}

export default function ImportZone({ onDataLoaded }: Props) {
  const erpRef = useRef<HTMLInputElement>(null);
  const meliRef = useRef<HTMLInputElement>(null);

  const erpData = useRef<Record<string, number>>({});
  const meliData = useRef<Record<string, MeliItem>>({});

  function tryMerge() {
    if (
      Object.keys(erpData.current).length > 0 &&
      Object.keys(meliData.current).length > 0
    ) {
      const merged = mergeData(erpData.current, meliData.current);
      onDataLoaded(merged);
    }
  }

  async function handleErp(file: File) {
    const { data } = await parseErpXlsx(file);
    erpData.current = data;
    tryMerge();
  }

  async function handleMeli(file: File) {
    const { data } = await parseMeliXlsx(file);
    meliData.current = data;
    tryMerge();
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 18,
      }}
    >
      <DropCard
        title="ERP (Space / VTEX)"
        icon="□"
        color="var(--purple)"
        bg="var(--purple-bg)"
        inputRef={erpRef}
        onFile={handleErp}
      />
      <DropCard
        title="Mercado Livre"
        icon="◈"
        color="var(--amber)"
        bg="var(--amber-bg)"
        inputRef={meliRef}
        onFile={handleMeli}
      />
    </div>
  );
}

function DropCard({
  title,
  icon,
  color,
  bg,
  inputRef,
  onFile,
}: {
  title: string;
  icon: string;
  color: string;
  bg: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        background: "var(--surface)",
        border: `2px dashed ${color}`,
        borderRadius: 14,
        padding: "36px 24px",
        textAlign: "center",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = bg)
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--surface)")
      }
    >
      <div style={{ fontSize: 28, marginBottom: 10, color }}>{icon}</div>
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          color: "var(--ink2)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--mist)" }}>
        Clique ou arraste o arquivo .xlsx/.csv aqui
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
