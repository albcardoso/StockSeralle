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

/**
 * Valida que a coluna detectada contém valores numéricos (não booleanos/texto).
 * Evita falsos positivos como "Mostrar quando estiver fora de estoque" (True/False).
 */
function findNumericCol(rows: Record<string, unknown>[], ...keywords: string[]): string | null {
  if (rows.length === 0) return null;
  const candidate = findCol(rows[0], ...keywords);
  if (!candidate) return null;
  for (const row of rows.slice(0, 10)) {
    const v = String(row[candidate] ?? "").trim().toLowerCase();
    if (!v) continue;
    if (v === "true" || v === "false" || v === "sim" || v === "não" || v === "nao") return null;
    if (!isNaN(parseFloat(v.replace(",", ".")))) return candidate;
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

function detectHeaderRow(rows: unknown[][], keywords: string[], maxScan?: number): number {
  const limit = maxScan ?? rows.length;
  let bestRow = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const s = scoreHeaderRow(rows[i], keywords);
    if (s > bestScore) {
      bestScore = s;
      bestRow = i;
    }
  }

  // Se o melhor score é <= 0, o arquivo não tem linha de header reconhecível
  if (bestScore <= 0) return -1;

  return bestRow;
}

function rawToObjects(rows: unknown[][], headerIdx: number, syntheticHeaders?: string[]): Record<string, unknown>[] {
  // headerIdx = -1 → sem linha de header, usa syntheticHeaders ou índices numéricos
  const rawHeaders = headerIdx >= 0 ? (rows[headerIdx] ?? []) : (syntheticHeaders ?? []);
  const dataStartIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

  // Garante unicidade de keys (colunas duplicadas ficam com sufixo)
  const seen: Record<string, number> = {};
  const numCols = headerIdx >= 0
    ? rawHeaders.length
    : (rows[0]?.length ?? 0);

  const headers: string[] = [];
  for (let i = 0; i < numCols; i++) {
    const raw = rawHeaders[i];
    const key = (raw !== undefined && raw !== null && String(raw).trim())
      ? String(raw).trim()
      : `__col${i}`;
    const count = seen[key] ?? 0;
    seen[key] = count + 1;
    headers.push(count === 0 ? key : `${key}_${count}`);
  }

  const result: Record<string, unknown>[] = [];
  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === "" || c === null || c === undefined)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
    result.push(obj);
  }
  return result;
}

// ── Leitura de arquivo ────────────────────────────────────────────────────────

/** Opções de performance: desliga tudo que não usamos nos dados de conciliação */
const XLSX_PERF_OPTS: XLSX.ParsingOptions = {
  cellDates:    false,
  cellFormula:  false,
  cellHTML:     false,
  cellText:     false,
  cellNF:       false,
  cellStyles:   false,
  sheetStubs:   false,
  bookDeps:     false,
  bookFiles:    false,
  bookProps:    false,
  bookSheets:   true,
  bookVBA:      false,
};

/**
 * Retorna true se o workbook tem dados reais (pelo menos 1 linha além do header).
 * Usa o !ref da sheet (rápido, sem parsear todas as células).
 */
function workbookHasData(wb: XLSX.WorkBook): boolean {
  if (!wb.SheetNames.length) return false;
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return false;
  try {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    return range.e.r > 0; // mais de 1 linha
  } catch {
    return false;
  }
}

/**
 * Leitura de workbook com dois modos: array (default) e binary.
 *
 * `binaryFirst: true` — usa BinaryString como modo primário.
 * Necessário para arquivos cujo ZIP tem entradas com "Bad uncompressed size":
 * o caminho array retorna linhas mas com células corrompidas; o binary contorna
 * o mesmo bug e retorna os dados completos.
 *
 * Usado por parseMeliXlsx (arquivos MeLi Full têm esse problema no xlsx@0.18.5).
 */
function readWorkbook(file: File, opts?: { binaryFirst?: boolean }): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const tryArrayBuffer = () =>
      new Promise<XLSX.WorkBook>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            res(XLSX.read(data, { ...XLSX_PERF_OPTS, type: "array" }));
          } catch (err) { rej(err); }
        };
        reader.onerror = () => rej(new Error("Erro ao ler o arquivo"));
        reader.readAsArrayBuffer(file);
      });

    const tryBinaryString = () =>
      new Promise<XLSX.WorkBook>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            res(XLSX.read(e.target?.result as string, { ...XLSX_PERF_OPTS, type: "binary" }));
          } catch (err) { rej(err); }
        };
        reader.onerror = () => rej(new Error("Erro ao ler o arquivo"));
        reader.readAsBinaryString(file);
      });

    const primary   = opts?.binaryFirst ? tryBinaryString : tryArrayBuffer;
    const secondary = opts?.binaryFirst ? tryArrayBuffer  : tryBinaryString;

    primary()
      .then((wb) => {
        if (!workbookHasData(wb)) {
          console.warn("[readWorkbook] modo primário retornou sheet vazia — tentando fallback");
          return secondary().catch(() => wb);
        }
        return wb;
      })
      .catch(() => secondary())
      .then(resolve)
      .catch(() => reject(new Error("Não foi possível abrir o arquivo. Verifique se não está protegido.")));
  });
}

