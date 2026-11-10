/**
 * Reconciliation matching (P5.4, SRS-PH-RECON-01) — pure: no DB, no PSP calls.
 *
 * Payment Hub side: payments of one partner config paid on the reconciliation day, plus the
 * transactions a partner record points at (late payments, other days).
 * Partner side: records from status queries (one per Hub transaction) or an imported statement.
 *
 *  - Matched              both sides, partner says paid, same amount
 *  - Amount_Mismatch      both sides, partner says paid, amounts differ
 *  - Unmatched_PaymentHub Hub paid, partner has no record or says not paid
 *  - Unmatched_Partner    partner paid, Hub has no paid transaction for it (unknown reference,
 *                         duplicate payment, or Hub gave up: Pending / Expired / Failed — issue #19)
 *  - Unverified           the partner could not be asked (query error) — neither matched nor a
 *                         discrepancy, the run reports how many
 */

export type MatchStatus =
  "Matched" | "Amount_Mismatch" | "Unmatched_PaymentHub" | "Unmatched_Partner" | "Unverified";

export const PAID_STATUSES = ["Success", "PartiallyRefunded", "Refunded"] as const;
export const isPaidStatus = (s: string) => (PAID_STATUSES as readonly string[]).includes(s);

export interface HubTxn {
  id: number;
  txnCode: string;
  amount: number;
  status: string;
  partnerTxnId: string | null;
  paidAt: Date | null;
  /** Paid inside the reconciliation day (false = pulled in because a partner record names it) */
  inPeriod: boolean;
}

export type PartnerStatus = "Success" | "Failed" | "Pending" | "Unknown";

export interface PartnerRecord {
  /** Reference as written by the partner (order id, app_trans_id, transfer note…) */
  ref: string | null;
  /** Payment Hub txn_code found in `ref` (see extractTxnCode) */
  txnCode: string | null;
  partnerTxnId: string | null;
  amount: number | null;
  status: PartnerStatus;
  /** Partner's own status text / code, kept for the report */
  statusText?: string | null;
  time?: Date | null;
  /** Status query failed — the partner said nothing about this transaction */
  unverified?: boolean;
  note?: string | null;
}

export interface MatchDetail {
  matchStatus: MatchStatus;
  transactionId: number | null;
  txnCode: string | null;
  partnerTxnId: string | null;
  partnerRef: string | null;
  paymenthubAmount: number | null;
  partnerAmount: number | null;
  discrepancyAmount: number;
  partnerTxnDate: Date | null;
  paymenthubStatus: string | null;
  partnerStatus: string | null;
  note: string | null;
}

export interface MatchSummary {
  totalPaymenthub: number;
  totalAmountPaymenthub: number;
  totalPartner: number;
  totalAmountPartner: number;
  matchedCount: number;
  unmatchedPaymenthub: number;
  unmatchedPartner: number;
  amountMismatchCount: number;
  unverifiedCount: number;
  totalDiscrepancy: number;
}

/**
 * Payment Hub transaction code inside any partner reference: `TXN-20261110-123456`, the VietQR
 * transfer note `TXN20261110123456` (dashes removed), MoMo `TXN-…_2`, ZaloPay
 * `261110_TXN20261110123456_2`.
 */
