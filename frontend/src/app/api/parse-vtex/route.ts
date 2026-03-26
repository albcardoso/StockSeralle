/**
 * POST /api/parse-vtex
 *
 * Parsing server-side do arquivo VTEX xlsx usando parser nativo (Node.js zlib).
 * NÃO usa SheetJS — contorna o bug de ZIP "Bad uncompressed size" que faz
 * o SheetJS retornar sheets vazias em arquivos grandes (49 MB, 268 MB descomprimido).
 *
 * Recebe o arquivo como raw binary (application/octet-stream).
 * Retorna: { data: Record<sku, {cod_produto, nome_sku}>, totalRows, validRows }
 */

import { NextRequest, NextResponse } from "next/server";
import { parseXlsxNative } from "@/lib/native-xlsx-parser";

// Força route dinâmica (não cacheada)
export const dynamic = "force-dynamic";

// Normalização de texto (remove acentos, lowercase)
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[API parse-vtex] Recebendo corpo da requisição...");

    const arrayBuf = await req.arrayBuffer();

    if (!arrayBuf || arrayBuf.byteLength === 0) {
      console.error("[API parse-vtex] Corpo vazio");
      return NextResponse.json({ error: "Corpo da requisição vazio" }, { status: 400 });
    }

    const sizeKB = (arrayBuf.byteLength / 1024).toFixed(0);
    console.log(`[API parse-vtex] Recebido: ${sizeKB} KB — iniciando parser nativo...`);

    const buffer = Buffer.from(arrayBuf);
    const sheets = await parseXlsxNative(buffer);
    const sheetNames = Object.keys(sheets);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-vtex] parseXlsxNative() OK em ${elapsed}s | Sheets:`, sheetNames);

    if (sheetNames.length === 0) {
      console.error("[API parse-vtex] Nenhuma sheet encontrada");
      return NextResponse.json({
        error: "Nenhuma sheet encontrada",
        data: {},
        totalRows: 0,
        validRows: 0,
        receivedKB: Number(sizeKB),
      });
    }

    const raw = sheets[sheetNames[0]];
    console.log("[API parse-vtex] Linhas brutas:", raw.length);

    if (raw.length < 3) {
      console.error("[API parse-vtex] Menos de 3 linhas — arquivo pode estar corrompido");
      return NextResponse.json({
        error: "Sheet com poucas linhas",
        data: {},
        totalRows: raw.length,
        validRows: 0,
        receivedKB: Number(sizeKB),
      });
    }

    // Índices padrão fixos do VTEX
    let skuCol = 28;
    let codProdutoCol = 21;
    let nomeSkuCol = 24;
    let dataStart = 2;

    // Tenta detectar pelo header (primeiras 3 linhas)
    for (let r = 0; r < Math.min(3, raw.length); r++) {
      const row = (raw[r] as unknown[])?.map((c) => norm(String(c ?? ""))) ?? [];
      const skuIdx = row.findIndex(
        (h) =>
          h === "codigo de referencia do sku" ||
          h === "referencia do sku" ||
          h === "cod ref sku" ||
          h === "ref do sku"
      );
      const codIdx = row.findIndex(
        (h) =>
          h === "codigo de referencia do produto" ||
          h === "referencia do produto" ||
          h === "cod ref produto"
      );
      const nomeIdx = row.findIndex(
        (h) => h === "nome do sku" || h === "nome sku" || h === "sku name"
      );

      if (skuIdx >= 0 && codIdx >= 0) {
        skuCol = skuIdx;
        codProdutoCol = codIdx;
        if (nomeIdx >= 0) nomeSkuCol = nomeIdx;
        dataStart = r + 1;
        console.log(
          `[API parse-vtex] header linha ${r}: skuCol=${skuCol}, codProdutoCol=${codProdutoCol}`
        );
        break;
      }
    }

    const data: Record<string, { cod_produto: string; nome_sku: string }> = {};
    let validRows = 0;

    for (let i = dataStart; i < raw.length; i++) {
      const row = (raw[i] as unknown[]) ?? [];
      const cod = String(row[codProdutoCol] ?? "").trim();
      const sku = String(row[skuCol] ?? "").trim();
      const nome = String(row[nomeSkuCol] ?? "").trim();
      if (cod && sku) {
        data[sku] = { cod_produto: cod, nome_sku: nome };
        validRows++;
      }
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API parse-vtex] ✓ ${validRows} SKUs | total: ${totalElapsed}s`);

    return NextResponse.json({
      data,
      totalRows: raw.length,
      validRows,
      receivedKB: Number(sizeKB),
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[API parse-vtex] Erro após ${elapsed}s:`, err);
    return NextResponse.json(
      { error: `Erro ao processar: ${String(err)}` },
      { status: 500 }
    );
  }
}
