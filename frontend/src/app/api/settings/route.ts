import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const SETTINGS_ID = "app_settings";

export interface AppSettings {
  enableImport: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  enableImport: true,
};

/**
 * GET /api/settings
 * Retorna as configurações do app.
 */
export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ _id: SETTINGS_ID });

    if (!doc) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    return NextResponse.json({
      enableImport: doc.enableImport ?? DEFAULT_SETTINGS.enableImport,
    });
  } catch (err) {
    console.error("[settings] Erro ao carregar:", err);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

/**
 * POST /api/settings
 * Salva as configurações do app.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const settings: AppSettings = {
      enableImport: typeof body.enableImport === "boolean" ? body.enableImport : DEFAULT_SETTINGS.enableImport,
    };

    await db.collection("settings").replaceOne(
      { _id: SETTINGS_ID },
      { _id: SETTINGS_ID, ...settings, updatedAt: new Date().toISOString() },
      { upsert: true }
    );

    return NextResponse.json({ success: true, ...settings });
  } catch (err) {
    console.error("[settings] Erro ao salvar:", err);
    return NextResponse.json({ error: "Erro ao salvar configurações" }, { status: 500 });
  }
}