export function extractTxnCode(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = /TXN-?(\d{8})-?(\d{6})(?!\d)/i.exec(ref);
  return m ? `TXN-${m[1]}-${m[2]}` : null;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

export function matchTransactions(
  hub: HubTxn[],
  partner: PartnerRecord[],
): { details: MatchDetail[]; summary: MatchSummary } {
  const byCode = new Map<string, HubTxn>();
  const byPartnerId = new Map<string, HubTxn>();
  for (const t of hub) {
    byCode.set(t.txnCode, t);
    if (t.partnerTxnId) byPartnerId.set(t.partnerTxnId, t);
  }

  // Partner records per Hub transaction (first by partner txn id, then by txn code)
  const recordsOf = new Map<number, PartnerRecord[]>();
  const orphans: PartnerRecord[] = [];
  for (const r of partner) {
    const t =
      (r.partnerTxnId ? byPartnerId.get(r.partnerTxnId) : undefined) ??
      (r.txnCode ? byCode.get(r.txnCode) : undefined);
    if (!t) {
      orphans.push(r);
      continue;
    }
    const list = recordsOf.get(t.id) ?? [];
    list.push(r);
    recordsOf.set(t.id, list);
  }

  const details: MatchDetail[] = [];
  const base = (t: HubTxn | null, r: PartnerRecord | null) => ({
    transactionId: t?.id ?? null,
    txnCode: t?.txnCode ?? r?.txnCode ?? null,
    partnerTxnId: r?.partnerTxnId ?? t?.partnerTxnId ?? null,
    partnerRef: r?.ref ?? null,
    paymenthubAmount: t ? t.amount : null,
    partnerAmount: r?.amount ?? null,
    partnerTxnDate: r?.time ?? null,
    paymenthubStatus: t?.status ?? null,
    partnerStatus: r ? (r.statusText ?? r.status) : null,
  });

  for (const t of hub) {
    const records = recordsOf.get(t.id) ?? [];
    const paidRecords = records.filter((r) => r.status === "Success");
    const paid = isPaidStatus(t.status);

    if (paid) {
      // Only payments of the day count on the Hub side; a payment of another day reached
      // through a partner record is matched without being a discrepancy of this day.
      const [first, ...extra] = paidRecords;
      if (!first) {
        const unverified = records.find((r) => r.unverified);
        if (unverified) {
          details.push({
            ...base(t, unverified),
            matchStatus: "Unverified",
            discrepancyAmount: 0,
            note: unverified.note ?? "Không tra cứu được giao dịch ở đối tác",
          });
        } else if (t.inPeriod) {
          const r = records[0] ?? null;
          details.push({
            ...base(t, r),
            matchStatus: "Unmatched_PaymentHub",
            discrepancyAmount: t.amount,
            note: r
              ? `Payment Hub ghi ${t.status} nhưng đối tác báo ${r.statusText ?? r.status}`
              : "Không có giao dịch tương ứng ở đối tác",
          });
        }
      } else if (first.amount !== null && first.amount !== t.amount) {
        details.push({
          ...base(t, first),
          matchStatus: "Amount_Mismatch",
          discrepancyAmount: Math.abs(t.amount - first.amount),
          note: `Lệch ${fmt(Math.abs(t.amount - first.amount))} ₫ (Payment Hub ${fmt(t.amount)} ₫, đối tác ${fmt(first.amount)} ₫)`,
        });
      } else {
        details.push({
          ...base(t, first),
          matchStatus: "Matched",
          discrepancyAmount: 0,
          note: t.inPeriod
            ? null
            : `Thanh toán ghi nhận ở Payment Hub ngày khác (${t.paidAt?.toISOString() ?? "?"})`,
        });
      }
      for (const r of extra) {
        details.push({
          ...base(t, r),
          matchStatus: "Unmatched_Partner",
          discrepancyAmount: r.amount ?? 0,
          note: "Đối tác ghi nhận thanh toán thứ hai cho cùng giao dịch",
        });
      }
      continue;
    }

    // Hub did not record a payment: a partner "paid" record is money the Hub does not know of
    for (const r of paidRecords) {
      details.push({
        ...base(t, r),
        matchStatus: "Unmatched_Partner",
        discrepancyAmount: r.amount ?? t.amount,
        note: `Đối tác đã thu tiền nhưng Payment Hub ghi ${t.status} — cần xác nhận / hoàn tiền thủ công`,
      });
    }
  }

  for (const r of orphans) {
    if (r.status !== "Success") continue;
    details.push({
      ...base(null, r),
      matchStatus: "Unmatched_Partner",
      discrepancyAmount: r.amount ?? 0,
      note: r.txnCode
        ? `Không có giao dịch ${r.txnCode} ở Payment Hub`
        : "Không nhận ra mã giao dịch Payment Hub trong tham chiếu của đối tác",
    });
  }

  return { details, summary: summarize(hub, partner, details) };
}

export function summarize(
  hub: HubTxn[],
  partner: PartnerRecord[],
  details: MatchDetail[],
): MatchSummary {
  const hubPaid = hub.filter((t) => t.inPeriod && isPaidStatus(t.status));
  const partnerPaid = partner.filter((r) => r.status === "Success");
  const count = (s: MatchStatus) => details.filter((d) => d.matchStatus === s).length;
  return {
    totalPaymenthub: hubPaid.length,
    totalAmountPaymenthub: hubPaid.reduce((a, t) => a + t.amount, 0),
    totalPartner: partnerPaid.length,
    totalAmountPartner: partnerPaid.reduce((a, r) => a + (r.amount ?? 0), 0),
    matchedCount: count("Matched"),
    unmatchedPaymenthub: count("Unmatched_PaymentHub"),
    unmatchedPartner: count("Unmatched_Partner"),
    amountMismatchCount: count("Amount_Mismatch"),
    unverifiedCount: count("Unverified"),
    totalDiscrepancy: details.reduce(
      (a, d) =>
        a +
        (d.matchStatus === "Matched" || d.matchStatus === "Unverified" ? 0 : d.discrepancyAmount),
      0,
    ),
  };
}
