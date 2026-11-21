import type { NextRequest } from "next/server";
import { handleGetSettings, handlePutSettings } from "@/server/routes/notification";
import { withAudit } from "@/services/audit/logger";
import { notificationSettingsSnapshot } from "@/services/audit/snapshots";

export async function GET(req: NextRequest): Promise<Response> {
  return handleGetSettings(req);
}

export async function PUT(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "notification.settings",
      entityType: "notification_settings",
      before: () => notificationSettingsSnapshot(),
    },
    () => handlePutSettings(req),
  );
}
