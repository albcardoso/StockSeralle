import { NextRequest, NextResponse } from "next/server";

const SPACE_URL = "https://space-report.space.app.br/integracao";
const SPACE_TOKEN =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiQVBJX0VDT01NRVJDRSIsInR5cGUiOiJpbnRlZ3JhY2FvIiwiaWRfZ3J1cG8iOjEsInJlbGF0b3Jpb3MiOls4NV19.m5Pz69maoyeqD_yTYQAQ7dzdt-BiUFWnOzFqz1ybWf4";

/**
 * POST /api/space-estoque
 *
 * Proxy server-side para a API do Space Report.
 * Evita problemas de CORS fazendo a chamada pelo servidor Next.js.
 *
 * Body esperado (JSON):
 * {
 *   "idRelatorio": 85,
 *   "idEmpresa": 98,
 *   "periodoInicio": "01-03-2026",
 *   "periodoFim": "31-03-2026",
 *   "empresaEstoque": 98,
 *   "empresaVenda": 98
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      idRelatorio = 85,
      idEmpresa = 98,
      periodoInicio,
      periodoFim,
      empresaEstoque = 98,
      empresaVenda = 98,
    } = body;

    if (!periodoInicio || !periodoFim) {
      return NextResponse.json(
        { error: "periodoInicio e periodoFim são obrigatórios" },
        { status: 400 }
      );
    }

    // Monta o payload no formato que a API Space espera
    const spaceBody = {
      ">ID<": idRelatorio,
      ">ID_CAD_EMPRESA<": idEmpresa,
      ":PERIODO": `'${periodoInicio}'`,
      ":1PERIODO": `'${periodoFim}'`,
      ":EMPRESA_ESTOQUE": empresaEstoque,
      ":EMPRESA_VENDA": empresaVenda,
    };

    console.log("[space-estoque] Consultando Space API:", JSON.stringify(spaceBody));

    const spaceResp = await fetch(SPACE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: SPACE_TOKEN,
      },
      body: JSON.stringify(spaceBody),
    });

    if (!spaceResp.ok) {
      const errText = await spaceResp.text().catch(() => "");
      console.error("[space-estoque] Erro Space:", spaceResp.status, errText);
      return NextResponse.json(
        { error: `Erro na API Space: ${spaceResp.status}`, detail: errText },
        { status: spaceResp.statusText ? 502 : 500 }
      );
    }

    const data = await spaceResp.json();

    console.log(
      `[space-estoque] ✓ Resposta recebida: ${Array.isArray(data) ? data.length : "objeto"} registros`
    );

    return NextResponse.json({ success: true, data, total: Array.isArray(data) ? data.length : 0 });
  } catch (err) {
    console.error("[space-estoque] Exceção:", err);
    return NextResponse.json(
      { error: "Erro interno ao consultar Space API", detail: String(err) },
      { status: 500 }
    );
  }
}
