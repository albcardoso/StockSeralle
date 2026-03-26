/**
 * Parser XLSX nativo para Node.js — usa zlib built-in para descomprimir ZIP.
 *
 * Motivação: o SheetJS community edition usa um descompressor ZIP em JavaScript
 * que falha silenciosamente em arquivos XLSX com entradas ZIP > 268 MB.
 *
 * Este parser:
 *   1. Lê o ZIP manualmente com Buffer do Node.js
 *   2. Descomprime com zlib.inflateRaw() (C++ nativo)
 *   3. Parseia o XML em streaming (Buffer chunks) para suportar sheets > 512 MB
 *
 * NÃO depende do SheetJS — roda 100% em código Node.js nativo.
 * Uso exclusivo em API Routes (server-side).
 */

import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflateRawAsync = promisify(inflateRaw);

// ── ZIP Parser ──────────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}

/**
 * Parseia o Central Directory de um ZIP para obter a lista de entradas.
 */
function parseZipDirectory(buf: Buffer): ZipEntry[] {
  // Encontra End of Central Directory Record (EOCD) — assinatura 0x06054b50
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP: EOCD not found");

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);

  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x4b || buf[pos + 2] !== 0x01 || buf[pos + 3] !== 0x02) break;

    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, dataOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Extrai e descomprime uma entrada do ZIP. Retorna Buffer (não string).
 */
async function extractEntry(buf: Buffer, entry: ZipEntry): Promise<Buffer> {
  const raw = buf.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) return Buffer.from(raw);
  if (entry.compressionMethod === 8) return await inflateRawAsync(raw);
  throw new Error(`ZIP: unsupported compression method ${entry.compressionMethod}`);
}

// ── Streaming XML Parser para sheets grandes ────────────────────────────────────

/**
 * Detecta se o XML da sheet usa namespace prefix (ex: <x:row> em vez de <row>).
 * Verifica os primeiros 4 KB do buffer procurando padrões como <x:sheetData> ou <x:row.
 */
function detectNamespacePrefix(buf: Buffer): string {
  const head = buf.toString("utf8", 0, Math.min(4096, buf.length));

  // Procura por padrões como <x:sheetData ou <x:row onde x é o prefix
  const match = head.match(/<([a-zA-Z][a-zA-Z0-9]*):(?:sheetData|row|worksheet)\b/);
  if (match) return match[1];

  // Se não encontrou prefix explícito, verifica se <row existe sem prefix
  if (/<row[\s>]/.test(head) || /<sheetData[\s>]/.test(head)) return "";

  // Olha mais adiante (até 64 KB) se não encontrou nada nos primeiros 4 KB
  const head64 = buf.toString("utf8", 0, Math.min(65536, buf.length));
  const match2 = head64.match(/<([a-zA-Z][a-zA-Z0-9]*):row[\s>]/);
  if (match2) return match2[1];

  if (/<row[\s>]/.test(head64)) return "";

  return "";
}

/**
 * Parseia shared strings do XLSX a partir de um Buffer (xl/sharedStrings.xml).
 * SharedStrings geralmente é pequeno o suficiente para converter em string.
 */
function parseSharedStrings(buf: Buffer): string[] {
  const xml = buf.toString("utf8");
  const strings: string[] = [];

  // Detecta namespace prefix para shared strings (pode ser diferente da sheet)
  const ssNsMatch = xml.match(/<([a-zA-Z][a-zA-Z0-9]*):si[\s>]/);
  const sp = ssNsMatch ? `${ssNsMatch[1]}:` : "";

  const siRegex = new RegExp(`<${sp}si>([\\s\\S]*?)</${sp}si>`, "g");
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const tRegex = new RegExp(`<${sp}t[^>]*>([\\s\\S]*?)</${sp}t>`, "g");
    let text = "";
    let tMatch;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += tMatch[1];
    }
    strings.push(unescapeXml(text));
  }

  // Se não encontrou com prefix, tenta sem (fallback)
  if (strings.length === 0 && sp) {
    const siRegexNoNs = /<si>([\s\S]*?)<\/si>/g;
    while ((siMatch = siRegexNoNs.exec(xml)) !== null) {
      const inner = siMatch[1];
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let text = "";
      let tMatch;
      while ((tMatch = tRegex.exec(inner)) !== null) {
        text += tMatch[1];
      }
      strings.push(unescapeXml(text));
    }
  }

  return strings;
}

/**
 * Parseia uma sheet XLSX a partir de um Buffer GRANDE em streaming.
 *
 * Em vez de converter o Buffer inteiro em string (que falharia para >512 MB),
 * processa o Buffer em chunks de ~16 MB, mantendo um overlap para não cortar tags.
 *
 * @param nsPrefix - namespace prefix (ex: "x" para <x:row>), ou "" para sem prefix
 */
