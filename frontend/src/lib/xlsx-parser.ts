/**
 * Parsers de XLSX/CSV para conciliação
 *
 * Migrado do script legado (StockSync_Seralle_Sampa_Full.html)
 * Mantém a lógica de parsing de SKU / tamanho dos arquivos Space, VTEX e MeLi.
 *
 * TODO: mover processamento pesado para o backend (.NET API)
 * quando o volume de dados justificar.
 */

import * as XLSX from "xlsx";
import type { ConciliacaoItem } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractSize(nomeSku: string): string {
  const m = nomeSku.match(
    /\b(PP|P|M|G|GG|XGG|XS|S|L|XL|XXL|\d{1,3}(?:[.,]\d)?(?:\s*(?:cm|ml|L|kg|g|KG))?)\b/i
  );
  return m ? m[1].toUpperCase() : "";
}

function normalizeSkuSpace(name: string, sku: string): string {
  const size = extractSize(name || sku);
  const base = sku.replace(/[-_]?\d+$/, "").replace(/\s+/g, " ").trim();
  return size ? `${base} ${size}` : base;
}

function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      try {
        const wb = XLSX.read(data, { type: "binary" });
        resolve(wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ── ERP Parser (Space / VTEX) ────────────────────────────────────────────────

export async function parseErpXlsx(
  file: File
): Promise<Record<string, number>> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    return parseErpCsv(file);
  }

  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const result: Record<string, number> = {};

  for (const row of rows) {
    // Detecta formato Space ou VTEX pelas colunas
    const isSpace = "Nome" in row || "nome" in row;

    if (isSpace) {
      const nome = String(row["Nome"] ?? row["nome"] ?? "");
      const skuRaw = String(row["SKU"] ?? row["sku"] ?? row["Ref"] ?? "");
      const qty = parseFloat(String(row["Estoque"] ?? row["estoque"] ?? 0));
      const sku = normalizeSkuSpace(nome, skuRaw);
      if (sku) result[sku] = (result[sku] ?? 0) + (isNaN(qty) ? 0 : qty);
    } else {
      // VTEX
      const skuRaw = String(row["RefId"] ?? row["Sku"] ?? row["sku"] ?? "");
      const qty = parseFloat(
        String(row["Estoque Total"] ?? row["EstoqueTotal"] ?? row["estoque"] ?? 0)
      );
      if (skuRaw) result[skuRaw] = (result[skuRaw] ?? 0) + (isNaN(qty) ? 0 : qty);
    }
  }

  return result;
}

async function parseErpCsv(file: File): Promise<Record<string, number>> {
  const text = await file.text();
  const wb = XLSX.read(text, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const result: Record<string, number> = {};

  for (const row of rows) {
    const sku = String(row["sku"] ?? row["SKU"] ?? row["Ref"] ?? "").trim();
    const qty = parseFloat(String(row["estoque"] ?? row["Estoque"] ?? 0));
    if (sku) result[sku] = (result[sku] ?? 0) + (isNaN(qty) ? 0 : qty);
  }

  return result;
}

// ── MeLi Parser ──────────────────────────────────────────────────────────────

export async function parseMeliXlsx(
  file: File
): Promise<Record<string, { qty: number; desc: string }>> {
  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const result: Record<string, { qty: number; desc: string }> = {};

  for (const row of rows) {
    const sku = String(
      row["SKU"] ?? row["Sku"] ?? row["sku"] ?? row["Seller SKU"] ?? ""
    ).trim();
    const desc = String(row["Título"] ?? row["titulo"] ?? row["Title"] ?? "").trim();
    const qty = parseFloat(
      String(row["Quantidade"] ?? row["quantidade"] ?? row["Stock"] ?? 0)
    );

    if (sku) {
      result[sku] = {
        qty: isNaN(qty) ? 0 : qty,
        desc,
      };
    }
  }

  return result;
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

  // Ordenar: divergentes primeiro, depois só ERP, só MeLi, OK
  const order = { divergente: 0, so_erp: 1, so_meli: 2, ok: 3 };
  items.sort((a, b) => order[a.status] - order[b.status]);

  return items;
}
