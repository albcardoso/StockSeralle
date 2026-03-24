/**
 * Parser XLSX/CSV para conciliação ERP × MeLi
 *
 * Estratégia robusta:
 * 1. Lê todas as linhas como array bruto (sem assumir header na linha 1)
 * 2. Varre as primeiras linhas para encontrar a linha de cabeçalho real
 *    (identifica pela presença de palavras-chave conhecidas nas células)
 * 3. Usa essa linha como header e parseia os dados abaixo
 *
 * Isso resolve o caso de arquivos VTEX e MeLi que têm linhas de instrução
 * ou células mescladas antes do cabeçalho real.
 */

import * as XLSX from "xlsx";
import type { ConciliacaoItem } from "@/types";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ParseDiagnostic {
  totalRows: number;
  validRows: number;
  headerRowIndex: number;
  detectedColumns: string[];
  skuColumn: string | null;
  qtyColumn: string | null;
  descColumn: string | null;
}

// ── Normalização ──────────────────────────────────────────────────────────────

/** Remove acentos, lowercase e trim */
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Verifica se uma string normalizada contém alguma das keywords */
function matches(value: unknown, ...keywords: string[]): boolean {
  const n = norm(value);
  return keywords.some((kw) => n.includes(norm(kw)));
}

/** Encontra a chave do objeto cujo nome normalizado contém alguma keyword */
function findCol(obj: Record<string, unknown>, ...keywords: string[]): string | null {
  for (const kw of keywords) {
    const found = Object.keys(obj).find((k) => norm(k).includes(norm(kw)));
    if (found !== undefined) return found;
  }
  return null;
}

// ── Leitura de arquivo ────────────────────────────────────────────────────────

function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary", cellDates: true });
        resolve(wb);
      } catch (err) {
        reject(new Error("Não foi possível abrir o arquivo. Verifique se não está protegido por senha."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
    reader.readAsBinaryString(file);
  });
}

/**
 * Lê o arquivo e retorna linhas brutas como arrays de strings (sem assumir header).
 * Para CSV detecta separador automático.
 */
async function fileToRawRows(file: File): Promise<{ raw: unknown[][]; wb: XLSX.WorkBook }> {
  const lower = file.name.toLowerCase();
  let wb: XLSX.WorkBook;

  if (lower.endsWith(".csv")) {
    const text = await file.text();
    const sep = text.includes(";") ? ";" : ",";
    wb = XLSX.read(text, { type: "string", FS: sep });
  } else {
    wb = await readWorkbook(file);
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  // header: 1 → retorna array de arrays (sem interpretar header)
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return { raw, wb };
}

/**
 * Varre as primeiras N linhas para encontrar aquela que contém
 * a maior quantidade de palavras-chave conhecidas — essa é o header real.
 * Retorna o índice da linha de cabeçalho encontrada.
 */
function detectHeaderRow(
  rows: unknown[][],
  keywords: string[],
  maxScan = 15
): number {
  let bestRow = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i];
    let score = 0;
    for (const cell of row) {
      if (keywords.some((kw) => matches(cell, kw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
}

/**
 * Converte o array bruto em array de objetos usando a linha `headerIdx` como chave.
 */
function rawToObjects(
  rows: unknown[][],
  headerIdx: number
): Record<string, unknown>[] {
  const headers = rows[headerIdx].map((h) => String(h ?? "").trim());
  const result: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    // Pula linhas completamente vazias
    if (row.every((cell) => cell === "" || cell === null || cell === undefined)) continue;

    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h || `__col_${idx}`] = row[idx] ?? "";
    });
    result.push(obj);
  }

  return result;
}

// ── Helper tamanho (Space) ────────────────────────────────────────────────────

function extractSize(s: string): string {
  const m = s.match(
    /\b(PP|P|M|G|GG|XGG|XS|XL|XXL|S|L|\d{2,3}(?:[.,]\d)?(?:\s*(?:cm|ml|L|kg|g|KG))?)\b/i
  );
  return m ? m[1].toUpperCase() : "";
}

// ── ERP Parser (Space / VTEX) ─────────────────────────────────────────────────

// Keywords para detectar linha de header do ERP
const ERP_HEADER_KEYWORDS = [
  "sku", "ref", "refid", "codigo", "cod", "id",
  "nome", "produto", "descricao",
  "estoque", "saldo", "qtd", "quantidade", "disponivel", "total",
];