function parseSheetFromBuffer(buf: Buffer, sharedStrings: string[], nsPrefix: string = ""): unknown[][] {
  const rows: unknown[][] = [];

  // Tags com ou sem namespace prefix
  const p = nsPrefix ? `${nsPrefix}:` : "";
  const rowOpen = `<${p}row`;
  const rowClose = `</${p}row>`;

  // Tamanho do chunk: 16 MB (bem abaixo do limite de string do V8)
  const CHUNK_SIZE = 16 * 1024 * 1024;
  // Overlap: 256 KB para garantir que nenhuma tag <row> gigante seja cortada
  const OVERLAP = 256 * 1024;

  let offset = 0;
  let leftover = "";
  let totalFound = 0;

  while (offset < buf.length) {
    const end = Math.min(offset + CHUNK_SIZE, buf.length);
    const chunkStr = buf.toString("utf8", offset, end);

    // Combina com leftover do chunk anterior
    const xml = leftover + chunkStr;

    // Processa todas as <row> completas neste chunk usando busca manual
    // (mais confiável que regex para XML com namespaces)
    let lastProcessedEnd = 0;
    let searchFrom = 0;

    while (true) {
      const rowStart = xml.indexOf(rowOpen, searchFrom);
      if (rowStart < 0) break;

      const rowEnd = xml.indexOf(rowClose, rowStart);
      if (rowEnd < 0) break; // Row incompleta — será processada no próximo chunk

      const fullRowEnd = rowEnd + rowClose.length;
      const rowXml = xml.substring(rowStart, fullRowEnd);

      // Log diagnóstico das primeiras 3 rows para debug
      if (totalFound < 3) {
        console.log(`[native-xlsx] ROW #${totalFound} (${rowXml.length} chars): ${rowXml.substring(0, 500)}`);
      }

      processRowXml(rowXml, rows, sharedStrings, p);
      totalFound++;

      // Log após processar primeira row
      if (totalFound === 1) {
        console.log(`[native-xlsx] After first row: rows.length=${rows.length}`);
      }

      lastProcessedEnd = fullRowEnd;
      searchFrom = fullRowEnd;
    }

    // Log de progresso a cada 16 MB
    if (totalFound > 0 && offset > 0 && offset % (CHUNK_SIZE * 4) < CHUNK_SIZE) {
      console.log(`[native-xlsx] ... ${totalFound} rows so far (${((offset / buf.length) * 100).toFixed(0)}%)`);
    }

    // Leftover: tudo após o último </row> completo
    if (end < buf.length) {
      leftover = xml.substring(lastProcessedEnd);
      offset = end - OVERLAP;
    } else {
      offset = end;
    }
  }

  return rows;
}

/**
 * Processa uma string XML de <row>...</row> e adiciona ao array de rows.
 * @param p - namespace prefix incluindo ":" (ex: "x:") ou "" se sem prefix
 */
function processRowXml(
  rowXml: string,
  rows: unknown[][],
  sharedStrings: string[],
  p: string
): void {
  const cells: { col: number; value: unknown }[] = [];

  // Regex para <c> ou <x:c> — cell elements
  // O cell ref pode estar em qualquer posição nos atributos
  const cOpen = `<${p}c\\b`;
  const cClose = `</${p}c>`;
  const cellRegex = new RegExp(
    `${cOpen}([^>]*)(?:/>|>([\\s\\S]*?)${cClose})`,
    "g"
  );
  let cellMatch;

  while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
    const attrs = cellMatch[1];
    const cellContent = cellMatch[2] || "";

    // Extrai referência da célula (ex: r="A1" ou r="AB123")
    const refMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
    if (!refMatch) continue;

    const colLetters = refMatch[1];
    const colIndex = colLettersToIndex(colLetters);

    // Detecta tipo
    const typeMatch = attrs.match(/\bt="([^"]+)"/);
    const cellType = typeMatch ? typeMatch[1] : "";

    // Extrai valor — suporta <v> e <x:v>
    const vRegex = new RegExp(`<${p}v>([\\s\\S]*?)</${p}v>`);
    const vMatch = cellContent.match(vRegex);
    const rawValue = vMatch ? vMatch[1] : "";

    let value: unknown = "";
    if (cellType === "s") {
      const idx = parseInt(rawValue, 10);
      value = isNaN(idx) ? "" : (sharedStrings[idx] ?? "");
    } else if (cellType === "inlineStr") {
      const tRegex = new RegExp(`<${p}t[^>]*>([\\s\\S]*?)</${p}t>`);
      const tMatch = cellContent.match(tRegex);
      value = tMatch ? unescapeXml(tMatch[1]) : "";
    } else if (cellType === "b") {
      value = rawValue === "1" ? true : false;
    } else if (rawValue) {
      const num = Number(rawValue);
      value = isNaN(num) ? unescapeXml(rawValue) : num;
    }

    cells.push({ col: colIndex, value });
  }

  if (cells.length > 0) {
    // Extrai row number do atributo r="N"
    const rowNumMatch = rowXml.match(/\br="(\d+)"/);
    const rowNum = rowNumMatch ? parseInt(rowNumMatch[1], 10) : rows.length + 1;

    while (rows.length < rowNum) rows.push([]);

    const row: unknown[] = [];
    for (const cell of cells) {
      while (row.length <= cell.col) row.push("");
      row[cell.col] = cell.value;
    }
    rows[rowNum - 1] = row;
  }
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── API pública ─────────────────────────────────────────────────────────────────

