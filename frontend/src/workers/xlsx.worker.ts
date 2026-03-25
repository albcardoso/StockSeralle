/**
 * Web Worker para parsing de arquivos XLSX pesados.
 *
 * Roda em thread separada — a UI nunca trava, mesmo com arquivos de 35MB+.
 *
 * Protocolo:
 *   IN  → { type: "array",  buffer: ArrayBuffer }   (transferível, zero-copy)
 *   IN  → { type: "binary", binary: string }        (fallback para xlsx com bug de ZIP)
 *   OUT → { ok: true,  rows: unknown[][], empty: boolean }
 *   OUT → { ok: false, error: string }
 */

import * as XLSX from "xlsx";

type InMsg =
  | { type: "array"; buffer: ArrayBuffer }
  | { type: "binary"; binary: string };

type OutMsg =
  | { ok: true; rows: unknown[][]; empty: boolean }
  | { ok: false; error: string };

/** Opções de performance: desliga tudo que não usamos */
const PERF_OPTS: XLSX.ParsingOptions = {
  cellDates:    false, // datas como número — convertemos se precisar
  cellFormula:  false, // não parseia fórmulas
  cellHTML:     false, // não gera HTML para cada célula
  cellText:     false, // não gera texto formatado
  cellNF:       false, // não parseia formato numérico
  cellStyles:   false, // não parseia estilos/cores
  sheetStubs:   false, // não cria objetos para células vazias
  bookDeps:     false, // não carrega dependências externas
  bookFiles:    false, // não guarda arquivos internos do ZIP
  bookProps:    false, // não lê propriedades do documento
  bookSheets:   true,  // precisa da lista de sheets
  bookVBA:      false, // não carrega macros
};

function hasData(wb: XLSX.WorkBook): boolean {
  if (!wb.SheetNames.length) return false;
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws?.["!ref"]) return false;
  try {
    const r = XLSX.utils.decode_range(ws["!ref"]!);
    return r.e.r > 0;
  } catch {
    return false;
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  try {
    let wb: XLSX.WorkBook;

    if (e.data.type === "array") {
      wb = XLSX.read(new Uint8Array(e.data.buffer), { ...PERF_OPTS, type: "array" });
    } else {
      wb = XLSX.read(e.data.binary, { ...PERF_OPTS, type: "binary" });
    }

    if (!hasData(wb)) {
      // Sinaliza vazio para o caller tentar o fallback binary
      self.postMessage({ ok: true, rows: [], empty: true } satisfies OutMsg);
      return;
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

    self.postMessage({ ok: true, rows, empty: false } satisfies OutMsg);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) } satisfies OutMsg);
  }
};