export async function parseErpXlsx(
  file: File
): Promise<{ data: Record<string, number>; diag: ParseDiagnostic }> {
  const { raw } = await fileToRawRows(file);

  if (raw.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const headerIdx = detectHeaderRow(raw, ERP_HEADER_KEYWORDS);
  const rows = rawToObjects(raw, headerIdx);

  console.log(`[ERP Parser] Arquivo: ${file.name}`);
  console.log(`[ERP Parser] Header detectado na linha ${headerIdx + 1}:`, raw[headerIdx]);
  console.log(`[ERP Parser] Total de linhas de dados: ${rows.length}`);

  if (rows.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  // Detecta colunas de SKU, nome e estoque
  const skuCol = findCol(firstRow,
    "sku", "refid", "ref id", "ref ", "codigo", "cód", "cod ", "referencia",
    "id produto", "id_produto", "product id"
  );
  const nomeCol = findCol(firstRow,
    "nome", "produto", "descricao", "descri", "titulo", "name", "product"
  );
  const qtyCol = findCol(firstRow,
    "estoque", "saldo", "disponivel", "qtd ", "quantidade", "total",
    "stock", "inventory", "qty"
  );

  console.log(`[ERP Parser] SKU col: "${skuCol}" | Nome col: "${nomeCol}" | Qty col: "${qtyCol}"`);
  console.log("[ERP Parser] Todas as colunas:", allCols);

  const data: Record<string, number> = {};
  let validRows = 0;

  for (const row of rows) {
    const skuRaw = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const nome = nomeCol ? String(row[nomeCol] ?? "").trim() : "";
    const qty = qtyCol
      ? parseFloat(String(row[qtyCol] ?? "0").replace(",", "."))
      : 0;

    if (!skuRaw) continue;

    // Tenta normalizar SKU com tamanho (padrão Space)
    const size = nome ? extractSize(nome) : extractSize(skuRaw);
    const base = skuRaw.replace(/[-_]?\d+$/, "").replace(/\s+/g, " ").trim();
    const sku = size && !base.toUpperCase().includes(size) ? `${base} ${size}` : skuRaw;

    data[sku] = (data[sku] ?? 0) + (isNaN(qty) ? 0 : qty);
    validRows++;
  }

  console.log(`[ERP Parser] ✓ ${validRows} itens extraídos`);

  return {
    data,
    diag: {
      totalRows: raw.length,
      validRows,
      headerRowIndex: headerIdx,
      detectedColumns: allCols,
      skuColumn: skuCol,
      qtyColumn: qtyCol,
      descColumn: nomeCol,
    },
  };
}

// ── MeLi Parser ───────────────────────────────────────────────────────────────

// Keywords para detectar linha de header do MeLi
const MELI_HEADER_KEYWORDS = [
  "sku", "vendedor", "seller", "anuncio", "titulo", "title",
  "quantidade", "disponivel", "stock", "estoque", "preco", "status",
  "id", "mlb", "cod",
];

export async function parseMeliXlsx(
  file: File
): Promise<{ data: Record<string, { qty: number; desc: string }>; diag: ParseDiagnostic }> {
  const { raw } = await fileToRawRows(file);

  if (raw.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const headerIdx = detectHeaderRow(raw, MELI_HEADER_KEYWORDS);
  const rows = rawToObjects(raw, headerIdx);

  console.log(`[MeLi Parser] Arquivo: ${file.name}`);
  console.log(`[MeLi Parser] Header detectado na linha ${headerIdx + 1}:`, raw[headerIdx]);
  console.log(`[MeLi Parser] Total de linhas de dados: ${rows.length}`);

  if (rows.length === 0) {
    return { data: {}, diag: emptyDiag() };
  }

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  // MeLi BR: "SKU do vendedor", "Código do anúncio", "Título do anúncio", "Quantidade disponível"
  const skuCol = findCol(firstRow,
    "sku do vendedor", "seller sku", "sku vendedor",
    "sku", "cod", "referencia", "codigo", "ref"
  );
  const descCol = findCol(firstRow,
    "titulo do anuncio", "titulo", "title", "nome", "descricao", "produto", "anuncio"
  );
  const qtyCol = findCol(firstRow,
    "quantidade disponivel", "disponivel", "quantidade",
    "estoque", "stock", "qty", "available", "saldo"
  );

  console.log(`[MeLi Parser] SKU col: "${skuCol}" | Desc col: "${descCol}" | Qty col: "${qtyCol}"`);
  console.log("[MeLi Parser] Todas as colunas:", allCols);

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

  console.log(`[MeLi Parser] ✓ ${validRows} itens extraídos`);

  return {
    data,
    diag: {
      totalRows: raw.length,
      validRows,
      headerRowIndex: headerIdx,
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
  return {
    totalRows: 0, validRows: 0, headerRowIndex: 0,
    detectedColumns: [], skuColumn: null, qtyColumn: null, descColumn: null,
  };
}
