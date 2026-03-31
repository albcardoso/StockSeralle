import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, isMeliConfigured } from "@/lib/meli-auth";

/**
 * GET /api/auth/meli/callback?code=...&state=...
 *
 * Callback do OAuth do Mercado Livre.
 * Recebe o authorization code, troca por tokens e redireciona para a página do app.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Se o usuário negou acesso
  if (error) {
    console.error("[auth/meli/callback] Erro OAuth:", error);
    const redirectUrl = new URL("/importar/meli-api", req.url);
    redirectUrl.searchParams.set("auth_error", error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    return NextResponse.json(
      { error: "Parâmetro 'code' não recebido do Mercado Livre" },
      { status: 400 }
    );
  }

  if (!isMeliConfigured()) {
    return NextResponse.json(
      { error: "Credenciais MeLi não configuradas no .env.local" },
      { status: 500 }
    );
  }

  try {
    console.log("[auth/meli/callback] Trocando code por tokens...");

    const tokenData = await exchangeCodeForTokens(code);

    console.log(
      `[auth/meli/callback] ✓ Autenticado! Seller: ${tokenData.user_id} (${tokenData.seller_nickname})`
    );

    // Redireciona para a página de importação com sucesso
    const redirectUrl = new URL("/importar/meli-api", req.url);
    redirectUrl.searchParams.set("auth_success", "true");
    redirectUrl.searchParams.set("seller", tokenData.seller_nickname || String(tokenData.user_id));
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[auth/meli/callback] Exceção:", err);
    const redirectUrl = new URL("/importar/meli-api", req.url);
    redirectUrl.searchParams.set("auth_error", err instanceof Error ? err.message : "Erro ao autenticar");
    return NextResponse.redirect(redirectUrl);
  }
}
