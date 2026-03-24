/**
 * Parser XLSX/CSV para conciliação ERP × MeLi
 *
 * Detecção de header robusta:
 * - Lê arquivo como array bruto
 * - Pontua cada linha por keywords ESPECÍFICAS (>= 4 chars, sem "id" genérico)
 * - Penaliza linhas que parecem dados (muitos números, códigos de produto)
 * - Usa a linha com maior score como header
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

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findCol(obj: Record<string, unknown>, ...keywords: string[]): string | null {
  for (const kw of keywords) {
    const found = Object.keys(obj).find((k) => norm(k).includes(norm(kw)));
    if (found !== undefined) return found;
  }
  return null;
}

// ── Detecção de linha de header ───────────────────────────────────────────────

/** Retorna true se a célula parece um VALOR de dado, não um nome de coluna */
function looksLikeData(cell: unknown): boolean {
  const s = String(cell ?? "").trim();
  if (!s) return false;

  // Número puro (ex: 289364, 0, 2) → dado
  if (/^\d{1,20}$/.test(s)) return true;

  // Código de produto: letras+números longos, ex: CDID51174, MLB1234567890
  if (/^[A-Za-z]{1,5}\d{4,}$/.test(s)) return true;

  // EAN/barcode: só dígitos longos
  if (/^\d{8,20}$/.test(s)) return true;

  // Texto muito longo (descrição de produto) — improvável como nome de coluna
  if (s.length > 60) return true;

  return false;
}

/**
 * Pontua uma linha segundo sua probabilidade de ser um header.
 * Penaliza células que parecem dados.
 */
function scoreHeaderRow(row: unknown[], keywords: string[]): number {
  if (!row || row.length === 0) return -999;

  let kwMatches = 0;
  let dataLikeCells = 0;
  let emptyCells = 0;
  const totalCells = row.length;

  for (const cell of row) {
    const s = String(cell ?? "").trim();
    if (!s) { emptyCells++; continue; }

    if (looksLikeData(cell)) {
      dataLikeCells++;
      continue; // não testa keywords em células que parecem dados
    }

    const n = norm(cell);
    for (const kw of keywords) {
      if (n.includes(norm(kw))) {
        kwMatches++;
        break; // conta no máximo 1 por célula
      }
    }
  }

  const filledCells = totalCells - emptyCells;
  if (filledCells === 0) return -999;

  // Score: keyword matches, penalizado por proporção de células que parecem dados
  const dataRatio = dataLikeCells / filledCells;
  const score = kwMatches - (dataRatio * 10);

  return score;
}

function detectHeaderRow(rows: unknown[][], keywords: string[], maxScan = 20): number {
  let bestRow = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const s = scoreHeaderRow(rows[i], keywords);
    console.log(`[detectHeader] linha ${i + 1} score=${s.toFixed(2)}`, rows[i]?.slice(0, 5));
    if (s > bestScore) {
      bestScore = s;
      bestRow = i;
    }
  }

  // Fallback: se o melhor score ainda é <= 0, tenta linha 0 ou 1
  if (bestScore <= 0) {
    console.warn("[detectHeader] Score baixo, tentando linha 1 ou 2 como fallback");
    // Prefere linha com mais células não-numéricas
    const scores = [0, 1].map((i) => {
      const row = rows[i] ?? [];
      const textCells = row.filter((c) => !looksLikeData(c) && String(c ?? "").trim()).length;
      return textCells;
    });
    bestRow = scores[0] >= scores[1] ? 0 : 1;
  }

  return bestRow;
}

function rawToObjects(rows: unknown[][], headerIdx: number): Record<string, unknown>[] {
  const rawHeaders = rows[headerIdx] ?? [];
  // Garante unicidade de keys (colunas duplicadas ficam com sufixo)
  const seen: Record<string, number> = {};
  const headers = rawHeaders.map((h) => {
    const key = String(h ?? "").trim() || `__col`;
    const count = seen[key] ?? 0;
    seen[key] = count + 1;
    return count === 0 ? key : `${key}_${count}`;
  });

  const result: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === "" || c === null || c === undefined)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
    result.push(obj);
  }
  return result;
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
        reject(new Error("Não foi possível abrir o arquivo. Verifique se não está protegido."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
    reader.readAsBinaryString(file);
  });
}

async function fileToRawRows(file: File): Promise<unknown[][]> {
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
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
}

// ── Helper tamanho (Space) ────────────────────────────────────────────────────

function extractSize(s: string): string {
  const m = s.match(
    /\b(PP|P|M|G|GG|XGG|XS|XL|XXL|S|L|\d{2,3}(?:[.,]\d)?(?:\s*(?:cm|ml|L|kg|g|KG))?)\b/i
  );
  return m ? m[1].toUpperCase() : "";
}

// ── ERP Parser (Space / VTEX) ─────────────────────────────────────────────────

// Keywords específicas para ERP — sem "id", "cod" (muito genéricos)
const ERP_HEADER_KEYWORDS = [
  "nome", "produto", "descricao", "descri",
  "sku", "refid", "ref id",
  "estoque", "saldo", "disponivel", "quantidade total",
];

