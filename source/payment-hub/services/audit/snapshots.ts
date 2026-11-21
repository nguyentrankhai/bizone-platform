import { getPrisma } from "@/lib/prisma";

/**
 * State of an entity before an admin change (audit oldData, P7.2). Raw rows — the logger masks
 * credential columns (apiKey, secretKey, secret…) before storing. Invalid id → null.
 */

const int = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function partnerSnapshot(id: string) {
  const n = int(id);
  return n ? getPrisma().partnerConfig.findUnique({ where: { id: n } }) : null;
}

export async function webhookSnapshot(id: string) {
  const n = int(id);
  return n ? getPrisma().webhookConfig.findUnique({ where: { id: n } }) : null;
}

export async function connectorSnapshot(code: string) {
  return getPrisma().connector.findUnique({ where: { code } });
}

export async function merchantRoutesSnapshot(merchantId: string) {
  const n = int(merchantId);
  return n
    ? getPrisma().merchantRoute.findMany({
        where: { merchantId: n },
        orderBy: [{ paymentMethod: "asc" }, { priority: "asc" }],
      })
    : null;
}

export async function disputeSnapshot(id: string) {
  const n = int(id);
  return n ? getPrisma().dispute.findUnique({ where: { id: n } }) : null;
}

export async function refundSnapshot(id: string) {
  const n = int(id);
  return n ? getPrisma().refund.findUnique({ where: { id: n } }) : null;
}

export async function reconDetailSnapshot(detailId: string) {
  const n = int(detailId);
  return n ? getPrisma().reconciliationDetail.findUnique({ where: { id: n } }) : null;
}

export async function notificationSettingsSnapshot() {
  return getPrisma().notificationSetting.findMany({ orderBy: { event: "asc" } });
}
