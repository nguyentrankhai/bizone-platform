import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin } from "@/server/middleware/adminAuth";
import { NOTIFICATION_EVENT_KEYS } from "@/services/notification/events";
import {
  SettingsError,
  getSettings,
  listNotifications,
  markRead,
  updateSettings,
  type Viewer,
} from "@/server/services/notification.service";

/**
 * Notification center API (P7.3):
 *   GET  /api/internal/notifications?unread=1&event&severity&page&limit   (admin + viewer)
 *   POST /api/internal/notifications/read  { ids: string[] } | { all: true }  (own read state)
 *   GET  /api/internal/notifications/settings                              (payhub-admin)
 *   PUT  /api/internal/notifications/settings { events: [...] }            (payhub-admin, audited)
 */

function ok(data: unknown, meta?: unknown): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

function viewerOf(req: NextRequest, write = false): Viewer | Response {
  const auth = write ? requireAdmin(req, ADMIN_WRITE_ROLES) : requireAdmin(req);
  if (auth instanceof Response) return auth;
  return {
    sub: auth.userId,
    admin: auth.roles.includes("payhub-admin"),
    merchantId: auth.merchantId,
  };
}

const EVENT = z.enum(NOTIFICATION_EVENT_KEYS as [string, ...string[]]);
const SEVERITY = z.enum(["Success", "Warning", "Error", "Info"]);

export async function handleListNotifications(req: NextRequest): Promise<Response> {
  const v = viewerOf(req);
  if (v instanceof Response) return v;
  const q = req.nextUrl.searchParams;
  const event = q.get("event") || undefined;
  const severity = q.get("severity") || undefined;
  if (event && !EVENT.safeParse(event).success)
    return err("VALIDATION_ERROR", "event không hợp lệ", 400);
  if (severity && !SEVERITY.safeParse(severity).success) {
    return err("VALIDATION_ERROR", "severity không hợp lệ", 400);
  }
  const page = Math.max(1, Math.floor(Number(q.get("page")) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.get("limit")) || 20)));
  const { items, total, unread } = await listNotifications(v, {
    unread: q.get("unread") === "1",
    event,
    severity,
    page,
    limit,
  });
  return ok(items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    unread,
  });
}

const readSchema = z.union([
  z.object({
    ids: z
      .array(z.string().regex(/^\d{1,19}$/))
      .min(1)
      .max(500),
  }),
  z.object({ all: z.literal(true) }),
]);

export async function handleMarkRead(req: NextRequest): Promise<Response> {
  const v = viewerOf(req);
  if (v instanceof Response) return v;
  const parsed = readSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return err("VALIDATION_ERROR", "Body phải là { ids: [...] } hoặc { all: true }", 400);
  const marked = await markRead(v, "all" in parsed.data ? "all" : parsed.data.ids);
  return ok({ marked });
}

export async function handleGetSettings(req: NextRequest): Promise<Response> {
  const v = viewerOf(req, true);
  if (v instanceof Response) return v;
  if (v.merchantId !== undefined) return err("FORBIDDEN", "Not available to merchant users", 403);
  return ok(await getSettings());
}

const settingsSchema = z.object({
  events: z
    .array(
      z.object({
        event: EVENT,
        inApp: z.boolean(),
        email: z.boolean(),
        threshold: z.number().int().min(1).max(10_000).nullish(),
        windowMinutes: z.number().int().min(1).max(1440).nullish(),
        emailTo: z.string().trim().max(500).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

export async function handlePutSettings(req: NextRequest): Promise<Response> {
  const v = viewerOf(req, true);
  if (v instanceof Response) return v;
  if (v.merchantId !== undefined) return err("FORBIDDEN", "Not available to merchant users", 403);
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err(
      "VALIDATION_ERROR",
      "Cấu hình không hợp lệ",
      400,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  try {
    const username = req.headers.get("x-user-username") || v.sub;
    return ok(
      await updateSettings(parsed.data.events as Parameters<typeof updateSettings>[0], username),
    );
  } catch (e) {
    if (e instanceof SettingsError) return err("VALIDATION_ERROR", e.message, 400, e.details);
    throw e;
  }
}
