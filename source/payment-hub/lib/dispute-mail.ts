import { DISPUTE_STATUS_LABELS, type DisputeStatus } from "./dispute";
import { escapeHtml } from "./mail";

/**
 * E-mails of the dispute module (P5.6) — pure builders (tested): the dispute sent to a partner's
 * support address, and the result notification sent to the creator / operations mailbox.
 */

export interface DisputeMailInput {
  disputeCode: string;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  partnerRef: string | null;
  createdBy: string | null;
  resolvedBy: string | null;
  txn: {
    txnCode: string;
    partnerTxnId: string | null;
    merchantTxnId: string | null;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string | null;
    createdAt: Date;
    paidAt: Date | null;
  };
  /** Our merchant account at the partner (partner_configs.merchant_code: TMN code, partner code…) */
  partner: { name: string; connectorType: string; merchantCode: string | null } | null;
  merchant: { code: string; name: string } | null;
  attachmentNames: string[];
  /** Link to the dispute in the admin UI */
  link?: string;
}

function vnTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

function money(n: number, currency: string): string {
  return `${n.toLocaleString("vi-VN")} ${currency === "VND" ? "₫" : currency}`;
}

function table(rows: [string, string][]): string {
  return (
    '<table cellpadding="6" style="border-collapse:collapse;font-size:14px">' +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#6b7280;border-bottom:1px solid #eee">${escapeHtml(k)}</td>` +
          `<td style="border-bottom:1px solid #eee"><b>${escapeHtml(v)}</b></td></tr>`,
      )
      .join("") +
    "</table>"
  );
}

function txnRows(m: DisputeMailInput): [string, string][] {
  return [
    ["Mã tra soát", m.disputeCode],
    ["Mã giao dịch (Payment Hub)", m.txn.txnCode],
    ["Mã giao dịch đối tác", m.txn.partnerTxnId ?? "—"],
    ["Mã merchant tại đối tác", m.partner?.merchantCode ?? "—"],
    ["Số tiền", money(m.txn.amount, m.txn.currency)],
    ["Phương thức", m.txn.paymentMethod ?? "—"],
    ["Thời gian tạo GD", vnTime(m.txn.createdAt)],
    ["Thời gian thanh toán", vnTime(m.txn.paidAt)],
    ["Trạng thái tại Payment Hub", m.txn.status],
  ];
}

/** Dispute request sent to the partner's support address (SRS-PH-RECON-02-04, e-mail channel). */
export function buildPartnerDisputeMail(m: DisputeMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject =
    `[Tra soát] ${m.disputeCode} — GD ${m.txn.partnerTxnId ?? m.txn.txnCode}` +
    (m.partner?.merchantCode ? ` (${m.partner.merchantCode})` : "");
  const rows = txnRows(m);
  const text = [
    `Kính gửi bộ phận hỗ trợ ${m.partner?.name ?? "đối tác"},`,
    "",
    "Payment Hub đề nghị tra soát giao dịch sau:",
    "",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    "",
    `Lý do: ${m.reason}`,
    ...(m.description ? ["", "Nội dung:", m.description] : []),
    ...(m.attachmentNames.length
      ? ["", `Chứng từ đính kèm (${m.attachmentNames.length}): ${m.attachmentNames.join(", ")}`]
      : []),
    "",
    `Vui lòng phản hồi qua email này và giữ mã ${m.disputeCode} trong tiêu đề.`,
    "",
    "Trân trọng,",
    "Payment Hub — bộ phận vận hành",
  ].join("\n");
  const html =
    `<p>Kính gửi bộ phận hỗ trợ ${escapeHtml(m.partner?.name ?? "đối tác")},</p>` +
    "<p>Payment Hub đề nghị tra soát giao dịch sau:</p>" +
    table(rows) +
    `<p><b>Lý do:</b> ${escapeHtml(m.reason)}</p>` +
    (m.description
      ? `<p><b>Nội dung:</b><br>${escapeHtml(m.description).replace(/\n/g, "<br>")}</p>`
      : "") +
    (m.attachmentNames.length
      ? `<p><b>Chứng từ đính kèm (${m.attachmentNames.length}):</b> ${m.attachmentNames.map(escapeHtml).join(", ")}</p>`
      : "") +
    `<p>Vui lòng phản hồi qua email này và giữ mã <b>${escapeHtml(m.disputeCode)}</b> trong tiêu đề.</p>` +
    "<p>Trân trọng,<br>Payment Hub — bộ phận vận hành</p>";
  return { subject, text, html };
}

/** Result notification (SRS-PH-RECON-02-08) to the creator / operations mailbox. */
export function buildDisputeResultMail(m: DisputeMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const label = DISPUTE_STATUS_LABELS[m.status];
  const subject = `[Payment Hub] Tra soát ${m.disputeCode} — ${label}`;
  const rows: [string, string][] = [
    ["Mã tra soát", m.disputeCode],
    ["Kết quả", label],
    ["Mã giao dịch", m.txn.txnCode],
    ["Merchant", m.merchant ? `${m.merchant.code} · ${m.merchant.name}` : "—"],
    ["Đối tác", m.partner?.name ?? "—"],
    ["Số tiền", money(m.txn.amount, m.txn.currency)],
    ["Lý do tra soát", m.reason],
    ["Mã phiếu đối tác", m.partnerRef ?? "—"],
    ["Người xử lý", m.resolvedBy ?? "—"],
  ];
  const text = [
    `Yêu cầu tra soát ${m.disputeCode} đã có kết quả: ${label}.`,
    "",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "Kết quả xử lý:",
    m.resolution ?? "—",
    ...(m.link ? ["", `Xem chi tiết: ${m.link}`] : []),
  ].join("\n");
  const html =
    `<p>Yêu cầu tra soát <b>${escapeHtml(m.disputeCode)}</b> đã có kết quả: <b>${escapeHtml(label)}</b>.</p>` +
    table(rows) +
    `<p><b>Kết quả xử lý:</b><br>${escapeHtml(m.resolution ?? "—").replace(/\n/g, "<br>")}</p>` +
    (m.link ? `<p><a href="${escapeHtml(m.link)}">Xem chi tiết trên Payment Hub</a></p>` : "");
  return { subject, text, html };
}
