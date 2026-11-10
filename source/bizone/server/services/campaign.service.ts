import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { normalizePhone, renderTemplate, VN_PHONE } from "@/lib/notifications/template";
import {
  campaignAudienceSchema,
  type CampaignAudience,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from "@/lib/validators/notification";
import { enqueueCampaign } from "@/server/queue/notification";
import { deliverOne } from "@/server/services/notificationDelivery.service";
import { notify, storeName } from "@/server/services/notification.service";

/**
 * Marketing campaigns (SRS-MKT-06, #70): one email / SMS text with `{{variables}}` sent to a
 * customer segment. Draft → (send now | scheduled) → sending → completed; scheduled / sending can
 * be cancelled. Sending runs in the worker (job "campaign"), one delivery row per customer — a
 * restarted job skips customers already sent, a cancelled campaign stops within 20 messages.
 */

export const MAX_RECIPIENTS = 5000;
const RANKING_LABEL: Record<string, string> = {
  silver: "Silver",
  gold: "Gold",
  vip: "VIP",
  diamond: "Diamond",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAudience(raw: string): CampaignAudience {
  try {
    return campaignAudienceSchema.parse(JSON.parse(raw));
  } catch {
    return campaignAudienceSchema.parse({});
  }
}

export interface AudienceMember {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  ranking: string;
  totalPoints: number;
}

/** Active customers of the segment that can be reached on the channel */
export async function audienceMembers(
  channel: "email" | "sms",
  audience: CampaignAudience,
  limit = MAX_RECIPIENTS + 1,
): Promise<AudienceMember[]> {
  const where: Prisma.CustomerWhereInput = {
    isActive: true,
    ...(audience.rankings.length ? { ranking: { in: audience.rankings } } : {}),
    ...(audience.groupIds.length ? { groupId: { in: audience.groupIds } } : {}),
    ...(audience.minSpent !== null ? { totalSpent: { gte: audience.minSpent } } : {}),
    ...(channel === "email" ? { email: { not: null } } : {}),
    ...(audience.birthdayMonth !== null ? { birthday: { not: null } } : {}),
  };
  const rows = await getPrisma().customer.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      ranking: true,
      totalPoints: true,
      birthday: true,
    },
    orderBy: { id: "asc" },
  });
  return rows
    .filter((c) =>
      audience.birthdayMonth !== null
        ? c.birthday!.getUTCMonth() + 1 === audience.birthdayMonth
        : true,
    )
    .filter((c) =>
      channel === "email"
        ? !!c.email && EMAIL_RE.test(c.email.trim())
        : VN_PHONE.test(normalizePhone(c.phone)),
    )
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email?.trim() ?? null,
      ranking: String(c.ranking),
      totalPoints: c.totalPoints,
    }));
}

export async function previewAudience(channel: "email" | "sms", audience: CampaignAudience) {
  const members = await audienceMembers(channel, audience);
  return {
    count: Math.min(members.length, MAX_RECIPIENTS),
    tooMany: members.length > MAX_RECIPIENTS,
    sample: members.slice(0, 5).map((m) => ({
      id: m.id,
      name: m.fullName,
      contact: channel === "email" ? m.email : m.phone,
    })),
  };
}

