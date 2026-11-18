import "server-only";
import { cookies } from "next/headers";
import { authenticateToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session-client";
import { ADMIN_READ_ROLES } from "@/server/middleware/adminAuth";
import type { PayhubAuthUser } from "@/types/auth";

export type PageSession =
  | {
      ok: true;
      user: PayhubAuthUser;
      /** Token bound to one merchant: every query on the page must be scoped to it */
      merchantId?: number;
      /** payhub-admin without a merchant binding (edit buttons) — the API enforces it again */
      canWrite: boolean;
    }
  | { ok: false; reason: "signin" | "forbidden"; message?: string };

/**
 * Session of an admin page (P6.7), from the `ph_session` cookie the browser keeps in step with
 * its Keycloak token. Pages render data only when `ok` — otherwise `<SessionGate>`.
 * `globalOnly`: pages not available to merchant-bound users (partners, webhooks, đối soát).
 */
export async function pageSession(opts: { globalOnly?: boolean } = {}): Promise<PageSession> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const result = await authenticateToken(token);
  if (!result.ok) return { ok: false, reason: "signin" };
  const { user } = result;
  if (!user.roles.some((r) => (ADMIN_READ_ROLES as readonly string[]).includes(r))) {
    return {
      ok: false,
      reason: "forbidden",
      message: `Tài khoản cần vai trò ${ADMIN_READ_ROLES.join(" hoặc ")}.`,
    };
  }
  let merchantId: number | undefined;
  if (user.merchantId) {
    merchantId = Number(user.merchantId);
    if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
      return { ok: false, reason: "forbidden", message: "Thuộc tính merchant_id không hợp lệ." };
    }
  }
  if (opts.globalOnly && merchantId !== undefined) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Trang này chỉ dành cho quản trị Payment Hub (không gắn merchant).",
    };
  }
  return {
    ok: true,
    user,
    merchantId,
    canWrite: user.roles.includes("payhub-admin") && merchantId === undefined,
  };
}