/**
 * Faz o parsing de um arquivo XLSX em um Web Worker (thread separada).
 *
 * Fluxo:
 *  1. Lê o arquivo como ArrayBuffer na thread principal (rápido, não bloqueia)
 *  2. Transfere o buffer (zero-copy) para o worker — UI continua responsiva
 *  3. Worker parseia com XLSX + opções de performance (sem estilos/fórmulas)
 *  4. Se o worker retornar vazio (bug "Bad uncompressed size" do xlsx@0.18.5),
 *     lê o arquivo novamente como BinaryString e reenvia para o worker
 */
function parseXlsxViaWorker(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    // Cria worker — webpack/Next.js bundla automaticamente com o padrão new URL
    const worker = new Worker(
      new URL("../workers/xlsx.worker.ts", import.meta.url)
    );

    let settled = false;
    const done = (rows: unknown[][]) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(rows);
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error(msg));
    };

    // Leitura como BinaryString (fallback para bug de ZIP do xlsx)
    const tryBinary = () => {
      const r2 = new FileReader();
      r2.onload = (ev) => {
        worker.postMessage({ type: "binary", binary: ev.target?.result as string });
      };
      r2.onerror = () => fail("Erro ao ler arquivo (binary)");
      r2.readAsBinaryString(file);
    };

    worker.onmessage = (e) => {
      const msg = e.data as
        | { ok: true; rows: unknown[][]; empty: boolean }
        | { ok: false; error: string };

      if (!msg.ok) {
        // Worker lançou exceção → tenta binary antes de desistir
        tryBinary();
        return;
      }
      if (msg.empty) {
        // Workbook vazio = bug de ZIP interno do xlsx — usa binary
        console.warn("[xlsx-worker] ArrayBuffer vazio — tentando BinaryString");
        tryBinary();
        return;
      }
      done(msg.rows);
    };

    worker.onerror = () => fail("Erro inesperado no worker de parsing");

    // Leitura como ArrayBuffer (tentativa principal)
    const r1 = new FileReader();
    r1.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      worker.postMessage({ type: "array", buffer: buf }, [buf]); // transferível
    };
    r1.onerror = () => fail("Erro ao ler arquivo");
    r1.readAsArrayBuffer(file);
  });
}

async function fileToRawRows(file: File): Promise<unknown[][]> {
  const lower = file.name.toLowerCase();

  // CSV: rápido, não precisa de worker
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    const sep = text.includes(";") ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS: sep });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  }

  // XLSX/XLS: usa worker para não bloquear a UI
  return parseXlsxViaWorker(file);
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
  if (headerIdx === -1) {
    console.error(`[ERP Parser] Nenhum header encontrado em ${file.name}`);
    return { data: {}, diag: emptyDiag() };
  }
  const rows = rawToObjects(raw, headerIdx);

  if (rows.length === 0) return { data: {}, diag: emptyDiag() };

  const firstRow = rows[0];
  const allCols = Object.keys(firstRow);

  // Prioridades VTEX: "Código de referência do SKU" (col28) > "ID do SKU" (col23)
  // Prioridades Space/ERP: "codproduto" / "refid"
  // "referencia do sku" primeiro para não capturar "referencia do produto" (col21 do VTEX)
  const skuCol = findCol(firstRow,
    "codproduto",
    "referencia do sku",   // VTEX: "Código de referência do SKU"
    "cod ref sku", "ref do sku", "codigo de referencia do sku",
    "sku", "refid", "ref id",
    "referencia", "codigo", "cód", "cod.", "id produto", "id sku"
  );
  const nomeCol = findCol(firstRow,
    "nome", "produto", "descricao", "titulo", "name", "product"
  );
  const qtyCol = findNumericCol(rows,
    "estoque", "saldo", "disponivel", "quantidade", "total", "stock", "qty", "qtd"
  );
  // Coluna "SKU ativo" usada como fallback quando não há coluna de estoque (ex: export catálogo VTEX)
  const skuAtivoCol = !qtyCol ? findCol(firstRow, "sku ativo", "ativo", "active") : null;
  // Filial: MVP HTML filtra apenas filial '98' (Sampa Full)
  const filialCol = findCol(firstRow, "filial", "loja", "cod_filial", "codfilial");

  if (!qtyCol) {
    console.warn(`[ERP Parser] Coluna de estoque não encontrada em ${file.name}. Usando qty=1 para cada SKU ativo.`);
  }

  const data: Record<string, number> = {};
  let validRows = 0;

  for (const row of rows) {
    // Filtro de filial (igual ao MVP HTML: só filial 98)
    if (filialCol) {
      const filial = String(row[filialCol] ?? "");
      if (!filial.includes("98")) continue;
    }

    const skuRaw = skuCol ? String(row[skuCol] ?? "").trim() : "";
    if (!skuRaw || skuRaw === "CODPRODUTO") continue;

    let qty: number;
    if (qtyCol) {
      qty = parseFloat(String(row[qtyCol] ?? "0").replace(",", "."));
      if (isNaN(qty)) qty = 0;
    } else if (skuAtivoCol) {
      // Export catálogo VTEX: "SKU ativo" = True → qty 1, False → qty 0
      const ativo = String(row[skuAtivoCol] ?? "").trim().toLowerCase();
      qty = (ativo === "true" || ativo === "sim" || ativo === "1") ? 1 : 0;
    } else {
      qty = 1; // fallback: SKU existe no catálogo
    }

    data[skuRaw] = (data[skuRaw] ?? 0) + qty;
    validRows++;
  }

  console.log(`[ERP Parser] ✓ ${validRows} itens`);

  return {
    data,
    diag: { totalRows: raw.length, validRows, headerRowIndex: headerIdx, detectedColumns: allCols, skuColumn: skuCol, qtyColumn: qtyCol, descColumn: nomeCol },
  };
}

