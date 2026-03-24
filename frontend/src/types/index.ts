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
