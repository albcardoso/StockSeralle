import { NextRequest, NextResponse } from "next/server";

const MELI_API = "https://api.mercadolibre.com";

/**
 * POST /api/meli-fulfillment
 *
 * Proxy server-side para a API de Fulfillment/Inventory do Mercado Livre.
 * Busca todos os itens do seller que estão em fulfillment e retorna dados
 * equivalentes à planilha de Relatório Geral de Estoque (5 abas).
 *
 * Body esperado (JSON):
 * {
 *   "accessToken": "APP_USR-...",
 *   "sellerId": "123456789"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, sellerId } = body;

    if (!accessToken || !sellerId) {
      return NextResponse.json(
        { error: "accessToken e sellerId são obrigatórios" },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // ── 1. Buscar todos os itens do seller com fulfillment ───────────────
    console.log("[meli-fulfillment] Buscando itens fulfillment do seller:", sellerId);

    const allItems: FulfillmentItem[] = [];
    let offset = 0;
    const limit = 50;
    let total = 0;

    do {
      const params = new URLSearchParams({
        seller_id: sellerId,
        status: "active",
        logistic_type: "fulfillment",
        limit: String(limit),
        offset: String(offset),
      });

      const resp = await fetch(`${MELI_API}/users/${sellerId}/items/search?${params}`, { headers });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error("[meli-fulfillment] Erro items/search:", resp.status, errText);
        return NextResponse.json(
          { error: `Erro na API MeLi: ${resp.status}`, detail: errText },
          { status: 502 }
        );
      }

      const json = await resp.json();
      total = json.paging?.total || 0;
      const itemIds: string[] = json.results || [];

      if (itemIds.length === 0) break;

      // Buscar detalhes em batch (até 20 por vez)
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        try {
          const itemsResp = await fetch(
            `${MELI_API}/items?ids=${batch.join(",")}`,
            { headers }
          );

          if (itemsResp.ok) {
            const itemsData = await itemsResp.json();
            for (const entry of itemsData) {
              if (entry.code === 200 && entry.body) {
                const item = entry.body;
                allItems.push(transformFulfillmentItem(item));
              }
            }
          }
        } catch (e) {
          console.warn(`[meli-fulfillment] Erro batch items:`, e);
        }
      }

      offset += limit;
      console.log(`[meli-fulfillment] Progresso: ${allItems.length}/${total}`);
    } while (offset < total);

    // ── 2. Buscar dados de estoque fulfillment para cada item ──────────
    const enrichedItems = await enrichWithFulfillmentStock(allItems, sellerId, headers);

    // ── 3. Classificar por qualidade (simulando as abas da planilha) ────
    const classified = classifyItems(enrichedItems);

    console.log(
      `[meli-fulfillment] ✓ ${enrichedItems.length} itens. Boa qualidade: ${classified.boaQualidade.length}, ` +
      `Impulsionar: ${classified.impulsionarVendas.length}, Colocar à venda: ${classified.colocarVenda.length}, ` +
      `Evitar descarte: ${classified.evitarDescarte.length}`
    );

    return NextResponse.json({
      success: true,
      data: enrichedItems,
      total: enrichedItems.length,
      resumo: {
        total_unidades: enrichedItems.reduce((s, i) => s + i.quantidade_disponivel, 0),
        boa_qualidade: classified.boaQualidade.length,
        impulsionar_vendas: classified.impulsionarVendas.length,
        colocar_venda: classified.colocarVenda.length,
        evitar_descarte: classified.evitarDescarte.length,
      },
      classificacao: classified,
    });
  } catch (err) {
    console.error("[meli-fulfillment] Exceção:", err);
    return NextResponse.json(
      { error: "Erro interno ao consultar Fulfillment API", detail: String(err) },
      { status: 500 }
    );
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FulfillmentItem {
  codigo_ml: string;           // inventory_id
  codigo_universal: string;    // EAN/GTIN
  sku: string;                 // seller_custom_field
  numero_anuncio: string;      // item_id (MLB...)
  agrupador_variacoes: string; // parent_id
  produto: string;             // title
  quantidade_disponivel: number;
  quantidade_total: number;
  quantidade_reservada: number;
  quantidade_nao_disponivel: number;
  status: string;
  tipo_produto: string;
  listing_type: string;
  data_criacao: string;
  variacao: string;
  // Campos enriquecidos
  vendas_30d: number;
  tempo_esgotar: string;
  classificacao: string;
}

// ── Transformação ────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function transformFulfillmentItem(item: any): FulfillmentItem {
  const ean = item.attributes?.find(
    (a: any) => a.id === "GTIN" || a.id === "EAN" || a.id === "UPC"
  )?.value_name || "";

  const condition = item.attributes?.find(
    (a: any) => a.id === "ITEM_CONDITION"
  )?.value_name || "Novo";

  const variation = item.variations?.[0];
  const variationAttrs = variation?.attribute_combinations || [];

  return {
    codigo_ml: item.id || "",
    codigo_universal: ean,
    sku: item.seller_custom_field || variation?.seller_custom_field || "",
    numero_anuncio: item.id || "",
    agrupador_variacoes: item.item_relations?.parent_id || "",
    produto: item.title || "",
    quantidade_disponivel: item.available_quantity || 0,
    quantidade_total: item.initial_quantity || item.available_quantity || 0,
    quantidade_reservada: 0,
    quantidade_nao_disponivel: 0,
    status: item.status || "",
    tipo_produto: condition,
    listing_type: mapListingType(item.listing_type_id),
    data_criacao: item.date_created || "",
    variacao: variationAttrs
      .map((a: any) => `${a.name}: ${a.value_name}`)
      .join(" | "),
    vendas_30d: 0,
    tempo_esgotar: "",
    classificacao: "",
  };
}

async function enrichWithFulfillmentStock(
  items: FulfillmentItem[],
  sellerId: string,
  headers: Record<string, string>
): Promise<FulfillmentItem[]> {
  // Tentar buscar dados de estoque do fulfillment
  for (const item of items) {
    if (!item.sku) continue;

    try {
      const resp = await fetch(
        `${MELI_API}/users/${sellerId}/fulfillment/inventory?seller_sku=${encodeURIComponent(item.sku)}`,
        { headers }
      );
      if (resp.ok) {
        const data = await resp.json();
        const inv = Array.isArray(data) ? data[0] : data;
        if (inv) {
          item.quantidade_disponivel = inv.available_quantity ?? item.quantidade_disponivel;
          item.quantidade_total = inv.total_quantity ?? item.quantidade_total;
          item.quantidade_reservada = inv.reserved_quantity ?? 0;
          item.quantidade_nao_disponivel = inv.not_available_quantity ?? 0;
          item.codigo_ml = inv.inventory_id || item.codigo_ml;
        }
      }
    } catch {
      // Silenciosamente ignora erros individuais
    }
  }

  return items;
}

function classifyItems(items: FulfillmentItem[]) {
  const boaQualidade: FulfillmentItem[] = [];
  const impulsionarVendas: FulfillmentItem[] = [];
  const colocarVenda: FulfillmentItem[] = [];
  const evitarDescarte: FulfillmentItem[] = [];

  for (const item of items) {
    if (item.status === "paused" || item.status === "closed") {
      item.classificacao = "colocar_venda";
      colocarVenda.push(item);
    } else if (item.quantidade_disponivel <= 0) {
      item.classificacao = "evitar_descarte";
      evitarDescarte.push(item);
    } else if (item.vendas_30d === 0 && item.quantidade_disponivel > 0) {
      // Sem vendas nos últimos 30 dias = impulsionar
      item.classificacao = "impulsionar_vendas";
      impulsionarVendas.push(item);
    } else {
      item.classificacao = "boa_qualidade";
      boaQualidade.push(item);
    }
  }

  return { boaQualidade, impulsionarVendas, colocarVenda, evitarDescarte };
}

function mapListingType(lt: string): string {
  const map: Record<string, string> = {
    gold_special: "Clássico",
    gold_premium: "Premium",
    gold_pro: "Premium",
    gold: "Ouro",
    silver: "Prata",
    bronze: "Bronze",
    free: "Grátis",
  };
  return map[lt] || lt || "";
}