// ── MeLi Parser ───────────────────────────────────────────────────────────────

/**
 * Colunas fixas do export "ML FULL" (Gerenciador de Anúncios MeLi BR).
 *
 * Estrutura real confirmada com openpyxl no arquivo ML FULL.xlsx:
 *   - Linha 9  (0-indexed) = header principal
 *   - Linha 10 = sub-header (col16="Aptas para venda", col17="Não aptas", ...)
 *   - Linha 11 = sub-sub-header
 *   - Linha 12 = primeiro dado
 *
 * col16 = "Aptas para venda"          → sub-coluna de "Unidades no Full"  (sum=1.326 no arquivo real)
 * col21 = "Unidades que ocupam espaço em Full" → total físico na prateleira (sum=3.271)
 *
 * Usamos col16 pois representa as unidades efetivamente disponíveis para venda.
 * A detecção é feita dinamicamente; APTAS_COL é apenas fallback.
 */
const MELI_FIXED = {
  DATA_START_ROW: 12, // Pula 12 linhas de header/instrução
  SKU_COL:         3, // "SKU do Vendedor" (col3)
  TITULO_COL:      6, // "Produto / Título do Anúncio" (col6)
  STATUS_COL:      9, // "Status do Anúncio" (col9)
  APTAS_COL:      16, // "Aptas para venda" (col16, sub-header row10) — fallback se detecção falhar
  CODIGO_ML_COL:   1, // "Código ML" (col1)
  MLB_COL:         4, // "# Anúncio MLB" (col4)
} as const;

// Keywords para tentar detectar header automaticamente (formato alternativo)
const MELI_HEADER_KEYWORDS = [
  "sku do vendedor", "seller sku", "sku vendedor",
  "titulo do anuncio", "titulo", "aptas para venda", "aptas",
  "quantidade disponivel", "disponivel", "quantidade",
  "status", "variacao", "categoria",
];

/**
 * Detecta dinamicamente a coluna "Aptas para venda" nas primeiras N linhas do Resumo.
 * O arquivo ML Full tem header de 3 linhas (9, 10, 11) — "Aptas para venda" fica no
 * row 10 (0-indexed), col 16. Mas MeLi pode mudar o layout; a detecção é mais robusta.
 *
 * Retorna o índice de coluna (0-indexed) ou o fallback hardcoded se não encontrar.
 */
function detectMeliAptasCol(raw: unknown[][]): number {
  for (let r = 0; r < Math.min(raw.length, MELI_FIXED.DATA_START_ROW); r++) {
    const row = raw[r] as unknown[];
    for (let c = 0; c < row.length; c++) {
      const v = norm(String(row[c] ?? ""));
      if (v.includes("aptas para venda") || v.includes("aptas para vender") || v === "aptas") {
        return c;
      }
    }
  }
  return MELI_FIXED.APTAS_COL; // fallback
}

