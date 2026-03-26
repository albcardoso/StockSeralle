// ── Conciliação ──────────────────────────────────────────────────────────────

export interface ConciliacaoItem {
  sku: string;
  descricao?: string;
  qtdErp?: number;
  qtdMeli?: number;
  status: "ok" | "divergente" | "so_erp" | "so_meli";
}

// ── Estoque ──────────────────────────────────────────────────────────────────

export interface ProdutoEstoque {
  sku: string;
  descricao: string;
  estoque: number;
  precoVenda?: number;
  plataformas: PlataformaSincronizada[];
}

export interface PlataformaSincronizada {
  platform: "mercadolivre" | "amazon" | "shopee";
  externalId: string;
  status: "active" | "paused" | "sold_out";
  estoque: number;
  lastSyncAt: string;
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

export interface Pedido {
  id: string;
  platform: "mercadolivre" | "amazon" | "shopee";
  externalOrderId: string;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled";
  total: number;
  compradorNome: string;
  createdAt: string;
  items: PedidoItem[];
}

export interface PedidoItem {
  sku: string;
  descricao: string;
  quantidade: number;
  preco: number;
}

// ── Fluxo de Suprimentos ─────────────────────────────────────────────────────

export interface SupplyFlowItem {
  sku: string;           // ID_PRO_PRODUTO_CAB (código do produto Space)
  produto: string;       // DESCRICAO_PRODUTO (ex: "69735 - TENIS RUNNING...")
  entradas: number;      // COMPRAS
  estoque: number;       // ESTOQUE
  vendas: number;        // VENDAS
  transferencias: number;// TRANSFERENCIAS
  pmv: number;           // PRECOM
  markup: string;        // MKP_R (ex: "2.80/2.10")
  giro: number;          // GIRO (%)
  cobertura: number;     // COBERTURA
  itens: number;         // ITENS
  ultimaEntrada: string; // DT_ULT_COMPRA (ex: "16/03/2026")
  entradaPendente?: number; // Vem do MeLi (cruzado via VTEX) — só com 3 imports
}

// ── MeLi ─────────────────────────────────────────────────────────────────────

export interface MeliItem {
  qty: number;
  desc: string;
  entradaPendente: number;
}

// ── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
