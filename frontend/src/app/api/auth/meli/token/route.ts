import { NextResponse } from "next/server";
import { getValidToken, getConnectionStatus, disconnectMeli } from "@/lib/meli-auth";

/**
 * GET /api/auth/meli/token
 *
 * Retorna o status da conexão e o token válido (com refresh automático).
 * O frontend usa esta rota para verificar se está conectado e obter o token.
 *
 * Retorna:
 *   - connected: boolean
 *   - configured: boolean
 *   - sellerId, sellerNickname, expiresAt (se conectado)
 *   - accessToken (se conectado — para uso nas APIs)
 */
export async function GET() {
  try {
    const status = await getConnectionStatus();

    if (!status.connected) {
      return NextResponse.json({
        ...status,
        accessToken: null,
      });
    }

    // Obter token válido (faz refresh se necessário)
    const token = await getValidToken();

    return NextResponse.json({
      ...status,
      accessToken: token?.access_token || null,
      sellerId: token?.user_id || status.sellerId,
      sellerNickname: token?.seller_nickname || status.sellerNickname,
      expiresAt: token?.expires_at || status.expiresAt,
    });
  } catch (err) {
    console.error("[auth/meli/token] Erro:", err);
    return NextResponse.json(
      { connected: false, configured: false, error: String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/meli/token
 *
 * Desconecta a conta do Mercado Livre (remove tokens do MongoDB).
 */
export async function DELETE() {
  try {
    await disconnectMeli();
    return NextResponse.json({ success: true, message: "Conta MeLi desconectada" });
  } catch (err) {
    console.error("[auth/meli/token] Erro ao desconectar:", err);
    return NextResponse.json(
      { error: "Erro ao desconectar", detail: String(err) },
      { status: 500 }
    );
  }
}
