import { NextRequest, NextResponse } from "next/server";

const MELI_API = "https://api.mercadolibre.com";

/**
 * POST /api/meli-vendas
 *
 * Proxy server-side para a API de Orders do Mercado Livre.
 * Busca pedidos do seller, enriquece com dados de shipment, items e billing.
 *
 * Body esperado (JSON):
 * {
 *   "accessToken": "APP_USR-...",
 *   "sellerId": "123456789",
 *   "dateFrom": "2026-03-01T00:00:00.000-03:00",
 *   "dateTo": "2026-03-31T23:59:59.000-03:00",
 *   "limit": 50,
 *   "offset": 0
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, sellerId, dateFrom, dateTo, limit = 50, offset = 0 } = body;

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

    // ── 1. Buscar pedidos ────────────────────────────────────────────────────
    const params = new URLSearchParams({
      seller: sellerId,
      sort: "date_desc",
      limit: String(limit),
      offset: String(offset),
    });
    if (dateFrom) params.set("order.date_created.from", dateFrom);
    if (dateTo) params.set("order.date_created.to", dateTo);

    console.log(`[meli-vendas] Buscando pedidos: offset=${offset}, limit=${limit}`);

    const ordersResp = await fetch(`${MELI_API}/orders/search?${params}`, { headers });

    if (!ordersResp.ok) {
      const errText = await ordersResp.text().catch(() => "");
      console.error("[meli-vendas] Erro Orders:", ordersResp.status, errText);
      return NextResponse.json(
        { error: `Erro na API MeLi Orders: ${ordersResp.status}`, detail: errText },
        { status: 502 }
      );
    }

    const ordersJson = await ordersResp.json();
    const orders = ordersJson.results || [];
    const totalOrders = ordersJson.paging?.total || 0;

    console.log(`[meli-vendas] ${orders.length} pedidos retornados (total: ${totalOrders})`);

    // ── 2. Enriquecer cada pedido com dados complementares ────────────────
    const enrichedOrders = await Promise.all(
      orders.map(async (order: MeliOrder) => {
        try {
          return await enrichOrder(order, headers);
        } catch (err) {
          console.warn(`[meli-vendas] Erro ao enriquecer order ${order.id}:`, err);
          return transformOrderBasic(order);
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedOrders,
      total: totalOrders,
      offset,
      limit,
      hasMore: offset + limit < totalOrders,
    });
  } catch (err) {
    console.error("[meli-vendas] Exceção:", err);
    return NextResponse.json(
      { error: "Erro interno ao consultar API MeLi", detail: String(err) },
      { status: 500 }
    );
  }
}

// ── Tipos auxiliares ──────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MeliOrder {
  id: number;
  status: string;
  status_detail: any;
  date_created: string;
  date_closed: string;
  pack_id: number | null;
  total_amount: number;
  paid_amount: number;
  currency_id: string;
  buyer: { id: number; nickname: string };
  order_items: any[];
  payments: any[];
  shipping: { id: number; status?: string };
  tags: string[];
  cancel_detail?: any;
  mediations?: any[];
}

// ── Enriquecimento do pedido ──────────────────────────────────────────────────

async function enrichOrder(order: MeliOrder, headers: Record<string, string>) {
  const base = transformOrderBasic(order);

  // Buscar dados de shipment
  const shipmentId = order.shipping?.id;
  if (shipmentId) {
    try {
      const shipResp = await fetch(`${MELI_API}/shipments/${shipmentId}`, { headers });
      if (shipResp.ok) {
        const ship = await shipResp.json();
        base.forma_entrega = mapLogisticType(ship.logistic_type);
        base.data_a_caminho = ship.status_history?.date_shipped || "";
        base.data_entrega = ship.status_history?.date_delivered || "";
        base.motorista = ship.service_id ? "Mercado Envios" : "";
        base.numero_rastreamento = ship.tracking_number || "";
        base.url_rastreamento = ship.tracking_number
          ? buildTrackingUrl(ship.tracking_number)
          : "";
        base.logistic_type = ship.logistic_type || "";

        // Endereço do comprador (receiver_address)
        const addr = ship.receiver_address;
        if (addr) {
          base.comprador_endereco = formatAddress(addr);
          base.comprador_cidade = addr.city?.name || "";
          base.comprador_estado = addr.state?.name || "";
          base.comprador_cep = addr.zip_code || "";
          base.comprador_pais = addr.country?.name || "Brasil";
        }
      }
    } catch (e) {
      console.warn(`[meli-vendas] Erro shipment ${shipmentId}:`, e);
    }
  }

  // Buscar billing_info (dados fiscais)
  try {
    const billResp = await fetch(`${MELI_API}/orders/${order.id}/billing_info`, { headers });
    if (billResp.ok) {
      const bill = await billResp.json();
      const bi = bill.billing_info;
      if (bi) {
        base.comprador_doc_tipo = bi.doc_type || "";
        base.comprador_doc_numero = bi.doc_number || "";
        base.comprador_nome_fiscal = bi.name
          ? `${bi.name} ${bi.last_name || ""}`.trim()
          : base.comprador_nome;
        base.comprador_endereco_fiscal = bi.address
          ? formatBillingAddress(bi.address)
          : "";
      }
    }
  } catch (e) {
    console.warn(`[meli-vendas] Erro billing_info order ${order.id}:`, e);
  }

  // Buscar detalhes dos items (listing_type, variação)
  const itemIds = order.order_items
    .map((oi: any) => oi.item?.id)
    .filter(Boolean)
    .slice(0, 20);

  if (itemIds.length > 0) {
    try {
      const itemsResp = await fetch(
        `${MELI_API}/items?ids=${itemIds.join(",")}&attributes=id,listing_type_id,seller_custom_field,variations`,
        { headers }
      );
      if (itemsResp.ok) {
        const itemsData = await itemsResp.json();
        const itemMap: Record<string, any> = {};
        for (const entry of itemsData) {
          if (entry.code === 200 && entry.body) {
            itemMap[entry.body.id] = entry.body;
          }
        }
        // Enriquecer tipo de anúncio
        const firstItem = order.order_items[0]?.item;
        if (firstItem?.id && itemMap[firstItem.id]) {
          base.tipo_anuncio = mapListingType(itemMap[firstItem.id].listing_type_id);
        }
      }
    } catch (e) {
      console.warn(`[meli-vendas] Erro items batch:`, e);
    }
  }

  return base;
}

// ── Transformação básica (sem enriquecimento) ────────────────────────────────

function transformOrderBasic(order: MeliOrder) {
  const firstItem = order.order_items?.[0];
  const item = firstItem?.item || {};
  const payment = order.payments?.[0] || {};
  const totalQty = order.order_items?.reduce((s: number, oi: any) => s + (oi.quantity || 0), 0) || 0;
  const totalReceita = order.order_items?.reduce(
    (s: number, oi: any) => s + (oi.quantity || 0) * (oi.unit_price || 0),
    0
  ) || 0;

  // Determinar status traduzido
  const statusDesc = buildStatusDescription(order);

  return {
    // ── Vendas (cols 0-9) ──
    numero_venda: String(order.id),
    data_venda: order.date_created,
    estado: statusDesc.estado,
    descricao_status: statusDesc.descricao,
    pacote_diversos: order.pack_id ? "Sim" : "Não",
    pertence_kit: "Não",
    unidades: totalQty,
    receita_produtos: round2(totalReceita),
    receita_acrescimo: "",
    taxa_parcelamento: payment.installments ? `${payment.installments}x` : "",

    // ── Tarifas (cols 10-18) ──
    tarifa_venda_impostos: "",
    receita_envio: "",
    tarifas_envio: "",
    custo_envio_troca: "",
    custo_envio_medidas: "",
    diferenca_medidas_peso: "",
    cancelamentos_reembolsos: order.status === "cancelled" ? round2(totalReceita) : "",
    total_brl: round2(order.total_amount || 0),
    mes_faturamento: derivarMesFaturamento(order.date_created),

    // ── Publicidade (col 19) ──
    venda_publicidade: order.tags?.includes("paid_advertising") ? "Sim" : " ",

    // ── Anúncios (cols 20-26) ──
    sku: item.seller_custom_field || item.seller_sku || "",
    numero_anuncio: item.id || "",
    loja_oficial: "Seralle",
    titulo_anuncio: item.title || "",
    variacao: formatVariation(item.variation_attributes),
    preco_unitario: round2(firstItem?.unit_price || 0),
    tipo_anuncio: "",

    // ── Faturamento (cols 27-32) ──
    nfe_anexo: "",
    comprador_dados: "",
    comprador_doc_tipo: "",
    comprador_doc_numero: "",
    comprador_endereco_fiscal: "",
    tipo_contribuinte: "",
    inscricao_estadual: "",

    // ── Compradores (cols 33-40) ──
    comprador_nome: order.buyer?.nickname || "",
    comprador_nome_fiscal: "",
    comprador_cpf: "",
    comprador_endereco: "",
    comprador_cidade: "",
    comprador_estado: "",
    comprador_cep: "",
    comprador_pais: "Brasil",

    // ── Envios (cols 41-46) ──
    forma_entrega: "",
    data_a_caminho: "",
    data_entrega: "",
    motorista: "",
    numero_rastreamento: "",
    url_rastreamento: "",

    // ── Campos auxiliares (não na planilha mas úteis) ──
    logistic_type: "",
    order_status_raw: order.status,
    shipping_status_raw: order.shipping?.status || "",
    pack_id: order.pack_id || "",
    buyer_id: order.buyer?.id || "",
    payment_status: payment.status || "",
    payment_id: payment.id || "",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildStatusDescription(order: MeliOrder): { estado: string; descricao: string } {
  const s = order.status;
  const ss = order.shipping?.status || "";
  const sd = order.status_detail;

  if (s === "cancelled") {
    const reason = order.cancel_detail?.reason || sd?.reason || "";
    if (reason === "buyer" || reason === "buyer_cancellation") {
      return { estado: "Cancelada pelo comprador", descricao: sd?.description || "O comprador cancelou a compra." };
    }
    if (reason === "admin" || reason === "fraud") {
      return { estado: "Cancelada pelo Mercado Livre", descricao: sd?.description || "Cancelada por irregularidades." };
    }
    return { estado: "Cancelada", descricao: sd?.description || reason || "Cancelada" };
  }

  if (s === "paid" || s === "confirmed") {
    switch (ss) {
      case "delivered": return { estado: "Entregue", descricao: "Produto entregue ao comprador." };
      case "shipped": return { estado: "A caminho", descricao: "Pacote em trânsito." };
      case "ready_to_ship": return { estado: "Pronta para envio", descricao: "Etiqueta pronta, aguardando despacho." };
      case "pending": return { estado: "Aguardando etiqueta", descricao: "Envio padrão, etiqueta será gerada em breve." };
      case "not_delivered": return { estado: "Não entregue", descricao: "Tentativa de entrega falhou." };
      default: return { estado: "Pago", descricao: sd?.description || "Pagamento confirmado." };
    }
  }

  if (s === "payment_required") return { estado: "Aguardando pagamento", descricao: "Pagamento pendente." };

  return { estado: s || "Desconhecido", descricao: sd?.description || "" };
}

function mapLogisticType(lt: string): string {
  const map: Record<string, string> = {
    fulfillment: "Mercado Envios Full",
    xd: "Correios e pontos de envio",
    cross_docking: "Correios e pontos de envio",
    drop_off: "Correios e pontos de envio",
    custom: "Combinar com comprador",
    self_service: "Retirada no local",
  };
  return map[lt] || lt || "";
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

function formatVariation(attrs: any[] | undefined): string {
  if (!attrs || !Array.isArray(attrs)) return "";
  return attrs
    .map((a: any) => `${a.name || a.id} : ${a.value_name || a.value_id || ""}`)
    .join(" | ");
}

function formatAddress(addr: any): string {
  const parts = [
    addr.street_name,
    addr.street_number,
    addr.comment,
  ].filter(Boolean);
  if (addr.zip_code) parts.push(`CEP ${addr.zip_code}`);
  if (addr.city?.name) parts.push(addr.city.name);
  if (addr.state?.name) parts.push(addr.state.name);
  return parts.join(", ");
}

function formatBillingAddress(addr: any): string {
  if (typeof addr === "string") return addr;
  const parts = [
    addr.street_name,
    addr.street_number,
    addr.city?.name || addr.city,
    addr.state?.name || addr.state,
    addr.zip_code ? `CEP ${addr.zip_code}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function buildTrackingUrl(tracking: string): string {
  if (!tracking) return "";
  // Correios: códigos com letras no início e fim (ex: BR123456789BR)
  if (/^[A-Z]{2}\d+[A-Z]{2}$/.test(tracking)) {
    return `https://www.linkcorreios.com.br/?id=${tracking}`;
  }
  // MeLi Full / UUID
  return "";
}

function derivarMesFaturamento(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  // Tarifas do ML são faturadas no mês seguinte
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${meses[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
