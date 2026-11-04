import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { WebhooksClient } from "@/components/ph/WebhooksClient";
import { getPrisma } from "@/lib/prisma";
import { devTokenCanWrite, getDevAuthToken } from "@/lib/dev-auth";
import { listWebhookConfigs, webhookStats } from "@/server/services/webhook.service";

export const instant = false;

export default async function WebhooksPage() {
  await connection();
  const token = getDevAuthToken();
  const [configs, stats, merchants] = await Promise.all([
    listWebhookConfigs({}),
    webhookStats(24, {}),
    getPrisma().merchant.findMany({
      where: { status: "Active" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return (
    <PHLayout>
      <WebhooksClient
        initialConfigs={configs}
        initialStats={stats}
        merchants={merchants}
        authToken={token}
        canWrite={devTokenCanWrite(token)}
      />
    </PHLayout>
  );
}