export async function parseErpXlsx(
  file: File
): Promise<{ data: Record<string, number>; diag: ParseDiagnostic }> {
  const raw = await fileToRawRows(file);

  if (raw.length === 0) return { data: {}, diag: emptyDiag() };

  const headerIdx = detectHeaderRow(raw, ERP_HEADER_KEYWORDS);
  const rows = rawToObjects(raw, headerIdx);

  console.log(`[ERP Parser] Arquivo: ${file.name} | Header linha ${headerIdx + 1}`);
  console.log(`[ERP Parser] Colunas:`, Object.keys(rows[0] ?? {}));

  if (rows.length === 0) return { data: {}, diag: emptyDiag() };

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  const skuCol = findCol(firstRow,
    "sku", "refid", "ref id", "ref.", "referencia", "codigo", "cód",
    "cod.", "id produto", "id sku"
  );
  const nomeCol = findCol(firstRow,
    "nome", "produto", "descricao", "titulo", "name", "product"
  );
  const qtyCol = findCol(firstRow,
    "estoque", "saldo", "disponivel", "quantidade", "total", "stock", "qty", "qtd"
  );

  console.log(`[ERP Parser] SKU="${skuCol}" | Nome="${nomeCol}" | Qty="${qtyCol}"`);

  const data: Record<string, number> = {};
  let validRows = 0;

  for (const row of rows) {
    const skuRaw = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const nome = nomeCol ? String(row[nomeCol] ?? "").trim() : "";
    const qty = qtyCol ? parseFloat(String(row[qtyCol] ?? "0").replace(",", ".")) : 0;

    if (!skuRaw) continue;

    const size = nome ? extractSize(nome) : extractSize(skuRaw);
    const base = skuRaw.replace(/[-_]?\d+$/, "").replace(/\s+/g, " ").trim();
    const sku = size && !base.toUpperCase().includes(size) ? `${base} ${size}` : skuRaw;

    data[sku] = (data[sku] ?? 0) + (isNaN(qty) ? 0 : qty);
    validRows++;
  }

  console.log(`[ERP Parser] ✓ ${validRows} itens extraídos`);

  return {
    data,
    diag: { totalRows: raw.length, validRows, headerRowIndex: headerIdx, detectedColumns: allCols, skuColumn: skuCol, qtyColumn: qtyCol, descColumn: nomeCol },
  };
}

// ── MeLi Parser ───────────────────────────────────────────────────────────────

// Keywords específicas MeLi — termos completos, não substrings genéricas
const MELI_HEADER_KEYWORDS = [
  // SKU
  "sku do vendedor", "seller sku", "sku vendedor", "sku",
  // Título
  "titulo do anuncio", "titulo", "title",
  // Quantidade
  "quantidade disponivel", "estoque disponivel", "disponivel", "quantidade",
  // Outros campos típicos do export MeLi
  "status", "preco", "variacao", "categoria", "anuncio",
];

export async function parseMeliXlsx(
  file: File
): Promise<{ data: Record<string, { qty: number; desc: string }>; diag: ParseDiagnostic }> {
  const raw = await fileToRawRows(file);

  if (raw.length === 0) return { data: {}, diag: emptyDiag() };

  const headerIdx = detectHeaderRow(raw, MELI_HEADER_KEYWORDS);
  const rows = rawToObjects(raw, headerIdx);

  console.log(`[MeLi Parser] Arquivo: ${file.name} | Header linha ${headerIdx + 1}`);
  console.log(`[MeLi Parser] Colunas detectadas:`, Object.keys(rows[0] ?? {}));

  if (rows.length === 0) return { data: {}, diag: emptyDiag() };

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  const skuCol = findCol(firstRow,
    "sku do vendedor", "seller sku", "sku vendedor", "sku", "referencia", "codigo"
  );
  const descCol = findCol(firstRow,
    "titulo do anuncio", "titulo", "title", "nome", "descricao", "anuncio"
  );
  const qtyCol = findCol(firstRow,
    "quantidade disponivel", "estoque disponivel", "disponivel",
    "quantidade", "estoque", "stock", "qty", "saldo"
  );

  console.log(`[MeLi Parser] SKU="${skuCol}" | Desc="${descCol}" | Qty="${qtyCol}"`);

  const data: Record<string, { qty: number; desc: string }> = {};
  let validRows = 0;

  for (const row of rows) {
    const sku = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const desc = descCol ? String(row[descCol] ?? "").trim() : "";
    const qty = qtyCol ? parseFloat(String(row[qtyCol] ?? "0").replace(",", ".")) : 0;

    if (!sku) continue;

    data[sku] = { qty: isNaN(qty) ? 0 : qty, desc };
    validRows++;
  }

  console.log(`[MeLi Parser] ✓ ${validRows} itens extraídos`);

  return {
    data,
    diag: { totalRows: raw.length, validRows, headerRowIndex: headerIdx, detectedColumns: allCols, skuColumn: skuCol, qtyColumn: qtyCol, descColumn: descCol },
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
  return { totalRows: 0, validRows: 0, headerRowIndex: 0, detectedColumns: [], skuColumn: null, qtyColumn: null, descColumn: null };
}
