"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadCardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  accept?: string;
  onFile: (file: File) => Promise<void>;
  redirectTo?: string;
}

export default function UploadCard({
  title,
  description,
  icon,
  color,
  bg,
  accept = ".xlsx,.xls,.csv",
  onFile,
  redirectTo = "/conciliacao",
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handle(file: File) {
    setStatus("loading");
    setFileName(file.name);
    setErrorMsg(null);
    try {
      await onFile(file);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Erro ao processar arquivo");
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      {/* Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handle(f);
        }}
        onClick={() => status === "idle" && inputRef.current?.click()}
        style={{
          background: status === "done" ? "var(--green-bg)" : "var(--surface)",
          border: `2px dashed ${status === "done" ? "var(--green)" : status === "error" ? "var(--red)" : color}`,
          borderRadius: 16,
          padding: "48px 32px",
          textAlign: "center",
          cursor: status === "idle" ? "pointer" : "default",
          transition: "all 0.2s",
        }}
      >
        {status === "loading" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--slate)" }}>
              Processando {fileName}...
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--green)" }}>
              {fileName} importado!
            </div>
            <div style={{ fontSize: 13, color: "var(--mist)", marginTop: 6 }}>
              Dados carregados com sucesso
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button
                onClick={() => router.push(redirectTo)}
                style={{
                  padding: "10px 22px",
                  background: "var(--green)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ver Conciliação →
              </button>
              <button
                onClick={() => { setStatus("idle"); setFileName(null); }}
                style={{
                  padding: "10px 18px",
                  background: "var(--surface2)",
                  color: "var(--slate)",
                  border: "1px solid var(--border2)",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Importar outro
              </button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--red)" }}>
              Erro ao processar
            </div>
            {/* Mostra mensagem de erro linha por linha */}
            <div style={{
              marginTop: 10, textAlign: "left",
              background: "var(--red-bg)", border: "1px solid var(--red-border)",
              borderRadius: 8, padding: "12px 14px",
              fontFamily: "DM Mono, monospace", fontSize: 11,
              color: "var(--red)", whiteSpace: "pre-wrap", maxHeight: 220,
              overflowY: "auto", lineHeight: 1.7,
            }}>
              {errorMsg}
            </div>
            <div style={{ fontSize: 11, color: "var(--mist)", marginTop: 8 }}>
              Abra o Console do navegador (F12 → Console) para mais detalhes
            </div>
            <button
              onClick={() => { setStatus("idle"); setFileName(null); }}
              style={{
                marginTop: 14, padding: "8px 16px",
                background: "var(--red-bg)", color: "var(--red)",
                border: "1px solid var(--red-border)", borderRadius: 7,
                fontSize: 12, cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
          </>
        )}

        {status === "idle" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 14, color }}>{icon}</div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--ink2)", marginBottom: 8 }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20, lineHeight: 1.5 }}>
              {description}
            </div>
            <div
              style={{
                display: "inline-block",
                padding: "10px 24px",
                background: bg,
                border: `1.5px solid ${color}`,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color,
                cursor: "pointer",
              }}
            >
              Selecionar arquivo
            </div>
            <div style={{ fontSize: 11, color: "var(--ghost)", marginTop: 12 }}>
              ou arraste o arquivo aqui · {accept}
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
