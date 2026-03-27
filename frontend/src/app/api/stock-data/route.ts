/**
 * POST /api/stock-data       — salva uma fonte de dados específica no MongoDB
 * GET  /api/stock-data       — carrega todas as fontes combinadas
 * DELETE /api/stock-data     — limpa todos os dados salvos
 *
 * Cada fonte (erp, vtex, meli) é salva em seu próprio documento no MongoDB.
 * O body do POST pode vir comprimido com gzip (Content-Type: application/gzip)
 * para caber no limite de 4.5MB da Vercel.
 *
 * Documentos na collection "stock_state":
 *   _id: "erp"   → { erpData, erpFileName, lastUpdated, savedAt }
 *   _id: "vtex"  → { vtexMap, vtexFileName, lastUpdated, savedAt }
 *   _id: "meli"  → { meliData, meliFileName, lastUpdated, savedAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { gunzipSync } from "zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos

const COLLECTION = "stock_state";

// Tipo do documento com _id string (não ObjectId)
interface StockDoc {
  _id: string;
  [key: string]: unknown;
}

// Headers para evitar qualquer tipo de cache
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * Extrai o body do request, descomprimindo gzip se necessário.
 */
async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("gzip")) {
    // Body comprimido com gzip — descomprime no servidor
    const buf = Buffer.from(await req.arrayBuffer());
    const decompressed = gunzipSync(buf);
    const json = JSON.parse(decompressed.toString("utf-8"));
    console.log(
      `[stock-data] Body gzip: ${(buf.length / 1024).toFixed(0)} KB → ${(decompressed.length / 1024).toFixed(0)} KB`
    );
    return json;
  }

  // Body JSON normal
  return await req.json();
}

/**
 * GET — retorna o estado combinado de todas as fontes (ou vazio se não houver)
 */
export async function GET() {
  try {
    const db = await getDb();
    const col = db.collection<StockDoc>(COLLECTION);

    // Busca todos os documentos de uma vez
    const docs = await col.find({ _id: { $in: ["erp", "vtex", "meli"] } }).toArray();

    if (docs.length === 0) {
      console.log("[stock-data] GET — nenhum dado salvo no MongoDB");
      return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
    }

    // Monta o estado combinado a partir dos documentos individuais
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const combined: Record<string, any> = {};
    let latestUpdate: string | null = null;

    for (const doc of docs) {
      const { _id, savedAt, ...data } = doc;
      Object.assign(combined, data);
      if (savedAt && (!latestUpdate || savedAt > latestUpdate)) {
        latestUpdate = savedAt as string;
      }
    }

    combined.savedAt = latestUpdate;

    const sizeKB = (JSON.stringify(combined).length / 1024).toFixed(0);
    console.log(
      `[stock-data] GET — retornando ${sizeKB} KB do MongoDB (${docs.length} fontes, lastUpdated: ${combined.lastUpdated ?? "N/A"})`
    );

    return NextResponse.json(combined, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] GET — erro ao ler do MongoDB:", err);
    return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
  }
}

/**
 * POST — salva uma fonte específica no MongoDB
 *
 * O body DEVE conter { source: "erp" | "vtex" | "meli", ...dados }
 * Aceita JSON normal ou gzip comprimido.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const savedAt = new Date().toISOString();
    const source = body.source as string | undefined;
    const db = await getDb();
    const col = db.collection<StockDoc>(COLLECTION);

    if (source === "erp") {
      await col.replaceOne({ _id: "erp" }, {
        _id: "erp",
        erpData: body.erpData,
        erpFileName: body.erpFileName,
        lastUpdated: body.lastUpdated,
        savedAt,
      }, { upsert: true });

      const sizeKB = body.erpData ? (JSON.stringify(body.erpData).length / 1024).toFixed(0) : "0";
      console.log(`[stock-data] ✓ POST erp — ${sizeKB} KB salvo em ${savedAt}`);

    } else if (source === "vtex") {
      await col.replaceOne({ _id: "vtex" }, {
        _id: "vtex",
        vtexMap: body.vtexMap,
        vtexFileName: body.vtexFileName,
        lastUpdated: body.lastUpdated,
        savedAt,
      }, { upsert: true });

      const entries = body.vtexMap ? Object.keys(body.vtexMap as object).length : 0;
      console.log(`[stock-data] ✓ POST vtex — ${entries} SKUs salvos em ${savedAt}`);

    } else if (source === "meli") {
      await col.replaceOne({ _id: "meli" }, {
        _id: "meli",
        meliData: body.meliData,
        meliFileName: body.meliFileName,
        lastUpdated: body.lastUpdated,
        savedAt,
      }, { upsert: true });

      const entries = body.meliData ? Object.keys(body.meliData as object).length : 0;
      console.log(`[stock-data] ✓ POST meli — ${entries} itens salvos em ${savedAt}`);

    } else {
      // Fallback legado
      (body as Record<string, unknown>).savedAt = savedAt;
      await col.replaceOne({ _id: "legacy" }, {
        _id: "legacy",
        ...body,
      }, { upsert: true });

      console.log(`[stock-data] ✓ POST legacy salvo em ${savedAt}`);
    }

    return NextResponse.json(
      { success: true, savedAt },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error("[stock-data] POST — Erro ao salvar no MongoDB:", err);
    return NextResponse.json(
      { error: `Erro ao salvar: ${String(err)}` },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE — limpa todos os dados salvos
 */
export async function DELETE() {
  try {
    const db = await getDb();
    await db.collection<StockDoc>(COLLECTION).deleteMany({});
    console.log("[stock-data] ✓ DELETE — Todos os dados limpos do MongoDB");
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] DELETE — Erro:", err);
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  }
}
