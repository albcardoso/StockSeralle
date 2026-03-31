import { NextResponse } from "next/server";
import { buildAuthUrl, isMeliConfigured } from "@/lib/meli-auth";

/**
 * GET /api/auth/meli
 *
 * Inicia o fluxo OAuth do Mercado Livre.
 * Redireciona o usuário para a tela de login/autorização do MeLi.
 */
export async function GET() {
  if (!isMeliConfigured()) {
    return NextResponse.json(
      {
        error: "Credenciais do Mercado Livre não configuradas.",
        detail: "Configure MELI_APP_ID e MELI_CLIENT_SECRET no .env.local",
      },
      { status: 500 }
    );
  }

  // Gerar state aleatório para proteção contra CSRF
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = buildAuthUrl(state);

  console.log("[auth/meli] Redirecionando para autorização MeLi...");

  return NextResponse.redirect(authUrl);
}
