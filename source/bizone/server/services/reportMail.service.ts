/**
 * Report emails (#62, SRS-RPT-08) — WORKER ONLY (renders the file with exceljs / pdfmake, like
 * report exports; never import from Next code).
 * - on demand: "Gửi email" on the reports page → job "report-email";
 * - scheduled: event `report_scheduled` (daily / weekly / monthly at 07:00 VN).
 */
import { getPrisma } from "@/lib/prisma";
import { vnDateKey } from "@/lib/vn-time";
import { scheduledPeriod } from "@/lib/notifications/schedule";
import { fmtVnd, type TemplateVars } from "@/lib/notifications/template";
import type { ExportReportInput, ReportFilter } from "@/lib/validators/report";
import { renderReport } from "@/server/services/reportExport.service";
import { revenueReport } from "@/server/services/report.service";
import { baseVars, deliverOne, renderFor } from "@/server/services/notificationDelivery.service";
import { getEventSettings, notify, storeName } from "@/server/services/notification.service";

export const REPORT_NAMES: Record<string, string> = {
  revenue: "Doanh thu",
  profit: "Lợi nhuận",
  products: "Sản phẩm",
  staff: "Nhân viên",
  promotion: "Khuyến mãi",
  inventory: "Tồn kho",
};

const fmtKey = (k: string) => k.split("-").reverse().join("/");
const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function periodOf(input: ExportReportInput): string {
  const f = input.filter as { from?: string; to?: string };
  if (!f.from || !f.to) return `ngày ${fmtKey(vnDateKey(new Date()))}`;
  return f.from === f.to ? fmtKey(f.from) : `${fmtKey(f.from)} – ${fmtKey(f.to)}`;
}

/** Headline numbers for sales reports (null for promotion / inventory) */
async function summaryVars(input: ExportReportInput): Promise<TemplateVars> {
  if (!["revenue", "profit", "products", "staff"].includes(input.type)) return {};
  const r = await revenueReport(input.filter as ReportFilter);
  const s = r.summary.current;
  return {
    net_revenue: fmtVnd(s.net),
    invoice_count: s.invoices.toLocaleString("vi-VN"),
    profit: fmtVnd(s.profit),
  };
}

/** On-demand email of one report to up to 5 addresses */
export async function sendReportEmail(input: ExportReportInput, to: string[], requestedBy: string) {
  const { fileName, buffer } = await renderReport(input);
  const name = REPORT_NAMES[input.type] ?? input.type;
  const period = periodOf(input);
  const summary = await summaryVars(input);
  const lines = [
    `Báo cáo ${name} ${period.startsWith("ngày") ? period : `kỳ ${period}`} (file đính kèm).`,
    summary.net_revenue ? `Doanh thu thuần: ${summary.net_revenue}` : null,
    summary.invoice_count ? `Số hóa đơn: ${summary.invoice_count}` : null,
    summary.profit ? `Lợi nhuận gộp: ${summary.profit}` : null,
    `Người gửi: ${requestedBy}`,
  ].filter(Boolean);
  const store = await storeName();
  const vars: TemplateVars = {
    store_name: store,
    title: `Báo cáo ${name} ${period}`,
    content: lines.join("\n"),
    link: "",
    report_name: name,
    period,
    ...summary,
  };
  const rendered = await renderFor("email", "generic_email", vars);
  const attachments = [{ filename: fileName, content: buffer, contentType: MIME[input.format] }];
  const results = [];
  for (const addr of to) {
    results.push(
      await deliverOne(
        { eventType: "report_email" },
        { channel: "email", recipient: addr, ...rendered },
        { attachments, store },
      ),
    );
  }
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length === results.length)
    throw new Error(`Gửi email báo cáo thất bại: ${failed[0]?.error ?? ""}`);
  return { fileName, sent: results.length - failed.length, failed: failed.length };
}

// ─── Scheduled report ────────────────────────────────────────────────────────

export async function runScheduledReport(now = new Date()) {
  const settings = await getEventSettings("report_scheduled");
  if (!settings.email || settings.emailTo.length === 0) return { skipped: "disabled" };
  const period = scheduledPeriod(String(settings.options.frequency), now);
  if (!period) return { skipped: "not today" };
  const type = String(settings.options.reportType) as "revenue" | "profit" | "products" | "staff";
  const format = String(settings.options.format) as "xlsx" | "pdf";
  const input = {
    type,
    format,
    filter: { ...period, compare: "previous_period" as const },
  } as ExportReportInput;
  const name = REPORT_NAMES[type];
  const periodText = periodOf(input);
  const dedupeKey = `report:${type}:${period.from}:${period.to}`;
  const summary = await summaryVars(input);

  const prisma = getPrisma();
  let notificationId = await notify({
    type: "report_scheduled",
    title: `Đã gửi báo cáo ${name} ${periodText} tới ${settings.emailTo.length} email`,
    content: summary.net_revenue ? `Doanh thu thuần ${summary.net_revenue}` : null,
    link: "/reports",
    dedupeKey,
    vars: { report_name: name, period: periodText, ...summary },
  });
  if (notificationId === null) {
    // already created by an earlier run (retry) → finish the recipients not sent yet
    const prev = await prisma.notification.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    if (!prev) return { skipped: "disabled" };
    notificationId = prev.id;
  }
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  const sent = new Set(
    (
      await prisma.notificationDelivery.findMany({
        where: { notificationId, channel: "email", status: "sent" },
        select: { recipient: true },
      })
    ).map((d) => d.recipient),
  );
  const todo = settings.emailTo.filter((e) => !sent.has(e));
  if (todo.length === 0) return { sent: 0, already: sent.size };

  const { fileName, buffer } = await renderReport(input);
  const vars: TemplateVars = {
    ...(await baseVars(n!)),
    report_name: name,
    period: periodText,
    net_revenue: "",
    invoice_count: "",
    profit: "",
    ...summary,
  };
  const rendered = await renderFor("email", settings.emailTemplate, vars);
  const store = await storeName();
  let failed = 0;
  for (const addr of todo) {
    const res = await deliverOne(
      { notificationId, eventType: "report_scheduled" },
      { channel: "email", recipient: addr, ...rendered },
      { attachments: [{ filename: fileName, content: buffer, contentType: MIME[format] }], store },
    );
    if (res.status === "failed") failed++;
  }
  if (failed) throw new Error(`${failed}/${todo.length} email báo cáo gửi lỗi — sẽ thử lại`);
  return { sent: todo.length, fileName };
}