export function memberVars(m: AudienceMember, store: string) {
  return {
    store_name: store,
    customer_name: m.fullName,
    customer_phone: m.phone,
    points: m.totalPoints.toLocaleString("vi-VN"),
    ranking: RANKING_LABEL[m.ranking] ?? m.ranking,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

const withCreator = { createdByUser: { select: { fullName: true } } } as const;

export async function listCampaigns(input: { page: number; limit: number; status?: string }) {
  const prisma = getPrisma();
  const where = input.status ? { status: input.status } : {};
  const [items, total] = await Promise.all([
    prisma.marketingCampaign.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: withCreator,
    }),
    prisma.marketingCampaign.count({ where }),
  ]);
  return {
    items: items.map((c) => ({
      ...c,
      channel: c.channel as "email" | "sms",
      audience: parseAudience(c.audience),
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function getCampaign(id: number) {
  const c = await getPrisma().marketingCampaign.findUnique({
    where: { id },
    include: withCreator,
  });
  if (!c) throw bizoneError("NOT_FOUND", `Chiến dịch #${id} không tồn tại`);
  return { ...c, channel: c.channel as "email" | "sms", audience: parseAudience(c.audience) };
}

export async function createCampaign(input: CreateCampaignInput, userId: number | null) {
  return getPrisma().marketingCampaign.create({
    data: {
      name: input.name,
      channel: input.channel,
      subject: input.channel === "email" ? input.subject : null,
      content: input.content,
      audience: JSON.stringify(input.audience),
      createdBy: userId,
    },
  });
}

export async function updateCampaign(input: UpdateCampaignInput) {
  const c = await getCampaign(input.id);
  if (c.status !== "draft")
    throw bizoneError("CONFLICT", "Chỉ sửa được chiến dịch ở trạng thái nháp");
  return getPrisma().marketingCampaign.update({
    where: { id: input.id },
    data: {
      name: input.name,
      channel: input.channel,
      subject: input.channel === "email" ? input.subject : null,
      content: input.content,
      audience: JSON.stringify(input.audience),
    },
  });
}

export async function deleteCampaign(id: number) {
  const c = await getCampaign(id);
  if (!["draft", "cancelled"].includes(c.status) || c.sentCount > 0)
    throw bizoneError("CONFLICT", "Chỉ xoá được chiến dịch nháp hoặc đã huỷ chưa gửi tin nào");
  await getPrisma().marketingCampaign.delete({ where: { id } });
  return { id };
}

/** Send now or at `scheduledAt` (VN wall time "YYYY-MM-DDTHH:mm") */
export async function sendCampaign(id: number, scheduledAt?: string) {
  const prisma = getPrisma();
  const c = await getCampaign(id);
  if (c.status !== "draft") throw bizoneError("CONFLICT", "Chiến dịch đã được gửi / lên lịch");
  const preview = await previewAudience(c.channel, c.audience);
  if (preview.count === 0)
    throw bizoneError(
      "VALIDATION_ERROR",
      "Không có khách hàng nào phù hợp và có thông tin liên hệ",
    );
  if (preview.tooMany)
    throw bizoneError(
      "VALIDATION_ERROR",
      `Tối đa ${MAX_RECIPIENTS.toLocaleString("vi-VN")} khách mỗi chiến dịch — thu hẹp đối tượng`,
    );
  let at: Date | null = null;
  if (scheduledAt) {
    at = new Date(`${scheduledAt}:00+07:00`);
    if (Number.isNaN(at.getTime()))
      throw bizoneError("VALIDATION_ERROR", "Thời gian hẹn gửi không hợp lệ");
    if (at.getTime() < Date.now() + 60_000)
      throw bizoneError("VALIDATION_ERROR", "Thời gian hẹn gửi phải sau hiện tại ít nhất 1 phút");
    if (at.getTime() > Date.now() + 60 * 86_400_000)
      throw bizoneError("VALIDATION_ERROR", "Chỉ hẹn gửi trong vòng 60 ngày");
  }
  const res = await prisma.marketingCampaign.updateMany({
    where: { id, status: "draft" },
    data: { status: at ? "scheduled" : "sending", scheduledAt: at, totalRecipients: preview.count },
  });
  if (res.count === 0) throw bizoneError("CONFLICT", "Chiến dịch vừa được gửi ở phiên khác");
  try {
    await enqueueCampaign(id, at ? at.getTime() - Date.now() : 0);
  } catch {
    await prisma.marketingCampaign.update({
      where: { id },
      data: { status: "draft", scheduledAt: null },
    });
    throw bizoneError("SERVICE_UNAVAILABLE", "Hàng đợi gửi đang lỗi — thử lại sau");
  }
  return getCampaign(id);
}

export async function cancelCampaign(id: number) {
  const res = await getPrisma().marketingCampaign.updateMany({
    where: { id, status: { in: ["scheduled", "sending"] } },
    data: { status: "cancelled", completedAt: new Date() },
  });
  if (res.count === 0)
    throw bizoneError("CONFLICT", "Chỉ huỷ được chiến dịch đang hẹn gửi hoặc đang gửi");
  return getCampaign(id);
}

// ─── Worker: send ────────────────────────────────────────────────────────────

async function stillRunning(id: number): Promise<boolean> {
  const c = await getPrisma().marketingCampaign.findUnique({
    where: { id },
    select: { status: true },
  });
  return c?.status === "sending";
}

export async function runCampaign(id: number) {
  const prisma = getPrisma();
  // scheduled → sending (a cancelled campaign stays cancelled)
  await prisma.marketingCampaign.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "sending" },
  });
  const c = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!c || c.status !== "sending") return { skipped: true };
  await prisma.marketingCampaign.update({
    where: { id },
    data: { startedAt: c.startedAt ?? new Date() },
  });

  const channel = c.channel as "email" | "sms";
  const members = (await audienceMembers(channel, parseAudience(c.audience))).slice(
    0,
    MAX_RECIPIENTS,
  );
  const done = new Set(
    (
      await prisma.notificationDelivery.findMany({
        where: { campaignId: id, status: "sent" },
        select: { customerId: true },
      })
    ).map((d) => d.customerId),
  );
  const store = await storeName();
  await prisma.marketingCampaign.update({
    where: { id },
    data: { totalRecipients: members.length },
  });

  let i = 0;
  let cancelled = false;
  for (const m of members) {
    if (done.has(m.id)) continue;
    if (i > 0 && i % 20 === 0) {
      if (!(await stillRunning(id))) {
        cancelled = true;
        break;
      }
      await refreshCounts(id);
    }
    i++;
    const vars = memberVars(m, store);
    await deliverOne(
      { campaignId: id, eventType: "campaign" },
      {
        channel,
        recipient: channel === "email" ? m.email! : normalizePhone(m.phone),
        templateCode: null,
        subject: c.subject ? renderTemplate(c.subject, vars).slice(0, 500) : null,
        text: renderTemplate(c.content, vars).trim(),
        customerId: m.id,
      },
      { store },
    );
  }
  const counts = await refreshCounts(id);
  if (!cancelled && (await stillRunning(id))) {
    await prisma.marketingCampaign.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
    await notify({
      type: "campaign_completed",
      title: `Chiến dịch "${c.name}" đã gửi xong: ${counts.sent}/${members.length}`,
      content: counts.failed ? `${counts.failed} tin gửi lỗi — xem lịch sử gửi` : null,
      link: "/marketing/campaigns",
      severity: counts.failed ? "warning" : "success",
      dedupeKey: `campaign:${id}`,
      vars: {
        campaign_name: c.name,
        sent: counts.sent,
        failed: counts.failed,
        total: members.length,
      },
    });
  }
  return { ...counts, total: members.length, cancelled };
}

async function refreshCounts(id: number) {
  const prisma = getPrisma();
  const grouped = await prisma.notificationDelivery.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const sent = grouped.find((g) => g.status === "sent")?._count._all ?? 0;
  const failed = grouped.find((g) => g.status === "failed")?._count._all ?? 0;
  await prisma.marketingCampaign.update({
    where: { id },
    data: { sentCount: sent, failedCount: failed },
  });
  return { sent, failed };
}
