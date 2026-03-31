/**
 * Gerenciamento de tokens OAuth 2.0 do Mercado Livre.
 *
 * Armazena tokens no MongoDB com refresh automático.
 * O access_token expira em 6h, o refresh_token em 6 meses (renova a cada uso).
 *
 * Fluxo:
 * 1. Usuário clica "Conectar MeLi" → redireciona para auth.mercadolibre.com.br
 * 2. MeLi redireciona de volta com ?code=... → callback troca por tokens
 * 3. Tokens salvos no MongoDB → refresh automático antes de expirar
 *
 * Variáveis de ambiente necessárias:
 *   MELI_APP_ID       — ID da aplicação no painel de developers
 *   MELI_CLIENT_SECRET — Secret da aplicação
 *   MELI_REDIRECT_URI  — URL de callback (ex: http://localhost:3000/api/auth/meli/callback)
 */

import { getDb } from "./mongodb";

const MELI_AUTH_URL = "https://auth.mercadolibre.com.br/authorization";
const MELI_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MeliTokenData {
  _id: string;                    // "meli_token" (singleton)
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;             // segundos (geralmente 21600 = 6h)
  scope: string;
  user_id: number;                // seller_id do MeLi
  obtained_at: string;            // ISO timestamp de quando foi obtido
  expires_at: string;             // ISO timestamp de quando expira
  seller_nickname?: string;       // nickname do seller (preenchido após /users/me)
}

export interface MeliCredentials {
  appId: string;
  clientSecret: string;
  redirectUri: string;
}

// ── Helpers de config ─────────────────────────────────────────────────────────

export function getMeliCredentials(): MeliCredentials {
  return {
    appId: process.env.MELI_APP_ID || "",
    clientSecret: process.env.MELI_CLIENT_SECRET || "",
    redirectUri: process.env.MELI_REDIRECT_URI || "http://localhost:3000/api/auth/meli/callback",
  };
}

export function isMeliConfigured(): boolean {
  const creds = getMeliCredentials();
  return !!(creds.appId && creds.clientSecret);
}

// ── URL de autorização ────────────────────────────────────────────────────────

export function buildAuthUrl(state?: string): string {
  const creds = getMeliCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.appId,
    redirect_uri: creds.redirectUri,
  });
  if (state) params.set("state", state);
  return `${MELI_AUTH_URL}?${params}`;
}

// ── Trocar code por tokens ────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<MeliTokenData> {
  const creds = getMeliCredentials();

  const resp = await fetch(MELI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: creds.appId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: creds.redirectUri,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Erro ao trocar code por token: ${resp.status} — ${errText}`);
  }

  const data = await resp.json();
  return await saveToken(data);
}

// ── Refresh do token ──────────────────────────────────────────────────────────

export async function refreshAccessToken(currentRefreshToken: string): Promise<MeliTokenData> {
  const creds = getMeliCredentials();

  console.log("[meli-auth] Renovando access_token via refresh_token...");

  const resp = await fetch(MELI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.appId,
      client_secret: creds.clientSecret,
      refresh_token: currentRefreshToken,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("[meli-auth] Erro no refresh:", resp.status, errText);
    throw new Error(`Erro ao renovar token: ${resp.status} — ${errText}`);
  }

  const data = await resp.json();
  console.log("[meli-auth] Token renovado com sucesso!");
  return await saveToken(data);
}

// ── Obter token válido (com refresh automático) ───────────────────────────────

/**
 * Retorna um access_token válido.
 * Se o token estiver expirado ou prestes a expirar (30min antes),
 * faz refresh automático.
 *
 * Retorna null se não houver token salvo (usuário precisa autenticar).
 */
export async function getValidToken(): Promise<MeliTokenData | null> {
  const db = await getDb();
  const stored = await db.collection<MeliTokenData>("meli_tokens").findOne({ _id: "meli_token" } as any);

  if (!stored) {
    console.log("[meli-auth] Nenhum token salvo. Usuário precisa autenticar.");
    return null;
  }

  // Verificar se está expirado ou expira em menos de 30 minutos
  const expiresAt = new Date(stored.expires_at);
  const now = new Date();
  const thirtyMinFromNow = new Date(now.getTime() + 30 * 60 * 1000);

  if (expiresAt > thirtyMinFromNow) {
    // Token ainda válido
    console.log(`[meli-auth] Token válido até ${expiresAt.toISOString()}`);
    return stored;
  }

  // Token expirado ou prestes a expirar → refresh
  console.log(`[meli-auth] Token expira em ${expiresAt.toISOString()}, renovando...`);

  try {
    return await refreshAccessToken(stored.refresh_token);
  } catch (err) {
    console.error("[meli-auth] Falha no refresh:", err);
    // Se o refresh falhar, o usuário precisa reautenticar
    return null;
  }
}

// ── Salvar token no MongoDB ───────────────────────────────────────────────────

async function saveToken(data: {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
}): Promise<MeliTokenData> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + data.expires_in * 1000);

  const tokenDoc: MeliTokenData = {
    _id: "meli_token",
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || "Bearer",
    expires_in: data.expires_in,
    scope: data.scope || "",
    user_id: data.user_id,
    obtained_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // Buscar nickname do seller
  try {
    const meResp = await fetch(`https://api.mercadolibre.com/users/${data.user_id}`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (meResp.ok) {
      const me = await meResp.json();
      tokenDoc.seller_nickname = me.nickname || "";
    }
  } catch {
    // Não falha se não conseguir buscar nickname
  }

  const db = await getDb();
  await db.collection("meli_tokens").replaceOne(
    { _id: "meli_token" } as any,
    tokenDoc as any,
    { upsert: true }
  );

  console.log(
    `[meli-auth] Token salvo: user_id=${tokenDoc.user_id}, ` +
    `nickname=${tokenDoc.seller_nickname}, expira=${tokenDoc.expires_at}`
  );

  return tokenDoc;
}

// ── Revogar/desconectar ───────────────────────────────────────────────────────

export async function disconnectMeli(): Promise<void> {
  const db = await getDb();
  await db.collection("meli_tokens").deleteOne({ _id: "meli_token" } as any);
  console.log("[meli-auth] Token removido. Conta MeLi desconectada.");
}

// ── Status da conexão ─────────────────────────────────────────────────────────

export interface MeliConnectionStatus {
  connected: boolean;
  configured: boolean;
  sellerId?: number;
  sellerNickname?: string;
  expiresAt?: string;
  needsReauth?: boolean;
}

export async function getConnectionStatus(): Promise<MeliConnectionStatus> {
  if (!isMeliConfigured()) {
    return { connected: false, configured: false };
  }

  const token = await getValidToken();

  if (!token) {
    return { connected: false, configured: true, needsReauth: true };
  }

  return {
    connected: true,
    configured: true,
    sellerId: token.user_id,
    sellerNickname: token.seller_nickname,
    expiresAt: token.expires_at,
  };
}
