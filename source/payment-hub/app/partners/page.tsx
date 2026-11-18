import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { PartnersClient } from "@/components/ph/PartnersClient";
import { listPartners } from "@/server/services/partner.service";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";

export const instant = false;

export default async function PartnersPage() {
  await connection();
  const partners = await listPartners();
  const session = await pageSession({ globalOnly: true });
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  return (
    <PHLayout>
      <PartnersClient initial={partners} canWrite={session.canWrite} />
    </PHLayout>
  );
}
