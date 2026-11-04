import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { PartnersClient } from "@/components/ph/PartnersClient";
import { listPartners } from "@/server/services/partner.service";
import { devTokenCanWrite, getDevAuthToken } from "@/lib/dev-auth";

export const instant = false;

export default async function PartnersPage() {
  await connection();
  const partners = await listPartners();
  const token = getDevAuthToken();
  return (
    <PHLayout>
      <PartnersClient initial={partners} authToken={token} canWrite={devTokenCanWrite(token)} />
    </PHLayout>
  );
}
