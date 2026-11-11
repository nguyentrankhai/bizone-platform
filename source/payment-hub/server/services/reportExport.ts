import ExcelJS from "exceljs";
import {
  MAX_EXPORT_ROWS,
  RECON_DAY_STATUS_LABELS,
  REPORT_TITLES,
  formatDay,
  partnerLabel,
  paymentMethodLabel,
  reconDayStatus,
  toCsv,
  type DateRange,
  type ReportFormat,
  type ReportType,
  type RevenueLine,
  type RevenueReport,
  type TxnReport,
} from "@/lib/report";
import { MATCH_LABELS } from "./reconciliationExport";
import { pdfmake } from "./pdf";
import type { ReconDiscrepancyRow, ReconciliationReport, TxnListRow } from "./report.service";

/**
 * Report export (P5.5, SRS-PH-RPT-01-04 / 02-06 / 03-04): each report is described once as a
 * document (summary + tables) and rendered to Excel (every table on its own sheet), PDF (the
 * tables marked `pdf`, A4 landscape, Roboto) or CSV (the one table marked `csv`).
 */

type Cell = string | number | null;

interface Column {
  header: string;
  width: number;
  kind?: "money" | "int" | "pct";
}

interface Table {
  sheet: string;
  title: string;
  columns: Column[];
  rows: Cell[][];
  note?: string;
  /** Rendered in the PDF (long lists stay in Excel / CSV). */
  pdf?: boolean;
  /** The CSV export is this table. */
  csv?: boolean;
  /** false = CSV only (a flattened variant of other sheets). */
  xlsx?: boolean;
}

