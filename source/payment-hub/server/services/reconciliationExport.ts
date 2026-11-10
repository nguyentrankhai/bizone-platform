import nodeModule from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import type { DetailView, RunView } from "./reconciliation.service";

/**
 * Reconciliation report export (P5.4, SRS-PH-RECON-01-04/07): summary, discrepancies, matched list.
 * Excel via exceljs; PDF via pdfmake (Roboto from node_modules — both kept out of the Next bundle
 * by serverExternalPackages).
 */

export const MATCH_LABELS: Record<string, string> = {
  Matched: "Khớp",
  Unmatched_PaymentHub: "Đối tác thiếu (chỉ có ở Payment Hub)",
  Unmatched_Partner: "Payment Hub thiếu (chỉ có ở đối tác)",
  Amount_Mismatch: "Lệch số tiền",
  Unverified: "Chưa tra cứu được",
};

const vnd = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("vi-VN")} ₫`);
const vnTime = (iso: string | null) =>
  iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "";

function summaryRows(run: RunView): [string, string][] {
  return [
    ["Đối tác", `${run.partner_name} (${run.partner})`],
    ["Ngày đối soát", run.run_date],
    [
      "Nguồn dữ liệu đối tác",
      run.source === "File"
        ? `File sao kê: ${run.source_file ?? ""}`
        : "Tra cứu API từng giao dịch",
    ],
    ["Trạng thái", run.status],
    ["Tổng GD Payment Hub", `${run.total_paymenthub} GD — ${vnd(run.total_amount_paymenthub)}`],
    ["Tổng GD đối tác", `${run.total_partner} GD — ${vnd(run.total_amount_partner)}`],
    ["Khớp", String(run.matched_count)],
    ["Chỉ có ở Payment Hub", String(run.unmatched_paymenthub)],
    ["Chỉ có ở đối tác", String(run.unmatched_partner)],
    ["Lệch số tiền", String(run.amount_mismatch_count)],
    ["Chưa tra cứu được", String(run.unverified_count)],
    ["Tổng chênh lệch", vnd(run.total_discrepancy)],
    ["Lệch chưa xử lý", String(run.open_discrepancies)],
    ["Hoàn tất lúc", vnTime(run.completed_at)],
  ];
}

const DETAIL_COLUMNS: { header: string; key: keyof DetailView | "label"; width: number }[] = [
  { header: "Kiểu", key: "label", width: 30 },
  { header: "Mã GD Payment Hub", key: "txn_code", width: 22 },
  { header: "Mã GD đối tác", key: "partner_txn_id", width: 20 },
  { header: "Tham chiếu đối tác", key: "partner_ref", width: 26 },
  { header: "Số tiền PH", key: "paymenthub_amount", width: 14 },
  { header: "Số tiền ĐT", key: "partner_amount", width: 14 },
  { header: "Chênh lệch", key: "discrepancy_amount", width: 14 },
  { header: "Trạng thái PH", key: "paymenthub_status", width: 16 },
  { header: "Trạng thái ĐT", key: "partner_status", width: 18 },
  { header: "Ghi chú", key: "note", width: 50 },
  { header: "Xử lý", key: "status", width: 10 },
  { header: "Cách xử lý", key: "resolution", width: 40 },
];

export async function reconToXlsx(run: RunView, details: DetailView[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BizOne Payment Hub";
  const s = wb.addWorksheet("Tổng hợp");
  s.columns = [
    { header: "Chỉ tiêu", key: "k", width: 28 },
    { header: "Giá trị", key: "v", width: 60 },
  ];
  for (const [k, v] of summaryRows(run)) s.addRow({ k, v });
  s.getRow(1).font = { bold: true };

  const sheet = (name: string, rows: DetailView[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = DETAIL_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const d of rows)
      ws.addRow({ ...d, label: MATCH_LABELS[d.match_status] ?? d.match_status });
    for (const key of ["paymenthub_amount", "partner_amount", "discrepancy_amount"]) {
      ws.getColumn(key).numFmt = "#,##0";
    }
  };
  sheet(
    "Giao dịch lệch",
    details.filter((d) => d.match_status !== "Matched"),
  );
  sheet(
    "Giao dịch khớp",
    details.filter((d) => d.match_status === "Matched"),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let pdfmakeInstance: { createPdf: (d: unknown) => { getBuffer: () => Promise<Buffer> } } | null =
  null;

function pdfmake() {
  if (!pdfmakeInstance) {
    const req = nodeModule.createRequire(import.meta.url);
    const lib = req("pdfmake");
    // Fonts are read from disk: from the app dir (next start / standalone / Docker cwd). A
    // require.resolve() here is rewritten by Turbopack into a module id, so it cannot be used.
    const fontDir = [
      process.env.PDF_FONT_DIR,
      path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto"),
    ].find((d): d is string => !!d && existsSync(path.join(d, "Roboto-Regular.ttf")));
    if (!fontDir) throw new Error("pdfmake Roboto fonts not found (set PDF_FONT_DIR)");
    const font = (f: string) => path.join(fontDir, f);
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

/** PDF: summary + every discrepancy (the matched list is in the Excel export — can be 10 000 rows). */
export async function reconToPdf(run: RunView, details: DetailView[]): Promise<Buffer> {
  const discrepancies = details.filter((d) => d.match_status !== "Matched");
  const created = vnTime(new Date().toISOString());
  const cols: { h: string; v: (d: DetailView) => string; right?: boolean }[] = [
    { h: "Kiểu", v: (d) => MATCH_LABELS[d.match_status] ?? d.match_status },
    { h: "Mã GD PH", v: (d) => d.txn_code ?? "—" },
    { h: "Mã GD đối tác", v: (d) => d.partner_txn_id ?? d.partner_ref ?? "—" },
    { h: "Số tiền PH", v: (d) => vnd(d.paymenthub_amount), right: true },
    { h: "Số tiền ĐT", v: (d) => vnd(d.partner_amount), right: true },
    {
      h: "Chênh lệch",
      v: (d) => (d.match_status === "Unverified" ? "—" : vnd(d.discrepancy_amount)),
      right: true,
    },
    { h: "Ghi chú", v: (d) => d.note ?? "" },
    {
      h: "Xử lý",
      v: (d) => (d.status === "Resolved" ? `Đã xử lý: ${d.resolution ?? ""}` : "Chưa"),
    },
  ];
  return pdfmake()
    .createPdf({
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [28, 32, 28, 36],
      defaultStyle: { font: "Roboto", fontSize: 8 },
      styles: {
        title: { fontSize: 15, bold: true, color: "#1e293b" },
        subtitle: { fontSize: 9, color: "#64748b", margin: [0, 2, 0, 10] },
        section: { fontSize: 11, bold: true, margin: [0, 8, 0, 4], color: "#2563eb" },
      },
      footer: (page: number, pages: number) => ({
        text: `Payment Hub · đối soát #${run.id} · xuất lúc ${created} · trang ${page}/${pages}`,
        alignment: "center",
        fontSize: 7,
        color: "#94a3b8",
      }),
      content: [
        { text: `Báo cáo đối soát — ${run.partner_name}`, style: "title" },
        { text: `Ngày ${run.run_date} · đợt #${run.id}`, style: "subtitle" },
        {
          table: {
            widths: [160, "*"],
            body: summaryRows(run).map(([k, v]) => [k, { text: v, bold: true }]),
          },
          layout: "lightHorizontalLines",
        },
        { text: `Giao dịch lệch / chưa tra cứu được (${discrepancies.length})`, style: "section" },
        discrepancies.length
          ? {
              table: {
                headerRows: 1,
                widths: ["auto", "auto", "auto", "auto", "auto", "auto", "*", 90],
                body: [
                  cols.map((c) => ({ text: c.h, bold: true, fillColor: "#eff6ff" })),
                  ...discrepancies.map((d) =>
                    cols.map((c) => ({
                      text: c.v(d),
                      alignment: c.right ? "right" : "left",
                      ...(c.right ? { noWrap: true } : {}),
                    })),
                  ),
                ],
              },
              layout: "lightHorizontalLines",
            }
          : { text: "Không có giao dịch lệch", italics: true, color: "#64748b" },
        {
          text: `Danh sách ${run.matched_count} giao dịch khớp có trong file Excel.`,
          margin: [0, 8, 0, 0],
          color: "#64748b",
        },
      ],
    })
    .getBuffer();
}

export function reconFileName(run: RunView, ext: "xlsx" | "pdf"): string {
  return `doi-soat-${run.partner.toLowerCase()}-${run.run_date}-${run.id}.${ext}`;
}
