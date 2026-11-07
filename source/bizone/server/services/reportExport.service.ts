import nodeModule from "node:module";
import ExcelJS from "exceljs";
import type { ExportReportInput } from "@/lib/validators/report";
import { getPrisma } from "@/lib/prisma";
import {
  inventoryReport,
  productReport,
  profitReport,
  promotionReport,
  revenueReport,
  staffReport,
} from "./report.service";

/**
 * Report → neutral document (summary + tables) → Excel (exceljs) or PDF (pdfmake, Roboto
 * bundled with Vietnamese glyphs). Runs in the worker process (queue bizone-report-export).
 */

type Kind = "text" | "money" | "number" | "pct" | "date";
export interface Column {
  header: string;
  key: string;
  kind?: Kind;
}
export interface Section {
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
}
export interface ReportDocument {
  title: string;
  subtitle: string;
  summary: [string, string][];
  sections: Section[];
}

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const money = (v: unknown) => `${nf.format(Math.round(Number(v ?? 0)))}₫`;
const pct = (v: unknown) => (v === null || v === undefined ? "—" : `${nf.format(Number(v))}%`);
const dmy = (k: string) =>
  k.length === 10
    ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}`
    : `${k.slice(5)}/${k.slice(0, 4)}`;

export function formatCell(v: unknown, kind: Kind = "text"): string {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "money") return money(v);
  if (kind === "number") return nf.format(Number(v));
  if (kind === "pct") return pct(v);
  if (kind === "date") return dmy(String(v));
  return String(v);
}

const COMPARE_LABEL = { previous_period: "kỳ trước", previous_year: "cùng kỳ năm trước", none: "" };

async function filterLabel(f: {
  from: string;
  to: string;
  branchId?: number;
  userId?: number;
  categoryId?: number;
}) {
  const prisma = getPrisma();
  const parts = [`${dmy(f.from)} – ${dmy(f.to)}`];
  if (f.branchId)
    parts.push(
      `Chi nhánh: ${(await prisma.branch.findUnique({ where: { id: f.branchId } }))?.name ?? f.branchId}`,
    );
  if (f.userId)
    parts.push(
      `Nhân viên: ${(await prisma.user.findUnique({ where: { id: f.userId } }))?.fullName ?? f.userId}`,
    );
  if (f.categoryId)
    parts.push(
      `Danh mục: ${(await prisma.productCategory.findUnique({ where: { id: f.categoryId } }))?.name ?? f.categoryId}`,
    );
  return parts.join(" · ");
}

const TOTALS_COLUMNS: Column[] = [
  { header: "Doanh thu", key: "gross", kind: "money" },
  { header: "Chiết khấu", key: "discount", kind: "money" },
  { header: "Trả hàng", key: "refunds", kind: "money" },
  { header: "DT thuần", key: "net", kind: "money" },
  { header: "Số HĐ", key: "invoices", kind: "number" },
  { header: "TB/HĐ", key: "avgPerInvoice", kind: "money" },
];

export async function buildDocument(input: ExportReportInput): Promise<ReportDocument> {
  switch (input.type) {
    case "revenue": {
      const r = await revenueReport(input.filter);
      const s = r.summary;
      const cmp = COMPARE_LABEL[input.filter.compare];
      return {
        title: "Báo cáo doanh thu",
        subtitle: await filterLabel(input.filter),
        summary: [
          ["Doanh thu", money(s.current.gross)],
          ["Chiết khấu", money(s.current.discount)],
          ["Trả hàng", money(s.current.refunds)],
          ["Doanh thu thuần", money(s.current.net)],
          ["Số hoá đơn", nf.format(s.current.invoices)],
          ...(s.change && r.compareRange
            ? ([
                [
                  `So với ${cmp} (${dmy(r.compareRange.from)} – ${dmy(r.compareRange.to)})`,
                  `${money(s.previous!.net)} · ${pct(s.change.net)}`,
                ],
              ] as [string, string][])
            : []),
        ],
        sections: [
          {
            title: r.series.unit === "day" ? "Theo ngày" : "Theo tháng",
            columns: [
              { header: r.series.unit === "day" ? "Ngày" : "Tháng", key: "key", kind: "date" },
              ...TOTALS_COLUMNS,
              ...(r.compareRange
                ? [
                    { header: `DT thuần ${cmp}`, key: "compareNet", kind: "money" as Kind },
                    { header: "% thay đổi", key: "change", kind: "pct" as Kind },
                  ]
                : []),
            ],
            rows: r.series.points,
          },
          ...(r.paymentMethods
            ? [
                {
                  title: "Theo phương thức thanh toán",
                  columns: [
                    { header: "Phương thức", key: "method" },
                    { header: "Số tiền", key: "amount", kind: "money" as Kind },
                    { header: "Tỷ lệ", key: "percent", kind: "pct" as Kind },
                  ],
                  rows: r.paymentMethods,
                },
              ]
            : []),
          {
            title: "Theo danh mục",
            columns: [{ header: "Danh mục", key: "name" }, ...TOTALS_COLUMNS],
            rows: r.byCategory,
          },
        ],
      };
    }
    case "profit": {
      const r = await profitReport(input.filter);
      const c = r.summary.current;
      const productCols: Column[] = [
        { header: "Sản phẩm", key: "name" },
        { header: "SKU", key: "sku" },
        { header: "SL", key: "qty", kind: "number" },
        { header: "DT thuần", key: "net", kind: "money" },
        { header: "Giá vốn", key: "cost", kind: "money" },
        { header: "Lợi nhuận", key: "profit", kind: "money" },
        { header: "Biên LN", key: "margin", kind: "pct" },
      ];
      return {
        title: "Báo cáo lợi nhuận",
        subtitle: await filterLabel(input.filter),
        summary: [
          ["Doanh thu thuần", money(c.net)],
          ["Giá vốn hàng bán", money(c.cost)],
          ["Lợi nhuận gộp", money(c.profit)],
          ["Biên lợi nhuận", pct(c.margin)],
          ...(c.noCostLines
            ? ([["Dòng hàng thiếu giá vốn", nf.format(c.noCostLines)]] as [string, string][])
            : []),
        ],
        sections: [
          {
            title: "Theo danh mục",
            columns: [{ header: "Danh mục", key: "name" }, ...productCols.slice(2)],
            rows: r.byCategory,
          },
          { title: "Top lợi nhuận cao", columns: productCols, rows: r.topProfit },
          { title: "Top lợi nhuận thấp", columns: productCols, rows: r.lowProfit },
        ],
      };
    }
    case "products": {
      const r = await productReport(input.filter);
      return {
        title: "Báo cáo hàng bán chạy / bán chậm",
        subtitle: await filterLabel(input.filter),
        summary: [],
        sections: [
          {
            title: "Top 10 bán chạy",
            columns: [
              { header: "Sản phẩm", key: "name" },
              { header: "SKU", key: "sku" },
              { header: "SL bán", key: "qty", kind: "number" },
              { header: "DT thuần", key: "net", kind: "money" },
              { header: "Lợi nhuận", key: "profit", kind: "money" },
            ],
            rows: r.bestSelling,
          },
          {
            title: "Top 10 bán chậm (còn tồn)",
            columns: [
              { header: "Sản phẩm", key: "name" },
              { header: "SKU", key: "sku" },
              { header: "SL bán", key: "qty", kind: "number" },
              { header: "Tồn", key: "stock", kind: "number" },
              { header: "Giá trị tồn", key: "stockValue", kind: "money" },
              { header: "Ngày chưa bán", key: "daysSinceSale", kind: "number" },
            ],
            rows: r.slowMoving,
          },
        ],
      };
    }
    case "staff": {
      const r = await staffReport(input.filter);
      return {
        title: "Báo cáo hiệu quả nhân viên",
        subtitle: await filterLabel(input.filter),
        summary: [],
        sections: [
          {
            title: "Theo nhân viên",
            columns: [
              { header: "Nhân viên", key: "fullName" },
              { header: "DT thuần", key: "net", kind: "money" },
              { header: "Số HĐ", key: "invoices", kind: "number" },
              { header: "TB/HĐ", key: "avgPerInvoice", kind: "money" },
              { header: "SL bán", key: "qty", kind: "number" },
              { header: "Lợi nhuận", key: "profit", kind: "money" },
              { header: "Tỷ trọng", key: "share", kind: "pct" },
              ...(r.compareRange
                ? [{ header: "% so kỳ so sánh", key: "change", kind: "pct" as Kind }]
                : []),
            ],
            rows: r.rows,
          },
        ],
      };
    }
    case "promotion": {
      const r = await promotionReport(input.filter);
      return {
        title: "Báo cáo hiệu quả khuyến mãi",
        subtitle: `Khung KM ${dmy(input.filter.from)} – ${dmy(input.filter.to)} (${r.windowDays} ngày)`,
        summary: [
          ["DT/ngày trong KM so với trước", pct(r.upliftDuring)],
          ["DT/ngày sau KM so với trước", pct(r.upliftAfter)],
          ["Lượt dùng mã giảm giá", nf.format(r.couponUsage.count)],
          ["Tiền giảm qua mã", money(r.couponUsage.discount)],
        ],
        sections: [
          {
            title: "So sánh trước / trong / sau",
            columns: [
              { header: "Giai đoạn", key: "label" },
              { header: "Từ", key: "from", kind: "date" },
              { header: "Đến", key: "to", kind: "date" },
              { header: "Số ngày", key: "days", kind: "number" },
              { header: "DT thuần", key: "net", kind: "money" },
              { header: "DT/ngày", key: "netPerDay", kind: "money" },
              { header: "HĐ/ngày", key: "invoicesPerDay", kind: "number" },
              { header: "Chiết khấu", key: "discount", kind: "money" },
            ],
            rows: r.windows,
          },
        ],
      };
    }
    case "inventory": {
      const r = await inventoryReport(input.filter);
      const batchCols: Column[] = [
        { header: "Sản phẩm", key: "name" },
        { header: "Kho", key: "warehouse" },
        { header: "Lô", key: "batchCode" },
        { header: "SL", key: "quantity", kind: "number" },
        { header: "HSD", key: "expiryDate", kind: "date" },
        { header: "Còn (ngày)", key: "daysLeft", kind: "number" },
        { header: "Giá trị", key: "value", kind: "money" },
      ];
      return {
        title: "Báo cáo tồn kho",
        subtitle: `Tại thời điểm ${dmy(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10))}`,
        summary: [
          ["Giá trị tồn kho", money(r.totalValue)],
          ["Tổng số lượng", nf.format(r.totalQuantity)],
          ["Mặt hàng sắp hết", nf.format(r.lowStock.length)],
          ["Lô quá hạn / sắp hết hạn", `${r.expired.length} / ${r.expiring.length}`],
        ],
        sections: [
          {
            title: "Giá trị theo kho",
            columns: [
              { header: "Kho", key: "name" },
              { header: "Số mã còn hàng", key: "skus", kind: "number" },
              { header: "Số lượng", key: "quantity", kind: "number" },
              { header: "Giá trị", key: "value", kind: "money" },
            ],
            rows: r.warehouses,
          },
          {
            title: "Hàng sắp hết",
            columns: [
              { header: "Sản phẩm", key: "name" },
              { header: "SKU", key: "sku" },
              { header: "Kho", key: "warehouse" },
              { header: "Tồn", key: "quantity", kind: "number" },
              { header: "Tối thiểu", key: "minQuantity", kind: "number" },
            ],
            rows: r.lowStock,
          },
          { title: "Lô quá hạn", columns: batchCols, rows: r.expired },
          { title: "Lô sắp hết hạn", columns: batchCols, rows: r.expiring },
        ],
      };
    }
  }
}

// ─── Renderers ───────────────────────────────────────────────────────────────

const NUMBER_FORMAT: Partial<Record<Kind, string>> = {
  money: '#,##0" ₫"',
  number: "#,##0.##",
  pct: '0.0"%"',
};

export async function toXlsx(doc: ReportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BizOne";
  const summary = wb.addWorksheet("Tổng quan");
  summary.addRow([doc.title]).font = { bold: true, size: 14 };
  summary.addRow([doc.subtitle]);
  summary.addRow([]);
  for (const [k, v] of doc.summary) summary.addRow([k, v]);
  summary.getColumn(1).width = 42;
  summary.getColumn(2).width = 30;
  const used = new Set<string>();
  for (const s of doc.sections) {
    let name = s.title.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.columns = s.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.kind === "text" || !c.kind ? 28 : 16,
      style: NUMBER_FORMAT[c.kind ?? "text"] ? { numFmt: NUMBER_FORMAT[c.kind ?? "text"] } : {},
    }));
    ws.getRow(1).font = { bold: true };
    for (const row of s.rows) {
      ws.addRow(
        Object.fromEntries(
          s.columns.map((c) => {
            const v = row[c.key];
            if (c.kind === "date" && typeof v === "string") return [c.key, formatCell(v, "date")];
            return [
              c.key,
              v === null || v === undefined
                ? null
                : c.kind && c.kind !== "text"
                  ? Number(v)
                  : String(v),
            ];
          }),
        ),
      );
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let pdfmakeInstance: {
  createPdf: (d: unknown) => { getBuffer: () => Promise<Buffer> };
} | null = null;

function pdfmake() {
  if (!pdfmakeInstance) {
    // Kept external in the worker bundle so the bundled Roboto fonts resolve from node_modules
    const req = nodeModule.createRequire(import.meta.url);
    const lib = req("pdfmake");
    const font = (f: string) => req.resolve(`pdfmake/fonts/Roboto/${f}`);
    lib.addFonts({
      Roboto: {
        normal: font("Roboto-Regular.ttf"),
        bold: font("Roboto-Medium.ttf"),
        italics: font("Roboto-Italic.ttf"),
        bolditalics: font("Roboto-MediumItalic.ttf"),
      },
    });
    lib.setLocalAccessPolicy((p: string) => p.includes("pdfmake"));
    lib.setUrlAccessPolicy(() => false);
    pdfmakeInstance = lib;
  }
  return pdfmakeInstance!;
}

export async function toPdf(doc: ReportDocument): Promise<Buffer> {
  const wide = doc.sections.some((s) => s.columns.length > 7);
  const content: unknown[] = [
    { text: doc.title, style: "title" },
    { text: doc.subtitle, style: "subtitle" },
  ];
  if (doc.summary.length) {
    content.push({
      table: {
        widths: ["*", "auto"],
        body: doc.summary.map(([k, v]) => [k, { text: v, bold: true, alignment: "right" }]),
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 12],
    });
  }
  for (const s of doc.sections) {
    content.push({ text: s.title, style: "section" });
    if (!s.rows.length) {
      content.push({
        text: "Không có dữ liệu",
        italics: true,
        color: "#64748b",
        margin: [0, 0, 0, 8],
      });
      continue;
    }
    content.push({
      table: {
        headerRows: 1,
        widths: s.columns.map((c) => (!c.kind || c.kind === "text" ? "*" : "auto")),
        body: [
          s.columns.map((c) => ({ text: c.header, bold: true, fillColor: "#eff6ff" })),
          ...s.rows.map((r) =>
            s.columns.map((c) => ({
              text: formatCell(r[c.key], c.kind),
              alignment: !c.kind || c.kind === "text" ? "left" : "right",
            })),
          ),
        ],
      },
      layout: "lightHorizontalLines",
      fontSize: 8,
      margin: [0, 0, 0, 10],
    });
  }
  const created = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  return pdfmake()
    .createPdf({
      pageSize: "A4",
      pageOrientation: wide ? "landscape" : "portrait",
      pageMargins: [32, 36, 32, 40],
      defaultStyle: { font: "Roboto", fontSize: 9 },
      styles: {
        title: { fontSize: 16, bold: true, color: "#1e293b" },
        subtitle: { fontSize: 9, color: "#64748b", margin: [0, 2, 0, 10] },
        section: { fontSize: 11, bold: true, margin: [0, 6, 0, 4], color: "#2563eb" },
      },
      footer: (page: number, pages: number) => ({
        text: `BizOne · xuất lúc ${created} · trang ${page}/${pages}`,
        alignment: "center",
        fontSize: 7,
        color: "#94a3b8",
      }),
      content,
    })
    .getBuffer();
}

export function exportFileName(input: ExportReportInput): string {
  const f = input.filter as { from?: string; to?: string };
  const span = f.from ? `${f.from}_${f.to}` : new Date().toISOString().slice(0, 10);
  return `bao-cao-${input.type}-${span}.${input.format}`;
}

export async function renderReport(
  input: ExportReportInput,
): Promise<{ fileName: string; buffer: Buffer }> {
  const doc = await buildDocument(input);
  const buffer = input.format === "pdf" ? await toPdf(doc) : await toXlsx(doc);
  return { fileName: exportFileName(input), buffer };
}
