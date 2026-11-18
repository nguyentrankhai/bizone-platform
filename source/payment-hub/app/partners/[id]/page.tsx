import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { PartnerForm } from "@/components/ph/PartnerForm";
import { getPartner, listPartnerLogs } from "@/server/services/partner.service";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";

export const instant = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

/** /partners/new → create form; /partners/{id} → edit, test, activate, change history. */
export default async function PartnerPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const session = await pageSession({ globalOnly: true });
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const appUrl = process.env.APP_URL ?? "http://localhost:4000";

  if (id === "new") {
    return (
      <PHLayout>
        <PartnerForm
          partner={null}
          initialLogs={null}
          canWrite={session.canWrite}
          appUrl={appUrl}
        />
      </PHLayout>
    );
  }

  const numId = Number(id);
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound();
  const partner = await getPartner(numId);
  if (!partner) notFound();
  const logs = await listPartnerLogs(numId);

  return (
    <PHLayout>
      <PartnerForm
        partner={partner}
        initialLogs={logs}
        canWrite={session.canWrite}
        appUrl={appUrl}
      />
    </PHLayout>
  );
}