export interface ReportDoc {
  type: ReportType;
  title: string;
  subtitle: string;
  summary: [string, string][];
  tables: Table[];
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
const intFmt = (n: number) => n.toLocaleString("vi-VN");
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("vi-VN")} %`);
const signedPct = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("vi-VN")} %`;
const vnTime = (d: Date | string | null) =>
  d
    ? new Date(new Date(d).getTime() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ")
    : "";

export function rangeText(r: DateRange): string {
  return r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}`;
}

const GROUP_LABEL = { day: "ngày", week: "tuần", month: "tháng" } as const;

// ─── Documents ────────────────────────────────────────────────────────────────

export function transactionDoc(
  r: TxnReport,
  list: { rows: TxnListRow[]; truncated: boolean },
  filterText: string,
): ReportDoc {
  const s = r.summary;
  return {
    type: "transactions",
    title: REPORT_TITLES.transactions,
    subtitle: `${rangeText(r.range)} · ${filterText}`,
    summary: [
      ["Khoảng thời gian (ngày tạo GD)", rangeText(r.range)],
      ["Bộ lọc", filterText],
      ["Tổng số giao dịch", intFmt(s.total)],
      ["Thành công (gồm đã hoàn tiền)", intFmt(s.paid)],
      ["Thất bại / hết hạn", intFmt(s.failed)],
      ["Đang chờ", intFmt(s.pending)],
      ["Đã hoàn tiền (toàn phần / một phần)", intFmt(s.refunded)],
      ["Tỷ lệ thành công", pct(s.successRate)],
      ["Tổng tiền mọi giao dịch", vnd(s.totalAmount)],
      ["Tổng tiền giao dịch thành công", vnd(s.paidAmount)],
      ["Phí giao dịch (ước tính theo biểu phí đối tác)", vnd(s.fees)],
    ],
    tables: [
      {
        sheet: `Theo ${GROUP_LABEL[r.groupBy]}`,
        title: `Giao dịch theo ${GROUP_LABEL[r.groupBy]}`,
        pdf: true,
        columns: [
          { header: GROUP_LABEL[r.groupBy] === "ngày" ? "Ngày" : "Kỳ", width: 16 },
          { header: "Số GD", width: 10, kind: "int" },
          { header: "Thành công", width: 12, kind: "int" },
          { header: "Thất bại", width: 10, kind: "int" },
          { header: "Đang chờ", width: 10, kind: "int" },
          { header: "Tiền thành công", width: 18, kind: "money" },
          { header: "Phí GD", width: 14, kind: "money" },
          { header: "Tỷ lệ TC (%)", width: 12, kind: "pct" },
        ],
        rows: r.buckets.map((b) => [
          b.label,
          b.total,
          b.paid,
          b.failed,
          b.pending,
          b.paidAmount,
          b.fees,
          b.successRate,
        ]),
      },
      {
        sheet: "Danh sách giao dịch",
        title: "Danh sách giao dịch",
        csv: true,
        note: list.truncated
          ? `Chỉ liệt kê ${MAX_EXPORT_ROWS.toLocaleString("vi-VN")} giao dịch đầu tiên — thu hẹp bộ lọc để xuất đủ`
          : undefined,
        columns: [
          { header: "Mã GD", width: 24 },
          { header: "Merchant", width: 14 },
          { header: "Mã đơn merchant", width: 22 },
          { header: "Số tiền", width: 14, kind: "money" },
          { header: "Đã hoàn", width: 12, kind: "money" },
          { header: "Phí GD", width: 12, kind: "money" },
          { header: "Trạng thái", width: 18 },
          { header: "Phương thức", width: 26 },
          { header: "Đối tác", width: 12 },
          { header: "Cấu hình đối tác", width: 20 },
          { header: "Mã GD đối tác", width: 22 },
          { header: "Tạo lúc", width: 20 },
          { header: "Thanh toán lúc", width: 20 },
        ],
        rows: list.rows.map((t) => [
          t.txnCode,
          t.merchantCode,
          t.merchantTxnId,
          t.amount,
          t.refundedAmount,
          t.fee,
          t.status,
          paymentMethodLabel(t.paymentMethod),
          t.partner ? partnerLabel(t.partner) : "",
          t.partnerName,
          t.partnerTxnId,
          vnTime(t.createdAt),
          vnTime(t.paidAt),
        ]),
      },
    ],
  };
}

const REVENUE_COLUMNS = (first: string): Column[] => [
  { header: first, width: 28 },
  { header: "Số GD", width: 10, kind: "int" },
  { header: "Doanh thu", width: 18, kind: "money" },
  { header: "Đã hoàn", width: 14, kind: "money" },
  { header: "Phí GD", width: 14, kind: "money" },
  { header: "Doanh thu thuần", width: 18, kind: "money" },
  { header: "Tỷ trọng (%)", width: 12, kind: "pct" },
  { header: "Kỳ so sánh", width: 18, kind: "money" },
  { header: "Tăng trưởng (%)", width: 14, kind: "pct" },
];

const revenueRow = (l: RevenueLine): Cell[] => [
  l.label,
  l.count,
  l.gross,
  l.refunded,
  l.fees,
  l.net,
  l.percentage,
  l.previous.gross,
  l.growth,
];

export function revenueDoc(r: RevenueReport, filterText: string): ReportDoc {
  const s = r.summary;
  const compareText = r.compare === "year" ? "cùng kỳ năm trước" : "kỳ liền trước (cùng số ngày)";
  return {
    type: "revenue",
    title: REPORT_TITLES.revenue,
    subtitle: `${rangeText(r.range)} · so với ${rangeText(r.previousRange)} · ${filterText}`,
    summary: [
      ["Khoảng thời gian (ngày thanh toán)", rangeText(r.range)],
      ["So sánh với", `${rangeText(r.previousRange)} (${compareText})`],
      ["Bộ lọc", filterText],
      ["Số GD thành công", `${intFmt(s.count)} (kỳ so sánh ${intFmt(s.previous.count)})`],
      ["Doanh thu", vnd(s.gross)],
      ["Đã hoàn tiền", vnd(s.refunded)],
      ["Phí giao dịch (ước tính)", vnd(s.fees)],
      ["Doanh thu thuần", vnd(s.net)],
      ["Doanh thu kỳ so sánh", vnd(s.previous.gross)],
      ["Tăng trưởng doanh thu", signedPct(s.growth)],
      ["Tăng trưởng doanh thu thuần", signedPct(s.netGrowth)],
    ],
    tables: [
      {
        sheet: "Theo đối tác",
        title: "Doanh thu theo đối tác",
        pdf: true,
        columns: REVENUE_COLUMNS("Đối tác"),
        rows: r.byPartner.map(revenueRow),
      },
      {
        sheet: "Theo phương thức",
        title: "Doanh thu theo phương thức thanh toán",
        pdf: true,
        columns: REVENUE_COLUMNS("Phương thức"),
        rows: r.byMethod.map(revenueRow),
      },
      {
        sheet: "Tăng trưởng 12 tháng",
        title: "Tăng trưởng theo tháng",
        pdf: true,
        columns: [
          { header: "Tháng", width: 12 },
          { header: "Số GD", width: 10, kind: "int" },
          { header: "Doanh thu", width: 18, kind: "money" },
          { header: "Đã hoàn", width: 14, kind: "money" },
          { header: "Phí GD", width: 14, kind: "money" },
          { header: "Doanh thu thuần", width: 18, kind: "money" },
        ],
        rows: r.trend.map((t) => [t.label, t.count, t.gross, t.refunded, t.fees, t.net]),
      },
      {
        sheet: "CSV",
        title: "Doanh thu",
        csv: true,
        xlsx: false,
        columns: [{ header: "Nhóm", width: 12 }, ...REVENUE_COLUMNS("Tên")],
        rows: [
          ...r.byPartner.map((l) => ["Đối tác", ...revenueRow(l)]),
          ...r.byMethod.map((l) => ["Phương thức", ...revenueRow(l)]),
        ],
      },
    ],
  };
}

export function reconciliationDoc(
  r: ReconciliationReport,
  discrepancies: { rows: ReconDiscrepancyRow[]; total: number },
  filterText: string,
): ReportDoc {
  const s = r.summary;
  return {
    type: "reconciliation",
    title: REPORT_TITLES.reconciliation,
    subtitle: `${rangeText(r.range)} · ${filterText}`,
    summary: [
      ["Khoảng thời gian (ngày đối soát)", rangeText(r.range)],
      ["Bộ lọc", filterText],
      [
        "Số đợt (đợt mới nhất mỗi đối tác × ngày)",
        `${intFmt(s.runs)} đợt / ${intFmt(s.days)} ngày`,
      ],
      ["GD Payment Hub", `${intFmt(s.totalPaymenthub)} GD — ${vnd(s.amountPaymenthub)}`],
      ["GD đối tác", `${intFmt(s.totalPartner)} GD — ${vnd(s.amountPartner)}`],
      ["Khớp", intFmt(s.matched)],
      [
        "Lệch",
        `${intFmt(s.unmatched)} (chỉ ở Payment Hub ${intFmt(s.unmatchedPaymenthub)}, chỉ ở đối tác ${intFmt(s.unmatchedPartner)}, sai số tiền ${intFmt(s.amountMismatch)})`,
      ],
      ["Chưa tra cứu được", intFmt(s.unverified)],
      ["Tổng chênh lệch", vnd(s.discrepancy)],
      ["Lệch chưa xử lý", intFmt(s.open)],
      ["Tỷ lệ khớp", pct(s.matchRate)],
    ],
    tables: [
      {
        sheet: "Theo ngày",
        title: "Kết quả đối soát theo ngày",
        pdf: true,
        csv: true,
        columns: [
          { header: "Ngày", width: 12 },
          { header: "Đối tác", width: 22 },
          { header: "Nguồn", width: 8 },
          { header: "GD Payment Hub", width: 14, kind: "int" },
          { header: "GD đối tác", width: 12, kind: "int" },
          { header: "Khớp", width: 10, kind: "int" },
          { header: "Chỉ ở PH", width: 10, kind: "int" },
          { header: "Chỉ ở ĐT", width: 10, kind: "int" },
          { header: "Sai tiền", width: 10, kind: "int" },
          { header: "Chưa tra cứu", width: 12, kind: "int" },
          { header: "Chênh lệch", width: 16, kind: "money" },
          { header: "Chưa xử lý", width: 11, kind: "int" },
          { header: "Trạng thái", width: 16 },
        ],
        rows: r.days.map((d) => [
          formatDay(d.date),
          d.partnerName,
          d.source === "File" ? "File" : "API",
          d.totalPaymenthub,
          d.totalPartner,
          d.matched,
          d.unmatchedPaymenthub,
          d.unmatchedPartner,
          d.amountMismatch,
          d.unverified,
          d.discrepancy,
          d.open,
          RECON_DAY_STATUS_LABELS[reconDayStatus(d)],
        ]),
      },
      {
        sheet: "Giao dịch lệch",
        title: "Chi tiết giao dịch lệch",
        pdf: true,
        note:
          discrepancies.total > discrepancies.rows.length
            ? `Chỉ liệt kê ${discrepancies.rows.length.toLocaleString("vi-VN")} / ${discrepancies.total.toLocaleString("vi-VN")} dòng lệch`
            : undefined,
        columns: [
          { header: "Ngày", width: 12 },
          { header: "Đối tác", width: 18 },
          { header: "Kiểu", width: 30 },
          { header: "Mã GD Payment Hub", width: 22 },
          { header: "Mã GD / tham chiếu đối tác", width: 26 },
          { header: "Số tiền PH", width: 14, kind: "money" },
          { header: "Số tiền ĐT", width: 14, kind: "money" },
          { header: "Chênh lệch", width: 14, kind: "money" },
          { header: "Ghi chú", width: 40 },
          { header: "Xử lý", width: 12 },
          { header: "Cách xử lý", width: 36 },
          { header: "Người xử lý", width: 14 },
        ],
        rows: discrepancies.rows.map((d) => [
          formatDay(d.run_date),
          d.partner_name,
          MATCH_LABELS[d.match_status] ?? d.match_status,
          d.txn_code,
          d.partner_txn_id ?? d.partner_ref,
          d.paymenthub_amount,
          d.partner_amount,
          d.discrepancy_amount,
          d.note,
          d.status === "Resolved" ? "Đã xử lý" : "Chưa xử lý",
          d.resolution,
          d.resolved_by,
        ]),
      },
    ],
  };
}

// ─── Renderers ────────────────────────────────────────────────────────────────

export async function docToXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BizOne Payment Hub";
  const s = wb.addWorksheet("Tổng hợp");
  s.columns = [
    { header: doc.title, key: "k", width: 44 },
    { header: "", key: "v", width: 70 },
  ];
  s.getRow(1).font = { bold: true, size: 13 };
  for (const [k, v] of doc.summary) s.addRow({ k, v });
  s.addRow({ k: "Xuất lúc", v: vnTime(new Date()) });

  for (const t of doc.tables.filter((x) => x.xlsx !== false)) {
    const ws = wb.addWorksheet(t.sheet.slice(0, 31));
    ws.columns = t.columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of t.rows) ws.addRow(row);
    t.columns.forEach((c, i) => {
      if (c.kind) ws.getColumn(i + 1).numFmt = c.kind === "pct" ? "0.0" : "#,##0";
    });
    if (t.note) ws.addRow([]).getCell(1).value = t.note;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function pdfCell(v: Cell, c: Column): string {
  if (v === null || v === undefined || v === "") return c.kind ? "—" : "";
  if (typeof v !== "number") return v;
  if (c.kind === "money") return vnd(v);
  if (c.kind === "pct") return pct(v);
  return intFmt(v);
}

/** Rows per table in the PDF — the full lists are in the Excel / CSV export. */
const PDF_MAX_ROWS = 500;

export async function docToPdf(doc: ReportDoc): Promise<Buffer> {
  const created = vnTime(new Date());
  const content: unknown[] = [
    { text: doc.title, style: "title" },
    { text: doc.subtitle, style: "subtitle" },
    {
      table: {
        widths: [230, "*"],
        body: doc.summary.map(([k, v]) => [k, { text: v, bold: true }]),
      },
      layout: "lightHorizontalLines",
    },
  ];
  for (const t of doc.tables.filter((x) => x.pdf)) {
    content.push({
      text: `${t.title} (${t.rows.length.toLocaleString("vi-VN")})`,
      style: "section",
    });
    if (!t.rows.length) {
      content.push({ text: "Không có dữ liệu", italics: true, color: "#64748b" });
      continue;
    }
    const rows = t.rows.slice(0, PDF_MAX_ROWS);
    content.push({
      table: {
        headerRows: 1,
        widths: t.columns.map((c) => (c.kind ? "auto" : c.width >= 30 ? "*" : "auto")),
        body: [
          t.columns.map((c) => ({
            text: c.header,
            bold: true,
            fillColor: "#eff6ff",
            alignment: c.kind ? "right" : "left",
          })),
          ...rows.map((r) =>
            t.columns.map((c, i) => ({
              text: pdfCell(r[i], c),
              alignment: c.kind ? "right" : "left",
              ...(c.kind ? { noWrap: true } : {}),
            })),
          ),
        ],
      },
      layout: "lightHorizontalLines",
    });
    const notes = [
      t.rows.length > PDF_MAX_ROWS
        ? `PDF hiển thị ${PDF_MAX_ROWS} / ${t.rows.length.toLocaleString("vi-VN")} dòng — xem đủ trong file Excel`
        : null,
      t.note ?? null,
    ].filter(Boolean);
    if (notes.length)
      content.push({ text: notes.join(" · "), color: "#64748b", margin: [0, 4, 0, 0] });
  }
  return pdfmake()
    .createPdf({
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [28, 32, 28, 36],
      defaultStyle: { font: "Roboto", fontSize: 8 },
      styles: {
        title: { fontSize: 15, bold: true, color: "#1e293b" },
        subtitle: { fontSize: 9, color: "#64748b", margin: [0, 2, 0, 10] },
        section: { fontSize: 11, bold: true, margin: [0, 10, 0, 4], color: "#2563eb" },
      },
      footer: (page: number, pages: number) => ({
        text: `Payment Hub · ${doc.title} · xuất lúc ${created} · trang ${page}/${pages}`,
        alignment: "center",
        fontSize: 7,
        color: "#94a3b8",
      }),
      content,
    })
    .getBuffer();
}

export function docToCsv(doc: ReportDoc): Buffer {
  const t = doc.tables.find((x) => x.csv) ?? doc.tables[0]!;
  return Buffer.from(
    toCsv(
      t.columns.map((c) => c.header),
      t.rows,
    ),
    "utf8",
  );
}

export const CONTENT_TYPES: Record<ReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
};

export async function renderDoc(doc: ReportDoc, format: ReportFormat): Promise<Buffer> {
  if (format === "xlsx") return docToXlsx(doc);
  if (format === "pdf") return docToPdf(doc);
  return docToCsv(doc);
}
