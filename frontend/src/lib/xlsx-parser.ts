/**
 * Parser XLSX/CSV para conciliação ERP × MeLi
 *
 * Estratégia: normalização de colunas (lowercase + sem acentos + trim)
 * + matching por palavras-chave para tolerar qualquer variação de export.
 */

import * as XLSX from "xlsx";
import type { ConciliacaoItem } from "@/types";

// ── Normalização ──────────────────────────────────────────────────────────────

/** Remove acentos, lowercase e trim — chave de comparação */
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Encontra a chave real de um objeto cujo nome normalizado contém
 * alguma das keywords fornecidas (na ordem de prioridade).
 */
function findCol(row: Record<string, unknown>, ...keywords: string[]): string | null {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const found = keys.find((k) => norm(k).includes(norm(kw)));
    if (found !== undefined) return found;
  }
  return null;
}

/** Lê valor de uma coluna por keywords, retorna string vazia se não achar */
function getStr(row: Record<string, unknown>, ...keywords: string[]): string {
  const col = findCol(row, ...keywords);
  return col ? String(row[col] ?? "").trim() : "";
}

/** Lê valor numérico de uma coluna por keywords */
function getNum(row: Record<string, unknown>, ...keywords: string[]): number {
  const col = findCol(row, ...keywords);
  if (!col) return 0;
  const raw = String(row[col] ?? "").replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// ── Diagnóstico ───────────────────────────────────────────────────────────────

export interface ParseDiagnostic {
  totalRows: number;
  validRows: number;
  detectedColumns: string[];
  skuColumn: string | null;
  qtyColumn: string | null;
  descColumn: string | null;
}

// ── Leitura do arquivo ────────────────────────────────────────────────────────

function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // Tenta array-buffer primeiro (mais confiável para xlsx moderno)
        const wb = XLSX.read(data, { type: "binary", cellDates: true });
        resolve(wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
    reader.readAsBinaryString(file);
  });
}

async function fileToRows(file: File): Promise<Record<string, unknown>[]> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    // CSV: detecta separador automaticamente
    const text = await file.text();
    const sep = text.includes(";") ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS: sep });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  }

  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

// ── Helper tamanho (Space) ────────────────────────────────────────────────────

function extractSize(s: string): string {
  const m = s.match(
    /\b(PP|P|M|G|GG|XGG|XS|XL|XXL|S|L|\d{2,3}(?:[.,]\d)?(?:\s*(?:cm|ml|L|kg|g|KG))?)\b/i
  );
  return m ? m[1].toUpperCase() : "";
}

// ── ERP Parser ────────────────────────────────────────────────────────────────

