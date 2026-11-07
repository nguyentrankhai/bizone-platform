import ExcelJS from "exceljs";
import type { z } from "zod";
import { importProductRowSchema, type ImportProductRow } from "@/lib/validators/product";

// ─── Export template ──────────────────────────────────────────────────────────

export async function generateProductTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sản phẩm");

  const headers = [
    { header: "Tên sản phẩm *", key: "name", width: 40 },
    { header: "SKU *", key: "sku", width: 20 },
    { header: "Mã vạch", key: "barcode", width: 20 },
    { header: "Danh mục (tên)", key: "category", width: 25 },
    { header: "Mô tả", key: "description", width: 40 },
    { header: "Giá vốn", key: "costPrice", width: 15 },
    { header: "Giá bán *", key: "sellingPrice", width: 15 },
    { header: "Đơn vị tính *", key: "unit", width: 15 },
    { header: "Tồn tối thiểu", key: "minStock", width: 15 },
    { header: "Trạng thái (active/inactive/discontinued)", key: "status", width: 35 },
  ];

  ws.columns = headers;

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { horizontal: "center" };
  });

  // Sample row
  ws.addRow({
    name: "Cà phê Arabica 250g",
    sku: "CF-ARA-250",
    barcode: "8936069368003",
    category: "Đồ uống",
    description: "Cà phê rang xay nguyên chất",
    costPrice: 85000,
    sellingPrice: 120000,
    unit: "gói",
    minStock: 10,
    status: "active",
  });

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ─── Export products ──────────────────────────────────────────────────────────

interface ExportRow {
  name: string;
  sku: string;
  barcode: string | null;
  categoryName: string | null;
  costPrice: number | string;
  sellingPrice: number | string;
  unit: string;
  minStock: number;
  status: string;
}

export async function exportProductsToExcel(rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sản phẩm");

  ws.columns = [
    { header: "Tên sản phẩm", key: "name", width: 40 },
    { header: "SKU", key: "sku", width: 20 },
    { header: "Mã vạch", key: "barcode", width: 20 },
    { header: "Danh mục", key: "categoryName", width: 25 },
    { header: "Giá vốn", key: "costPrice", width: 15 },
    { header: "Giá bán", key: "sellingPrice", width: 15 },
    { header: "Đơn vị tính", key: "unit", width: 15 },
    { header: "Tồn tối thiểu", key: "minStock", width: 15 },
    { header: "Trạng thái", key: "status", width: 20 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  for (const row of rows) {
    ws.addRow(row);
  }

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ─── Import parsing ───────────────────────────────────────────────────────────

/** A valid row plus its sheet row number, so later (DB) errors point at the right line */
export type ImportRow = ImportProductRow & { rowNumber: number };

export interface ImportResult {
  success: ImportRow[];
  errors: { row: number; sku?: string; errors: string[] }[];
}

const FIELD_LABELS: Record<string, string> = {
  name: "Tên sản phẩm",
  sku: "SKU",
  barcode: "Mã vạch",
  category: "Danh mục",
  description: "Mô tả",
  costPrice: "Giá vốn",
  sellingPrice: "Giá bán",
  unit: "Đơn vị tính",
  minStock: "Tồn tối thiểu",
  status: "Trạng thái",
};

/** Vietnamese message for one Zod issue (the template is shown to shop staff) */
export function importIssueMessage(issue: z.core.$ZodIssue): string {
  const field = FIELD_LABELS[String(issue.path[0])] ?? issue.path.join(".");
  switch (issue.code) {
    case "too_small":
      return issue.origin === "string"
        ? Number(issue.minimum) <= 1
          ? `${field}: bắt buộc`
          : `${field}: tối thiểu ${issue.minimum} ký tự`
        : `${field}: phải ≥ ${issue.minimum}`;
    case "too_big":
      return issue.origin === "string"
        ? `${field}: tối đa ${issue.maximum} ký tự`
        : `${field}: phải ≤ ${issue.maximum}`;
    case "invalid_type":
      return issue.input === undefined || issue.input === null || issue.input === ""
        ? `${field}: bắt buộc`
        : `${field}: sai kiểu dữ liệu (cần ${issue.expected === "number" ? "số" : "chữ"})`;
    case "invalid_value":
      return `${field}: giá trị không hợp lệ (chỉ nhận ${issue.values.join(" / ")})`;
    default:
      return `${field}: không hợp lệ`;
  }
}

const TEXT_FIELDS = new Set([
  "name",
  "sku",
  "barcode",
  "category",
  "description",
  "unit",
  "status",
]);

/** ExcelJS cell → plain value: numbers typed into text columns (SKU 1001…) become strings */
function cellValue(key: string, v: unknown): unknown {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "object" && v !== null) {
    if ("richText" in v)
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("result" in v) return (v as { result: unknown }).result;
  }
  if (TEXT_FIELDS.has(key) && typeof v === "number") return String(v);
  return typeof v === "string" ? v.trim() : v;
}

export async function parseProductImport(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(1) ?? wb.getWorksheet("Sản phẩm");
  if (!ws) throw new Error("Không tìm thấy sheet dữ liệu");

  const success: ImportRow[] = [];
  const errors: ImportResult["errors"] = [];
  const firstRowOfSku = new Map<string, number>();
  const keys = Object.keys(FIELD_LABELS);

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const values = (row.values as unknown[]).slice(1);
    const raw = Object.fromEntries(keys.map((k, i) => [k, cellValue(k, values[i])]));
    const sku = typeof raw.sku === "string" ? raw.sku : undefined;

    const parsed = importProductRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: rowNumber, sku, errors: parsed.error.issues.map(importIssueMessage) });
      return;
    }
    const seen = firstRowOfSku.get(parsed.data.sku);
    if (seen !== undefined) {
      errors.push({ row: rowNumber, sku, errors: [`SKU trùng với dòng ${seen} trong file`] });
      return;
    }
    firstRowOfSku.set(parsed.data.sku, rowNumber);
    success.push({ ...parsed.data, rowNumber });
  });

  errors.sort((a, b) => a.row - b.row);
  return { success, errors };
}
