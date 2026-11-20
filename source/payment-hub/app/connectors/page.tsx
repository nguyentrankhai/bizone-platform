import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { ConnectorsClient } from "@/components/ph/ConnectorsClient";
import { listConnectors } from "@/server/services/connector.service";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";

export const instant = false;

/** /connectors — Connector Manager (P7.1): built-in + plugin connectors, upload, hot-plug. */
export default async function ConnectorsPage() {
  await connection();
  const session = await pageSession({ globalOnly: true });
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const connectors = await listConnectors();
  return (
    <PHLayout>
      <ConnectorsClient initial={connectors} canWrite={session.canWrite} />
    </PHLayout>
  );
}
