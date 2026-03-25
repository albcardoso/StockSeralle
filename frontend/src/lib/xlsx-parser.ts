/**
 * Parser XLSX/CSV para conciliação Space (ERP) × VTEX (mapeamento) × MeLi
 *
 * Abordagem idêntica ao MVP HTML original:
 *   XLSX.read(data, { type: 'array' }) — sem nenhuma opção extra.
 * Roda na thread principal (sem Web Worker) — compatível com qualquer ambiente.
 *
 * Fontes e colunas fixas (índices 0-based):
 *   Space CSV  → CODPRODUTO + ESTOQUE_DISPONIVEL (filtra filial=98)
 *   VTEX XLSX  → col21 (cod_produto) + col24 (nome_sku) + col28 (SKU), linhas 2+
 *   MeLi XLSX  → aba "Resumo", col3 (SKU) + col6 (título) + col16 (aptas p/venda), linha 12+
 *
 * Join:  MeLi.sku → vtexMap[sku].cod_produto → spaceErp[cod_produto] = estoque
 */

import * as XLSX from "xlsx";
import type { ConciliacaoItem } from "@/types";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface ParseDiagnostic {
  totalRows: number;
  validRows: number;
  headerRowIndex: number;
  detectedColumns: string[];
  skuColumn: string | null;
  qtyColumn: string | null;
  descColumn: string | null;
}

export interface VtexEntry {
  cod_produto: string;
  nome_sku: string;
}

// ── Opções de performance para arquivos grandes ────────────────────────────────

/**
 * Opções de performance do SheetJS — reduzem uso de memória em ~60-70% para
 * arquivos grandes como o VTEX (268MB de XML descomprimido, 142 mil linhas).
 *
 * Desativam campos computados que NÃO SÃO NECESSÁRIOS para extração de dados:
 *   cellHTML   — versão HTML de cada célula (dobra memória para células de texto longo)
 *   cellText   — texto formatado de cada número
 *   cellFormula — strings de fórmula (nenhum desses arquivos tem fórmulas)
 *   cellNF     — string de formato de número
 *   cellStyles — objeto de estilo CSS
 *
 * IMPORTANTE: bookSheets OMITIDO (= false por padrão).
 *   bookSheets: true  → lê APENAS nomes de abas, ignora dados das células
 *   bookSheets: false → lê os dados normalmente ← queremos isso
 */
const PERF_OPTS: XLSX.ParsingOptions = {
  cellFormula: false,
  cellHTML:    false,
  cellText:    false,
  cellNF:      false,
  cellStyles:  false,
  sheetStubs:  false,
  bookDeps:    false,
  bookFiles:   false,
  bookProps:   false,
  bookVBA:     false,
  // bookSheets OMITIDO → false → lê dados das células
};

// ── Leitura de arquivo XLSX ────────────────────────────────────────────────────

/**
 * Retorna true se o workbook contém ao menos uma sheet com dados.
 * Verifica SheetNames, Sheets E a presença de !ref (indicador de range não vazio).
 */
function workbookIsUsable(wb: XLSX.WorkBook): boolean {
  if (!wb?.SheetNames?.length || !wb.Sheets) return false;
  const ws = wb.Sheets[wb.SheetNames[0]];
  // !ref ausente = sheet vazia (comum quando ZIP tem "Bad uncompressed size")
  return !!(ws && ws["!ref"]);
}

/**
 * Lê um arquivo como WorkBook XLSX.
 *
 * Modo primário: ArrayBuffer com PERF_OPTS (reduz memória ~60%).
 * Fallback: BinaryString — contorna o bug de ZIP "Bad uncompressed size"
 *   que às vezes faz o SheetJS retornar sheet sem dados no modo array.
 *
 * O bug de ZIP é silencioso: não lança exceção, apenas retorna workbook
 * com SheetNames populado mas !ref ausente na sheet. Por isso verificamos
 * workbookIsUsable() em vez de apenas SheetNames.length.
 */
