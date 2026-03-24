/**
 * Cliente HTTP para comunicação com o backend .NET
 *
 * Centraliza todas as chamadas à API para facilitar
 * manutenção e adição de autenticação futuramente.
 */

const API_URL = process.env.API_URL ?? "http://localhost:5000";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }

  return res.json();
}

// ── Estoque ──────────────────────────────────────────────────────────────────

export const estoqueApi = {
  getStats: () =>
    apiFetch<{
      totalErp: number;
      totalMeli: number;
      divergencias: number;
      soErp: number;
      soMeli: number;
      okCount: number;
    }>("/api/estoque/stats"),

  getConciliacao: (params?: { page?: number; pageSize?: number; status?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch(`/api/estoque/conciliacao${qs ? `?${qs}` : ""}`);
  },
};

// ── Pedidos ──────────────────────────────────────────────────────────────────

export const pedidosApi = {
  listar: (params?: { page?: number; status?: string; platform?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch(`/api/pedidos${qs ? `?${qs}` : ""}`);
  },
};
