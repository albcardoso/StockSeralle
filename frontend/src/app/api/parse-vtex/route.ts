/**
 * POST /api/parse-vtex
 *
 * Parsing server-side do arquivo VTEX xlsx (Node.js, sem limite de memória do browser).
 *
 * Recebe o arquivo como raw binary (application/octet-stream) — mais simples e
 * confiável para arquivos grandes (36 MB) do que multipart/form-data.
 *
 * Retorna: { data: Record<sku, {cod_produto, nome_sku}>, totalRows, validRows }
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Força route dinâmica (não cacheada)
export const dynamic = "force-dynamic";

const PERF_OPTS: XLSX.ParsingOptions = {
  cellFormula: false,
  cellHTML:    false,
  cellText:    false,
  cellNF:      false,
  cellStyles:  false,
  sheetStubs:  false,
  bookDeps:    false,
  bookFiles:   false,
  bookProps:   false,
  bookVBA:     false,
  // bookSheets OMITIDO → false → lê dados das células
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[API parse-vtex] Recebendo corpo da requisição...");

    // Lê o corpo como ArrayBuffer (raw binary — sem multipart parsing)
    const arrayBuf = await req.arrayBuffer();

    if (!arrayBuf || arrayBuf.byteLength === 0) {
      console.error("[API parse-vtex] Corpo vazio");
      return NextResponse.json({ error: "Corpo da requisição vazio" }, { status: 400 });
    }

    const sizeKB = (arrayBuf.byteLength / 1024).toFixed(0);
    console.log(`[API parse-vtex] Recebido: ${sizeKB} KB — iniciando XLSX.read()...`);

    const buffer = Buffer.from(arrayBuf);
    const wb = XLSX.read(buffer, { ...PERF_OPTS, type: "buffer" });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-vtex] XLSX.read() OK em ${elapsed}s | SheetNames:`, wb.SheetNames);

    if (!wb.SheetNames.length || !wb.Sheets) {
      console.error("[API parse-vtex] SheetNames vazio após XLSX.read — buffer pode estar truncado. Recebido:", sizeKB, "KB");
      return NextResponse.json({ error: "SheetNames vazio", data: {}, totalRows: 0, validRows: 0, receivedKB: Number(sizeKB) });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws["!ref"]) {
      console.warn("[API parse-vtex] Sheet vazia ou !ref ausente. SheetNames:", wb.SheetNames);
      return NextResponse.json({ error: "Sheet sem dados", data: {}, totalRows: 0, validRows: 0, receivedKB: Number(sizeKB) });
    }

    console.log("[API parse-vtex] !ref:", ws["!ref"]);

    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    console.log("[API parse-vtex] Linhas brutas:", raw.length);

    const SKU_COL      = 28;
    const COD_PROD_COL = 21;
    const NOME_SKU_COL = 24;
    const DATA_START   = 2;

    const data: Record<string, { cod_produto: string; nome_sku: string }> = {};
    let validRows = 0;

    for (let i = DATA_START; i < raw.length; i++) {
      const row = raw[i];
      const cod  = String(row[COD_PROD_COL] ?? "").trim();
      const sku  = String(row[SKU_COL]      ?? "").trim();
      const nome = String(row[NOME_SKU_COL] ?? "").trim();
      if (cod && sku) {
        data[sku] = { cod_produto: cod, nome_sku: nome };
        validRows++;
      }
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-vtex] ✓ ${validRows} SKUs | total: ${totalElapsed}s`);

    return NextResponse.json({ data, totalRows: raw.length, validRows, receivedKB: Number(sizeKB) });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[API parse-vtex] Erro após ${elapsed}s:`, err);
    return NextResponse.json(
      { error: `Erro ao processar: ${String(err)}` },
      { status: 500 }
    );
  }
}