/**
 * Parseia o workbook de um arquivo XLSX (.xlsx = ZIP).
 * Suporta sheets com XML > 512 MB (parsing em chunks de 16 MB).
 */
export async function parseXlsxNative(
  buffer: Buffer,
  options?: { sheetNames?: string[] }
): Promise<Record<string, unknown[][]>> {
  console.log(`[native-xlsx] Parsing ZIP (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`);
  const startTime = Date.now();

  const entries = parseZipDirectory(buffer);
  console.log(`[native-xlsx] ${entries.length} entries no ZIP`);

  // 1. Shared strings
  const ssEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  let sharedStrings: string[] = [];
  if (ssEntry) {
    const ssBuf = await extractEntry(buffer, ssEntry);
    sharedStrings = parseSharedStrings(ssBuf);
    console.log(`[native-xlsx] ${sharedStrings.length} shared strings`);
  }

  // 2. Workbook XML — mapeia sheet names → arquivo
  const wbEntry = entries.find((e) => e.name === "xl/workbook.xml");
  if (!wbEntry) throw new Error("xl/workbook.xml not found in ZIP");
  const wbXml = (await extractEntry(buffer, wbEntry)).toString("utf8");

  const sheetMap: { name: string; rId: string }[] = [];
  const sheetRegex = /<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  let sm;
  while ((sm = sheetRegex.exec(wbXml)) !== null) {
    sheetMap.push({ name: unescapeXml(sm[1]), rId: sm[2] });
  }

  if (sheetMap.length === 0) {
    const altRegex = /<sheet[^>]+name="([^"]+)"[^>]*\/?>/g;
    while ((sm = altRegex.exec(wbXml)) !== null) {
      sheetMap.push({ name: unescapeXml(sm[1]), rId: "" });
    }
  }

  console.log(`[native-xlsx] Sheets: ${sheetMap.map((s) => s.name).join(", ")}`);

  // 3. Relationships
  const relsEntry = entries.find((e) => e.name === "xl/_rels/workbook.xml.rels");
  const rIdMap: Record<string, string> = {};
  if (relsEntry) {
    const relsXml = (await extractEntry(buffer, relsEntry)).toString("utf8");
    const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/?>/g;
    let rm;
    while ((rm = relRegex.exec(relsXml)) !== null) {
      rIdMap[rm[1]] = rm[2].replace(/^\//, "");
    }
  }

  // 4. Parseia cada sheet
  const result: Record<string, unknown[][]> = {};
  const targetSheets = options?.sheetNames?.length
    ? sheetMap.filter((s) => options.sheetNames!.includes(s.name))
    : sheetMap;

  for (const sheet of targetSheets) {
    let sheetPath = rIdMap[sheet.rId];
    if (sheetPath && !sheetPath.startsWith("xl/")) {
      sheetPath = "xl/" + sheetPath;
    }
    if (!sheetPath) {
      const idx = sheetMap.indexOf(sheet) + 1;
      sheetPath = `xl/worksheets/sheet${idx}.xml`;
    }

    const sheetEntry = entries.find((e) => e.name === sheetPath);
    if (!sheetEntry) {
      console.warn(`[native-xlsx] Sheet file not found: ${sheetPath}`);
      continue;
    }

    const compMB = (sheetEntry.compressedSize / 1024 / 1024).toFixed(1);
    const uncMB = (sheetEntry.uncompressedSize / 1024 / 1024).toFixed(1);
    console.log(`[native-xlsx] Extracting "${sheet.name}" (${sheetPath}) ${compMB} MB → ${uncMB} MB`);

    // Descomprime para Buffer (não string!)
    const sheetBuf = await extractEntry(buffer, sheetEntry);
    console.log(`[native-xlsx] Decompressed OK (${(sheetBuf.length / 1024 / 1024).toFixed(1)} MB) — parsing rows...`);

    // Log primeiros 500 bytes para diagnóstico (ver namespace/formato)
    const preview = sheetBuf.toString("utf8", 0, Math.min(500, sheetBuf.length));
    console.log(`[native-xlsx] XML preview: ${preview.substring(0, 400)}`);

    // Detecta namespace prefix no XML (ex: <x:row> em vez de <row>)
    const nsPrefix = detectNamespacePrefix(sheetBuf);
    if (nsPrefix) {
      console.log(`[native-xlsx] Detected namespace prefix: "${nsPrefix}"`);
    }

    // Parsing em chunks de 16 MB — suporta qualquer tamanho de XML
    result[sheet.name] = parseSheetFromBuffer(sheetBuf, sharedStrings, nsPrefix);
    console.log(`[native-xlsx] "${sheet.name}": ${result[sheet.name].length} rows`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[native-xlsx] ✓ Done in ${elapsed}s`);

  return result;
}
