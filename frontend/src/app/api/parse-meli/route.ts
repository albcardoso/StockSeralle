/**
 * POST /api/parse-meli
 *
 * Parsing server-side do arquivo ML FULL xlsx usando parser nativo (Node.js zlib).
 * NÃO usa SheetJS — contorna o bug de ZIP "Bad uncompressed size".
 *
 * Recebe o arquivo como raw binary (application/octet-stream).
 * Retorna: { data: Record<sku, {qty, desc}>, totalRows, validRows }
 */

import { NextRequest, NextResponse } from "next/server";
import { parseXlsxNative } from "@/lib/native-xlsx-parser";

export const dynamic = "force-dynamic";

// Normalização de texto (remove acentos, lowercase)
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Detecta dinamicamente a coluna "Aptas para venda" nas primeiras linhas.
 * Retorna o fallback (col 16) se não encontrar.
 */
function detectAptasCol(raw: unknown[][], dataStartRow: number): number {
  const FALLBACK = 16;
  for (let r = 0; r < Math.min(raw.length, dataStartRow); r++) {
    const row = (raw[r] as unknown[]) ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = norm(String(row[c] ?? ""));
      if (
        v.length <= 30 &&
        (v === "aptas para venda" || v === "aptas para vender" || v === "aptas")
      ) {
        return c;
      }
    }
  }
  return FALLBACK;
}

/**
 * Coluna fixa "Entrada pendente" = col N (índice 13) da planilha ML FULL.
 * Tenta detectar dinamicamente no header; fallback = 13.
 */
function detectEntradaPendenteCol(raw: unknown[][], dataStartRow: number): number {
  const FALLBACK = 13; // coluna N
  for (let r = 0; r < Math.min(raw.length, dataStartRow); r++) {
    const row = (raw[r] as unknown[]) ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = norm(String(row[c] ?? ""));
      if (
        v.length <= 40 &&
        (v === "entrada pendente" || v === "entradas pendentes" || v.includes("entrada pendente"))
      ) {
        return c;
      }
    }
  }
  return FALLBACK;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[API parse-meli] Recebendo corpo da requisição...");

    const arrayBuf = await req.arrayBuffer();

    if (!arrayBuf || arrayBuf.byteLength === 0) {
      console.error("[API parse-meli] Corpo vazio");
      return NextResponse.json({ error: "Corpo da requisição vazio" }, { status: 400 });
    }

    const sizeKB = (arrayBuf.byteLength / 1024).toFixed(0);
    console.log(`[API parse-meli] Recebido: ${sizeKB} KB — iniciando parser nativo...`);

    const buffer = Buffer.from(arrayBuf);

    // Parseia todas as sheets para encontrar "Resumo"
    const sheets = await parseXlsxNative(buffer);
    const sheetNames = Object.keys(sheets);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-meli] parseXlsxNative() OK em ${elapsed}s | Sheets:`, sheetNames);

    if (sheetNames.length === 0) {
      return NextResponse.json({
        error: "Nenhuma sheet encontrada",
        data: {},
        totalRows: 0,
        validRows: 0,
        receivedKB: Number(sizeKB),
      });
    }

    // Usa "Resumo" se existir, senão a primeira sheet
    const targetSheet = sheetNames.includes("Resumo") ? "Resumo" : sheetNames[0];
    const raw = sheets[targetSheet];
    console.log(`[API parse-meli] Sheet "${targetSheet}" | ${raw.length} linhas`);

    // Colunas fixas do ML FULL
    const DATA_START_ROW = 12;
    const SKU_COL = 3;
    const TITULO_COL = 6;
    const aptasCol = detectAptasCol(raw, DATA_START_ROW);
    const entradaPendenteCol = detectEntradaPendenteCol(raw, DATA_START_ROW);

    console.log(`[API parse-meli] aptasCol=${aptasCol} | entradaPendenteCol=${entradaPendenteCol} | dataStart=${DATA_START_ROW}`);

    const data: Record<string, { qty: number; desc: string; entradaPendente: number }> = {};
    let validRows = 0;

    for (let i = DATA_START_ROW; i < raw.length; i++) {
      const row = (raw[i] as unknown[]) ?? [];
      const sku = String(row[SKU_COL] ?? "").trim();
      if (!sku || sku === "nan") continue;
      const desc = String(row[TITULO_COL] ?? "").trim();
      const qty = parseFloat(String(row[aptasCol] ?? "0").replace(",", "."));
      const entradaPendente = entradaPendenteCol >= 0
        ? parseFloat(String(row[entradaPendenteCol] ?? "0").replace(",", "."))
        : 0;
      data[sku] = { qty: isNaN(qty) ? 0 : qty, desc, entradaPendente: isNaN(entradaPendente) ? 0 : entradaPendente };
      validRows++;
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-meli] ✓ ${validRows} itens | total: ${totalElapsed}s`);

    return NextResponse.json({
      data,
      totalRows: raw.length,
      validRows,
      receivedKB: Number(sizeKB),
      sheetName: targetSheet,
      aptasCol,
      entradaPendenteCol,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[API parse-meli] Erro após ${elapsed}s:`, err);
    return NextResponse.json(
      { error: `Erro ao processar: ${String(err)}` },
      { status: 500 }
    );
  }
}
