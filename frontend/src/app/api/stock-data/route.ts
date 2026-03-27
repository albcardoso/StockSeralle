/**
 * POST /api/stock-data  — salva os dados processados no servidor (JSON file)
 * GET  /api/stock-data  — carrega os dados da última importação
 *
 * Persistência simples em arquivo JSON no disco do servidor.
 * Qualquer usuário que acessar verá a última importação disponível.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// Diretório de dados persistentes (relativo à raiz do projeto)
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "stock-state.json");

// Headers para evitar qualquer tipo de cache
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

// Log do caminho uma vez na inicialização
console.log(`[stock-data] Diretório de dados: ${DATA_DIR}`);

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // já existe
  }
}

/**
 * GET — retorna o estado salvo (ou vazio se não houver)
 */
export async function GET() {
  try {
    await ensureDir();

    // Verifica se o arquivo existe antes de ler
    try {
      await fs.access(DATA_FILE);
    } catch {
      console.log("[stock-data] GET — arquivo não existe ainda em:", DATA_FILE);
      return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
    }

    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);

    const sizeKB = (Buffer.byteLength(raw) / 1024).toFixed(0);
    console.log(`[stock-data] GET — retornando ${sizeKB} KB (lastUpdated: ${data.lastUpdated ?? "N/A"})`);

    return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] GET — erro ao ler arquivo:", DATA_FILE, err);
    return NextResponse.json({ empty: true }, { headers: NO_CACHE_HEADERS });
  }
}

/**
 * POST — salva o estado completo no disco
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    await ensureDir();

    // Adiciona timestamp do servidor
    body.savedAt = new Date().toISOString();

    await fs.writeFile(DATA_FILE, JSON.stringify(body), "utf-8");

    const sizeKB = (Buffer.byteLength(JSON.stringify(body)) / 1024).toFixed(0);
    console.log(`[stock-data] ✓ POST — Dados salvos (${sizeKB} KB) em ${body.savedAt} → ${DATA_FILE}`);

    return NextResponse.json({ success: true, savedAt: body.savedAt }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error("[stock-data] POST — Erro ao salvar:", DATA_FILE, err);
    return NextResponse.json(
      { error: `Erro ao salvar: ${String(err)}` },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE — limpa os dados salvos (usado pelo "Novo import")
 */
export async function DELETE() {
  try {
    await fs.unlink(DATA_FILE);
    console.log("[stock-data] ✓ DELETE — Dados limpos:", DATA_FILE);
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch {
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS }); // já não existia
  }
}
