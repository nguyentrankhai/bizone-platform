import ExcelJS from "exceljs";
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

export interface ImportResult {
  success: ImportProductRow[];
  errors: { row: number; sku?: string; errors: string[] }[];
}

export async function parseProductImport(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(1) ?? wb.getWorksheet("Sản phẩm");
  if (!ws) throw new Error("Không tìm thấy sheet dữ liệu");

  const success: ImportProductRow[] = [];
  const errors: ImportResult["errors"] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const [, name, sku, barcode, category, description, costPrice, sellingPrice, unit, minStock, status] =
      row.values as (string | number | undefined)[];

    const raw = { name, sku, barcode, category, description, costPrice, sellingPrice, unit, minStock, status };
    const parsed = importProductRowSchema.safeParse(raw);
    if (parsed.success) {
      success.push(parsed.data);
    } else {
      errors.push({
        row: rowNumber,
        sku: typeof sku === "string" ? sku : undefined,
        errors: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
    }
  });

  return { success, errors };
}
