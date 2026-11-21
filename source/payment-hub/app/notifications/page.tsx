import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { NotificationCenter } from "@/components/ph/NotificationCenter";
import { SessionGate } from "@/components/auth/AuthProvider";
import { pageSession } from "@/lib/page-session";
import { getSettings, listNotifications } from "@/server/services/notification.service";

export const instant = false;

/** /notifications (P7.3) — notification center; per-event settings for payhub-admin. */
export default async function NotificationsPage() {
  await connection();
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const viewer = {
    sub: session.user.id,
    admin: session.user.roles.includes("payhub-admin"),
    merchantId: session.merchantId,
  };
  const limit = 20;
  const [{ items, total, unread }, settings] = await Promise.all([
    listNotifications(viewer, { page: 1, limit }),
    session.canWrite ? getSettings() : Promise.resolve(null),
  ]);
  return (
    <PHLayout>
      <NotificationCenter
        initial={{
          items,
          meta: {
            page: 1,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            unread,
          },
        }}
        settings={settings as Parameters<typeof NotificationCenter>[0]["settings"]}
      />
    </PHLayout>
  );
}
