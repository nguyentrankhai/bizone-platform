import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { AuditLogClient } from "@/components/ph/AuditLogClient";
import { SessionGate } from "@/components/auth/AuthProvider";
import { pageSession } from "@/lib/page-session";
import { parseRange } from "@/lib/report";
import { auditOptions, listSystemLogs } from "@/server/services/audit.service";

export const instant = false;

const LIMIT = 50;

/** /audit-log (P7.2) — `payhub-admin` only (SRS: Audit → Admin). */
export default async function AuditLogPage() {
  await connection();
  const session = await pageSession({ globalOnly: true });
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  if (!session.canWrite) {
    return (
      <PHLayout>
        <SessionGate
          reason="forbidden"
          message="Chỉ quản trị viên (payhub-admin) xem được Audit Log."
        />
      </PHLayout>
    );
  }
  const r = parseRange(null, null);
  if (!r.ok) throw new Error(r.message);
  const [{ items, total }, options] = await Promise.all([
    listSystemLogs({ range: r.range }, 1, LIMIT),
    auditOptions(),
  ]);
  return (
    <PHLayout>
      <AuditLogClient
        initial={{
          items,
          meta: { page: 1, limit: LIMIT, total, totalPages: Math.max(1, Math.ceil(total / LIMIT)) },
        }}
        initialQuery={{ kind: "system", from: r.range.from, to: r.range.to, page: 1 }}
        options={options}
      />
    </PHLayout>
  );
}