export async function parseMeliXlsx(
  file: File
): Promise<{ data: Record<string, { qty: number; desc: string }>; diag: ParseDiagnostic }> {
  // binaryFirst: true — arquivos MeLi Full têm "Bad uncompressed size" no xlsx@0.18.5
  // O modo array retorna linhas mas com células de quantidade corrompidas/ausentes.
  // O modo binary lê o ZIP por um caminho diferente e retorna os dados corretos.
  const wb = await readWorkbook(file, { binaryFirst: true });

  // Prioriza aba 'Resumo' (formato ML Full), igual ao MVP HTML original
  const sheetName = wb.SheetNames.includes("Resumo")
    ? "Resumo"
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  if (raw.length === 0) return { data: {}, diag: emptyDiag() };

  console.log(`[MeLi Parser] ${file.name} | aba="${sheetName}" | ${raw.length} linhas`);

  // Tenta detectar header automático — escaneia só as primeiras 15 linhas
  // (o bloco de header do ML Full nunca ultrapassa a linha 12)
  const headerIdx = detectHeaderRow(raw, MELI_HEADER_KEYWORDS, 15);

  const data: Record<string, { qty: number; desc: string }> = {};
  let validRows = 0;

  // Verifica se o auto-detect encontrou um header ÚTIL (com SKU)
  // O MeLi FULL tem header de 2 linhas com células mescladas → col 3 (SKU) fica vazia no header
  // Só usa auto-detect se o SKU for detectável por nome; senão, usa hardcoded
  let useHardcoded = (headerIdx < 0);

  if (headerIdx >= 0) {
    // ── Modo automático: header detectado, valida se SKU foi encontrado ──────
    const rows = rawToObjects(raw, headerIdx);
    const firstRow = rows[0] ?? {};
    const allCols = Object.keys(firstRow);

    const skuCol = findCol(firstRow,
      "sku do vendedor", "seller sku", "sku vendedor", "sku vendedor", "referencia do vendedor"
    );
    const descCol = findCol(firstRow,
      "titulo do anuncio", "titulo", "title", "nome", "descricao"
    );
    const qtyCol = findCol(firstRow,
      "aptas para venda", "aptas", "quantidade disponivel", "estoque disponivel",
      "disponivel", "quantidade", "estoque", "stock", "qty"
    );
    if (!skuCol) {
      useHardcoded = true;
    } else {
      for (const row of rows) {
        const sku = skuCol ? String(row[skuCol] ?? "").trim() : "";
        if (!sku || sku === "nan") continue;
        const desc = descCol ? String(row[descCol] ?? "").trim() : "";
        const qty = qtyCol ? parseFloat(String(row[qtyCol] ?? "0").replace(",", ".")) : 0;
        data[sku] = { qty: isNaN(qty) ? 0 : qty, desc };
        validRows++;
      }

      const diagCols = Object.keys(rows[0] ?? {});
      return {
        data,
        diag: { totalRows: raw.length, validRows, headerRowIndex: headerIdx, detectedColumns: diagCols, skuColumn: skuCol, qtyColumn: qtyCol, descColumn: descCol },
      };
    }
  }

  if (useHardcoded) {
    // ── Modo hardcoded: formato ML Full ──────────────────────────────────────
    // Detecta coluna "Aptas para venda" dinamicamente pelo texto do header.
    // Fallback: MELI_FIXED.APTAS_COL (col16 confirmado no arquivo real).
    const { DATA_START_ROW, SKU_COL, TITULO_COL } = MELI_FIXED;
    const aptasCol = detectMeliAptasCol(raw);

    console.log(`[MeLi Parser] aptasCol detectado = col${aptasCol} (fallback hardcoded = col${MELI_FIXED.APTAS_COL})`);

    for (let i = DATA_START_ROW; i < raw.length; i++) {
      const row = raw[i];
      const sku = String(row[SKU_COL] ?? "").trim();
      if (!sku || sku === "nan") continue;
      const desc = String(row[TITULO_COL] ?? "").trim();
      const qty  = parseFloat(String(row[aptasCol] ?? "0").replace(",", "."));
      data[sku] = { qty: isNaN(qty) ? 0 : qty, desc };
      validRows++;
    }

    console.log(`[MeLi Parser] ✓ ${validRows} itens`);
    return {
      data,
      diag: {
        totalRows: raw.length, validRows, headerRowIndex: -1,
        detectedColumns: [`SKU=col${SKU_COL}`, `Titulo=col${TITULO_COL}`, `Aptas=col${aptasCol}`],
        skuColumn: `col${SKU_COL}`, qtyColumn: `col${aptasCol}`, descColumn: `col${TITULO_COL}`,
      },
    };
  }

  // Nunca chega aqui, mas necessário para o TypeScript
  return { data: {}, diag: emptyDiag() };
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