function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const tryArray = (): Promise<XLSX.WorkBook> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => {
          try {
            const data = new Uint8Array(e.target!.result as ArrayBuffer);
            res(XLSX.read(data, { ...PERF_OPTS, type: "array" }));
          } catch (err) {
            rej(err);
          }
        };
        r.onerror = () => rej(new Error("FileReader error"));
        r.readAsArrayBuffer(file);
      });

    const tryBinary = (): Promise<XLSX.WorkBook> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => {
          try {
            res(XLSX.read(e.target!.result as string, { ...PERF_OPTS, type: "binary" }));
          } catch (err) {
            rej(err);
          }
        };
        r.onerror = () => rej(new Error("FileReader error"));
        r.readAsBinaryString(file);
      });

    tryArray()
      .then((wb) => {
        if (!workbookIsUsable(wb)) {
          console.warn(
            "[readWorkbook] ArrayBuffer → sheet vazia/!ref ausente — tentando BinaryString"
          );
          return tryBinary();
        }
        return wb;
      })
      .catch(() => {
        console.warn("[readWorkbook] ArrayBuffer falhou — tentando BinaryString");
        return tryBinary();
      })
      .then((wb) => {
        if (!workbookIsUsable(wb)) {
          // Ambos os modos falharam — arquivo muito grande para o browser (ZIP > 268 MB descomprimido)
          reject(
            new Error(
              `Arquivo muito grande para o browser (ZIP com entrada >268 MB). ` +
              `O servidor Next.js precisa ser reiniciado para ativar a configuração ` +
              `serverExternalPackages. Pare o 'npm run dev', reinicie e tente novamente.`
            )
          );
        } else {
          resolve(wb);
        }
      })
      .catch(() =>
        reject(
          new Error(
            "Não foi possível abrir o arquivo. Verifique se o arquivo não está protegido ou corrompido."
          )
        )
      );
  });
}

// ── Normalização ───────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Encontra a primeira linha que contém pelo menos uma keyword (case-insensitive). */
function findHeaderRow(raw: unknown[][], keywords: string[]): number {
  const kws = keywords.map((k) => norm(k));
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = (raw[i] as unknown[]) ?? [];
    for (const cell of row) {
      const v = norm(String(cell ?? ""));
      if (kws.some((kw) => v.includes(kw))) return i;
    }
  }
  return -1;
}

// ── Space ERP Parser ───────────────────────────────────────────────────────────

/**
 * Parseia export do Space ERP.
 * Filtra apenas filial 98 (Sampa Full).
 * Retorna mapa:  cod_produto → estoque_disponivel
 */
export async function parseSpaceErp(
  file: File
): Promise<{ data: Record<string, number>; diag: ParseDiagnostic }> {
  let raw: unknown[][];

  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    const sep = text.indexOf(";") !== -1 ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS: sep });
    const ws = wb.Sheets?.[wb.SheetNames[0]];
    if (!ws) return { data: {}, diag: emptyDiag() };
    raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  } else {
    const wb = await readWorkbook(file);
    const ws = wb.Sheets?.[wb.SheetNames[0]];
    if (!ws) return { data: {}, diag: emptyDiag() };
    raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  }

  if (raw.length === 0) return { data: {}, diag: emptyDiag() };

  // Detecta linha de header
  const headerIdx = findHeaderRow(raw, ["CODPRODUTO", "COD_PRODUTO", "SKU", "REFID", "CODIGO"]);
  if (headerIdx < 0) {
    console.error("[Space ERP] Nenhum header encontrado");
    return { data: {}, diag: emptyDiag() };
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) =>
    String(h ?? "").trim().toUpperCase()
  );

  const codCol = headers.findIndex(
    (h) =>
      h === "CODPRODUTO" ||
      h === "COD_PRODUTO" ||
      h === "CODIGO DO PRODUTO" ||
      h === "SKU" ||
      h === "REFID" ||
      h.startsWith("CODPRODUTO")
  );
  const estoqueCol = headers.findIndex(
    (h) =>
      h === "ESTOQUE_DISPONIVEL" ||
      h === "ESTOQUE DISPONIVEL" ||
      h === "ESTOQUE" ||
      h === "SALDO" ||
      h.includes("ESTOQUE") ||
      h.includes("SALDO") ||
      h.includes("DISPONIVEL")
  );
  const filialCol = headers.findIndex(
    (h) => h === "FILIAL" || h === "LOJA" || h === "COD_FILIAL" || h === "CODFILIAL"
  );

  if (codCol < 0) {
    console.error("[Space ERP] Coluna CODPRODUTO não encontrada. Headers:", headers.join(", "));
    return { data: {}, diag: { totalRows: raw.length, validRows: 0, headerRowIndex: headerIdx, detectedColumns: headers, skuColumn: null, qtyColumn: null, descColumn: null } };
  }

  const data: Record<string, number> = {};
  let validRows = 0;

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = (raw[i] as unknown[]) ?? [];

    // Filtro filial 98
    if (filialCol >= 0) {
      const filial = String(row[filialCol] ?? "").trim();
      if (!filial.includes("98")) continue;
    }

    const cod = String(row[codCol] ?? "").trim();
    if (!cod || norm(cod) === "codproduto") continue;

    const qty =
      estoqueCol >= 0
        ? parseFloat(String(row[estoqueCol] ?? "0").replace(",", ".")) || 0
        : 1;

    data[cod] = (data[cod] ?? 0) + qty;
    validRows++;
  }

  console.log(`[Space ERP] ✓ ${validRows} itens (filial 98)`);
  return {
    data,
    diag: {
      totalRows: raw.length,
      validRows,
      headerRowIndex: headerIdx,
      detectedColumns: headers,
      skuColumn: codCol >= 0 ? headers[codCol] : null,
      qtyColumn: estoqueCol >= 0 ? headers[estoqueCol] : null,
      descColumn: null,
    },
  };
}

