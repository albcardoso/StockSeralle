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
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    // Arquivo não existe ainda — retorna estado vazio
    return NextResponse.json({ empty: true });
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
    console.log(`[stock-data] ✓ Dados salvos (${sizeKB} KB) em ${body.savedAt}`);

    return NextResponse.json({ success: true, savedAt: body.savedAt });
  } catch (err) {
    console.error("[stock-data] Erro ao salvar:", err);
    return NextResponse.json(
      { error: `Erro ao salvar: ${String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE — limpa os dados salvos (usado pelo "Novo import")
 */
export async function DELETE() {
  try {
    await fs.unlink(DATA_FILE);
    console.log("[stock-data] ✓ Dados limpos");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true }); // já não existia
  }
}
