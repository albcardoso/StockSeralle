/**
 * POST /api/stock-data  — salva os dados processados no MongoDB
 * GET  /api/stock-data  — carrega os dados da última importação
 * DELETE /api/stock-data — limpa os dados salvos
 *
 * Persistência em MongoDB — funciona em produção (serverless, Docker, etc.).
 * Usa um único documento na collection "stock_state" com _id fixo "current".
 * Qualquer usuário que acessar verá a última importação disponível.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const COLLECTION = "stock_state";
const DOC_ID = "current";

// Headers para evitar qualquer tipo de cache
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// Helper: filtro por _id fixo (MongoDB aceita string como _id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filter = { _id: DOC_ID } as any;

/**
 * GET — retorna o estado salvo (ou vazio se não houver)
 */
export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne(filter);

    if (!doc) {
      console.log("[stock-data] GET — nenhum dado salvo no MongoDB");
      return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
    }

    // Remove _id do response (não é necessário no frontend)
    const { _id, ...data } = doc;

    const sizeKB = (JSON.stringify(data).length / 1024).toFixed(0);
    console.log(
      `[stock-data] GET — retornando ${sizeKB} KB do MongoDB (lastUpdated: ${data.lastUpdated ?? "N/A"})`
    );

    return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] GET — erro ao ler do MongoDB:", err);
    return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
  }
}

/**
 * POST — salva o estado completo no MongoDB (upsert com _id fixo)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    // Adiciona timestamp do servidor
    body.savedAt = new Date().toISOString();

    const db = await getDb();
    await db.collection(COLLECTION).replaceOne(
      filter,
      { _id: DOC_ID, ...body },
      { upsert: true }
    );

    const sizeKB = (JSON.stringify(body).length / 1024).toFixed(0);
    console.log(
      `[stock-data] ✓ POST — Dados salvos no MongoDB (${sizeKB} KB) em ${body.savedAt}`
    );

    return NextResponse.json(
      { success: true, savedAt: body.savedAt },
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
 * DELETE — limpa os dados salvos
 */
export async function DELETE() {
  try {
    const db = await getDb();
    await db.collection(COLLECTION).deleteOne(filter);
    console.log("[stock-data] ✓ DELETE — Dados limpos do MongoDB");
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] DELETE — Erro:", err);
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  }
}