// ── VTEX Mapping Parser ────────────────────────────────────────────────────────

/**
 * Parseia export de catálogo da VTEX — tabela de mapeamento SKU → cod_produto.
 *
 * Estrutura padrão VTEX (colunas 0-indexed, igual ao MVP HTML):
 *   col21 = "Código de referência do produto"  (cod_produto)
 *   col24 = "Nome do SKU"
 *   col28 = "Código de referência do SKU"       (sku do vendedor)
 *
 * Dados a partir da linha índice 2 (linhas 0 e 1 são cabeçalho duplo no VTEX).
 * Se o header for detectado em outra posição, usa os índices encontrados.
 */
/**
 * Tenta parsear o arquivo VTEX via rota de API do servidor (Node.js).
 * O Node.js não tem as limitações de memória do browser para ZIP de 268 MB.
 * Retorna null se a API falhar, para o caller usar o fallback browser.
 */
async function parseVtexViaAPI(
  file: File
): Promise<{ data: Record<string, VtexEntry>; diag: ParseDiagnostic } | null> {
  console.log(`[VTEX API] Enviando ${(file.size / 1024 / 1024).toFixed(1)} MB para /api/parse-vtex...`);

  // Lê o arquivo como ArrayBuffer e envia como raw binary.
  // Mais confiável para arquivos grandes (36 MB) do que FormData multipart.
  let arrayBuf: ArrayBuffer;
  try {
    arrayBuf = await file.arrayBuffer();
  } catch (err) {
    console.warn("[VTEX API] Erro ao ler arquivo:", err);
    return null;
  }

  const controller = new AbortController();
  // 3 minutos: arquivo de 36 MB leva ~55s no Node.js
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  try {
    const resp = await fetch("/api/parse-vtex", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: arrayBuf,
      signal: controller.signal,
    });

    console.log(`[VTEX API] Resposta HTTP ${resp.status}`);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[VTEX API] HTTP ${resp.status}:`, body.slice(0, 200));
      return null;
    }

    const json = (await resp.json()) as {
      data?: Record<string, VtexEntry>;
      totalRows?: number;
      validRows?: number;
      error?: string;
      receivedKB?: number;
    };

    // Log diagnóstico completo — inclui receivedKB para detectar truncamento do body
    console.log(
      `[VTEX API] Servidor respondeu: totalRows=${json.totalRows ?? "?"} validRows=${json.validRows ?? "?"} receivedKB=${json.receivedKB ?? "?"} error=${json.error ?? "nenhum"}`
    );

    if (json.error) {
      console.warn(`[VTEX API] Erro do servidor: "${json.error}" | receivedKB=${json.receivedKB ?? "?"} (enviado: ${(file.size / 1024).toFixed(0)} KB)`);
      return null;
    }

    const data = json.data ?? {};
    const validRows = Object.keys(data).length;
    console.log(`[VTEX Mapping] ✓ ${validRows} SKUs (via servidor Node.js)`);

    return {
      data,
      diag: {
        totalRows:       json.totalRows ?? 0,
        validRows,
        headerRowIndex:  1,
        detectedColumns: ["SKU=col28", "cod_produto=col21", "nome_sku=col24"],
        skuColumn:       "col28",
        qtyColumn:       null,
        descColumn:      "col24",
      },
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[VTEX API] Timeout (180s) — tentando browser");
    } else {
      console.warn("[VTEX API] Fetch falhou:", err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseVtexMapping(
  file: File
): Promise<{ data: Record<string, VtexEntry>; diag: ParseDiagnostic }> {
  // Para arquivos grandes (>2 MB), tenta server-side primeiro.
  // O decompressor ZIP do SheetJS no browser falha silenciosamente em
  // arquivos com entradas ZIP de 268 MB (como o vtex.xlsx de 36 MB).
  if (file.size > 2 * 1024 * 1024) {
    const apiResult = await parseVtexViaAPI(file);
    if (apiResult) return apiResult;
    console.warn("[VTEX Mapping] API falhou — usando fallback browser (pode demorar)");
  }

  // Fallback: parsing no browser (funciona para arquivos pequenos)
  const wb = await readWorkbook(file);

  if (!wb?.SheetNames?.length || !wb.Sheets) {
    console.error("[VTEX Mapping] Workbook inválido — SheetNames ou Sheets ausente");
    return { data: {}, diag: emptyDiag() };
  }

  console.log("[VTEX Mapping] SheetNames:", wb.SheetNames);

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    console.error("[VTEX Mapping] Sheet ausente:", wb.SheetNames[0]);
    return { data: {}, diag: emptyDiag() };
  }

  console.log("[VTEX Mapping] Sheet !ref:", ws["!ref"]);

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  console.log("[VTEX Mapping] Linhas brutas:", raw.length);

  if (raw.length < 3) {
    console.error("[VTEX Mapping] Menos de 3 linhas lidas — arquivo pode estar corrompido");
    return { data: {}, diag: { ...emptyDiag(), totalRows: raw.length } };
  }

  console.log(`[VTEX Mapping] ${raw.length} linhas brutas`);

  // Índices fixos do MVP HTML — usados como padrão
  let skuCol = 28;
  let codProdutoCol = 21;
  let nomeSkuCol = 24;
  let dataStart = 2;

  // Tenta detectar pelo header (primeiras 3 linhas)
  for (let r = 0; r < Math.min(3, raw.length); r++) {
    const row = (raw[r] as unknown[]).map((c) => norm(String(c ?? "")));
    const skuIdx = row.findIndex(
      (h) =>
        h === "codigo de referencia do sku" ||
        h === "referencia do sku" ||
        h === "cod ref sku" ||
        h === "ref do sku"
    );
    const codIdx = row.findIndex(
      (h) =>
        h === "codigo de referencia do produto" ||
        h === "referencia do produto" ||
        h === "cod ref produto"
    );
    const nomeIdx = row.findIndex(
      (h) => h === "nome do sku" || h === "nome sku" || h === "sku name"
    );

    if (skuIdx >= 0 && codIdx >= 0) {
      skuCol = skuIdx;
      codProdutoCol = codIdx;
      if (nomeIdx >= 0) nomeSkuCol = nomeIdx;
      dataStart = r + 1;
      console.log(
        `[VTEX Mapping] header linha ${r}: skuCol=${skuCol}, codProdutoCol=${codProdutoCol}`
      );
      break;
    }
  }

  const data: Record<string, VtexEntry> = {};
  let validRows = 0;

  for (let i = dataStart; i < raw.length; i++) {
    const row = (raw[i] as unknown[]) ?? [];
    const cod = String(row[codProdutoCol] ?? "").trim();
    const sku = String(row[skuCol] ?? "").trim();
    const nome = String(row[nomeSkuCol] ?? "").trim();
    if (cod && sku) {
      data[sku] = { cod_produto: cod, nome_sku: nome };
      validRows++;
    }
  }

  console.log(`[VTEX Mapping] ✓ ${validRows} SKUs mapeados`);
  return {
    data,
    diag: {
      totalRows: raw.length,
      validRows,
      headerRowIndex: dataStart - 1,
      detectedColumns: [
        `SKU=col${skuCol}`,
        `cod_produto=col${codProdutoCol}`,
        `nome_sku=col${nomeSkuCol}`,
      ],
      skuColumn: `col${skuCol}`,
      qtyColumn: null,
      descColumn: `col${nomeSkuCol}`,
    },
  };
}

// ── MeLi Parser ────────────────────────────────────────────────────────────────

/**
 * Colunas fixas do export "ML FULL" — confirmadas com openpyxl no arquivo real.
 *
 * Estrutura do arquivo:
 *   Linhas 0–11  = cabeçalhos (duplos/triplos), instruções e sub-headers
 *   Linha 12+    = dados
 *   col3  = "SKU do Vendedor"
 *   col6  = "Produto / Título do Anúncio"
 *   col16 = "Aptas para venda" (sub-header linha 10)
 */
const MELI_FIXED = {
  DATA_START_ROW: 12,
  SKU_COL: 3,
  TITULO_COL: 6,
  APTAS_COL: 16, // "Aptas para venda" — fallback se detecção dinâmica falhar
} as const;

/**
 * Detecta dinamicamente a coluna "Aptas para venda" nas primeiras linhas do header.
 * Retorna MELI_FIXED.APTAS_COL se não encontrar.
 */
function detectMeliAptasCol(raw: unknown[][]): number {
  for (let r = 0; r < Math.min(raw.length, MELI_FIXED.DATA_START_ROW); r++) {
    const row = (raw[r] as unknown[]) ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = norm(String(row[c] ?? ""));
      // Guarda de tamanho: nome de coluna é curto; evita falso positivo em descrições longas
      if (
        v.length <= 30 &&
        (v === "aptas para venda" || v === "aptas para vender" || v === "aptas")
      ) {
        return c;
      }
    }
  }
  return MELI_FIXED.APTAS_COL;
}

/**
 * Parseia export "ML FULL" do Gerenciador de Anúncios do MeLi BR.
 * Usa aba "Resumo" e colunas fixas conforme layout confirmado.
 */
export async function parseMeliXlsx(
  file: File
): Promise<{ data: Record<string, { qty: number; desc: string }>; diag: ParseDiagnostic }> {
  const wb = await readWorkbook(file);

  if (!wb?.SheetNames?.length || !wb.Sheets) {
    console.error("[MeLi] Workbook inválido — SheetNames ou Sheets ausente");
    return { data: {}, diag: emptyDiag() };
  }

  const sheetName = wb.SheetNames.includes("Resumo") ? "Resumo" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    console.error("[MeLi] Aba não encontrada:", sheetName, "| Abas:", wb.SheetNames);
    return { data: {}, diag: emptyDiag() };
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw.length === 0) return { data: {}, diag: emptyDiag() };

  console.log(`[MeLi] ${file.name} | aba="${sheetName}" | ${raw.length} linhas`);

  const { DATA_START_ROW, SKU_COL, TITULO_COL } = MELI_FIXED;
  const aptasCol = detectMeliAptasCol(raw);

  console.log(`[MeLi] aptasCol detectado = col${aptasCol} (fallback = col${MELI_FIXED.APTAS_COL})`);

  const data: Record<string, { qty: number; desc: string }> = {};
  let validRows = 0;

  for (let i = DATA_START_ROW; i < raw.length; i++) {
    const row = (raw[i] as unknown[]) ?? [];
    const sku = String(row[SKU_COL] ?? "").trim();
    if (!sku || sku === "nan") continue;
    const desc = String(row[TITULO_COL] ?? "").trim();
    const qty = parseFloat(String(row[aptasCol] ?? "0").replace(",", "."));
    data[sku] = { qty: isNaN(qty) ? 0 : qty, desc };
    validRows++;
  }

  console.log(`[MeLi] ✓ ${validRows} itens`);
  return {
    data,
    diag: {
      totalRows: raw.length,
      validRows,
      headerRowIndex: -1,
      detectedColumns: [
        `SKU=col${SKU_COL}`,
        `Titulo=col${TITULO_COL}`,
        `Aptas=col${aptasCol}`,
      ],
      skuColumn: `col${SKU_COL}`,
      qtyColumn: `col${aptasCol}`,
      descColumn: `col${TITULO_COL}`,
    },
  };
}

// ── Merge ──────────────────────────────────────────────────────────────────────

/**
 * Join completo (3-way):
 *   MeLi.sku → vtexMap[sku].cod_produto → spaceErp[cod_produto] = estoque
 */
export function mergeDataFull(
  spaceData: Record<string, number>,
  vtexMap: Record<string, VtexEntry>,
  meliData: Record<string, { qty: number; desc: string }>
): ConciliacaoItem[] {
  const items: ConciliacaoItem[] = [];
  const seenCodProduto = new Set<string>();

  // Itera MeLi → lookup VTEX → lookup Space
  for (const [sku, meli] of Object.entries(meliData)) {
    const vtxEntry = vtexMap[sku];
    const codProduto = vtxEntry?.cod_produto;
    const qtdErp = codProduto !== undefined ? spaceData[codProduto] : undefined;

    if (codProduto) seenCodProduto.add(codProduto);

    let status: ConciliacaoItem["status"];
    if (qtdErp !== undefined) {
      status = qtdErp === meli.qty ? "ok" : "divergente";
    } else {
      status = "so_meli";
    }

    items.push({
      sku,
      descricao: meli.desc || vtxEntry?.nome_sku,
      qtdErp,
      qtdMeli: meli.qty,
      status,
    });
  }

  // Itens do Space sem correspondência no MeLi
  // Reconstrói mapa inverso: cod_produto → primeiro sku que o referencia
  const codToSku: Record<string, string> = {};
  for (const [sku, entry] of Object.entries(vtexMap)) {
    if (!codToSku[entry.cod_produto]) codToSku[entry.cod_produto] = sku;
  }

  for (const [codProduto, estoque] of Object.entries(spaceData)) {
    if (seenCodProduto.has(codProduto)) continue;
    const sku = codToSku[codProduto] ?? codProduto;
    items.push({ sku, qtdErp: estoque, qtdMeli: undefined, status: "so_erp" });
  }

  const order: Record<ConciliacaoItem["status"], number> = {
    divergente: 0,
    so_erp: 1,
    so_meli: 2,
    ok: 3,
  };
  items.sort((a, b) => order[a.status] - order[b.status]);
  return items;
}

/**
 * Join simples (2-way): erpData e meliData compartilham as mesmas chaves.
 * Usado quando VTEX não foi importado.
 */
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

    let status: ConciliacaoItem["status"];
    if (qtdErp !== undefined && qtdMeli !== undefined) {
      status = qtdErp === qtdMeli ? "ok" : "divergente";
    } else if (qtdErp !== undefined) {
      status = "so_erp";
    } else {
      status = "so_meli";
    }

    items.push({ sku, qtdErp, qtdMeli, descricao: meliEntry?.desc, status });
  }

  const order: Record<ConciliacaoItem["status"], number> = {
    divergente: 0,
    so_erp: 1,
    so_meli: 2,
    ok: 3,
  };
  items.sort((a, b) => order[a.status] - order[b.status]);
  return items;
}

// ── Backward-compat ────────────────────────────────────────────────────────────

/** Alias: mantém compatibilidade com páginas que importam parseErpXlsx */
export const parseErpXlsx = parseSpaceErp;

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyDiag(): ParseDiagnostic {
  return {
    totalRows: 0,
    validRows: 0,
    headerRowIndex: 0,
    detectedColumns: [],
    skuColumn: null,
    qtyColumn: null,
    descColumn: null,
  };
}