export async function parseErpXlsx(
  file: File
): Promise<{ data: Record<string, number>; diag: ParseDiagnostic }> {
  const rows = await fileToRows(file);

  if (rows.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  // Detecta colunas relevantes
  // SKU: "sku", "ref", "codigo", "cod", "referencia", "id"
  const skuCol = findCol(firstRow,
    "sku", "ref", "codigo", "cod ", "referencia", "código",
    "id produto", "id_produto", "product id"
  );

  // Nome/descrição (usado pelo Space para normalizar SKU)
  const nomeCol = findCol(firstRow,
    "nome", "produto", "descricao", "descri", "titulo", "name", "product"
  );

  // Estoque
  const qtyCol = findCol(firstRow,
    "estoque", "saldo", "qtd", "quantidade", "disponivel", "total",
    "stock", "inventory", "qty"
  );

  console.log("[ERP Parser] Arquivo:", file.name);
  console.log("[ERP Parser] Colunas detectadas:", allCols);
  console.log("[ERP Parser] SKU col:", skuCol, "| Nome col:", nomeCol, "| Qty col:", qtyCol);

  const data: Record<string, number> = {};
  let validRows = 0;

  for (const row of rows) {
    const skuRaw = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const nome = nomeCol ? String(row[nomeCol] ?? "").trim() : "";
    const qty = qtyCol ? parseFloat(String(row[qtyCol] ?? "0").replace(",", ".")) : 0;

    if (!skuRaw) continue;

    // Normaliza SKU: tenta extrair tamanho do nome (padrão Space)
    const size = nome ? extractSize(nome) : extractSize(skuRaw);
    const base = skuRaw.replace(/[-_]?\d+$/, "").replace(/\s+/g, " ").trim();
    const sku = size && !base.toUpperCase().includes(size) ? `${base} ${size}` : skuRaw;

    data[sku] = (data[sku] ?? 0) + (isNaN(qty) ? 0 : qty);
    validRows++;
  }

  return {
    data,
    diag: {
      totalRows: rows.length,
      validRows,
      detectedColumns: allCols,
      skuColumn: skuCol,
      qtyColumn: qtyCol,
      descColumn: nomeCol,
    },
  };
}

// ── MeLi Parser ───────────────────────────────────────────────────────────────

export async function parseMeliXlsx(
  file: File
): Promise<{ data: Record<string, { qty: number; desc: string }>; diag: ParseDiagnostic }> {
  const rows = await fileToRows(file);

  if (rows.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  // MeLi BR exporta: "SKU do vendedor", "Título do anúncio", "Quantidade disponível"
  // Mas pode variar: "Seller SKU", "Title", "Available quantity", "Stock", etc.
  const skuCol = findCol(firstRow,
    "sku do vendedor", "seller sku", "sku vendedor",
    "sku", "cod", "referencia", "codigo", "ref"
  );

  const descCol = findCol(firstRow,
    "titulo do anuncio", "titulo", "title", "nome", "descricao", "produto"
  );

  const qtyCol = findCol(firstRow,
    "quantidade disponivel", "disponivel", "quantidade",
    "estoque", "stock", "qty", "available", "saldo"
  );

  console.log("[MeLi Parser] Arquivo:", file.name);
  console.log("[MeLi Parser] Todas as colunas:", allCols);
  console.log("[MeLi Parser] SKU col:", skuCol, "| Desc col:", descCol, "| Qty col:", qtyCol);

  const data: Record<string, { qty: number; desc: string }> = {};
  let validRows = 0;

  for (const row of rows) {
    const sku = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const desc = descCol ? String(row[descCol] ?? "").trim() : "";
    const qty = qtyCol
      ? parseFloat(String(row[qtyCol] ?? "0").replace(",", "."))
      : 0;

    if (!sku) continue;

    data[sku] = { qty: isNaN(qty) ? 0 : qty, desc };
    validRows++;
  }

  return {
    data,
    diag: {
      totalRows: rows.length,
      validRows,
      detectedColumns: allCols,
      skuColumn: skuCol,
      qtyColumn: qtyCol,
      descColumn: descCol,
    },
  };
}

// ── Merge ─────────────────────────────────────────────────────────────────────

export function mergeData(
  erpData: Record<string, number>,
  meliData: Record<string, { qty: number; desc: string }>
): ConciliacaoItem[] {
  const allSkus = new Set([...Object.keys(erpData), ...Object.keys(meliData)]);
  const items: ConciliacaoItem[] = [];

  for (const sku of allSkus) {
    const qtdErp = erpData[sku];
    const meliEntry = meliData[sku];
    const qtdMeli = meliEntry?.qty;
    const descricao = meliEntry?.desc;

    let status: ConciliacaoItem["status"];
    if (qtdErp !== undefined && qtdMeli !== undefined) {
      status = qtdErp === qtdMeli ? "ok" : "divergente";
    } else if (qtdErp !== undefined) {
      status = "so_erp";
    } else {
      status = "so_meli";
    }

    items.push({ sku, qtdErp, qtdMeli, descricao, status });
  }

  const order = { divergente: 0, so_erp: 1, so_meli: 2, ok: 3 };
  items.sort((a, b) => order[a.status] - order[b.status]);
  return items;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function emptyDiag(): ParseDiagnostic {
  return { totalRows: 0, validRows: 0, detectedColumns: [], skuColumn: null, qtyColumn: null, descColumn: null };
}
