import { createHash, randomBytes, randomInt } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { currentTenantId, isKnownTenant, runWithTenant } from "@/lib/tenant";
import type { PosActor } from "./cashSession.service";
import { publishPosEvent } from "./posEvents";
import { recordAudit } from "./auditLog.service";

/**
 * Ghép cặp màn hình khách bằng PIN (P4.5).
 *
 * The customer display can be another device with nobody logged in. The cashier creates a
 * 6-digit PIN (5 minutes, single use) for the open shift; the display types it on `/pos/display`
 * and gets a display token — read-only, bound to that tenant + shift — which it uses as the
 * WebSocket subprotocol token instead of a Keycloak token. Tokens are stored hashed.
 */

export const DISPLAY_TOKEN_PREFIX = "pdt_";
const PIN_TTL_SECONDS = 5 * 60;
const TOKEN_TTL_SECONDS = 16 * 60 * 60;

const pinKey = (pin: string) => `pos:pair:pin:${pin}`;
const tokenKey = (token: string) =>
  `pos:pair:token:${createHash("sha256").update(token).digest("hex")}`;

interface PinRecord {
  tenantId: string;
  sessionId: number;
  userId: number;
}

export interface DisplayGrant {
  tenantId: string;
  sessionId: number;
}

/** Thu ngân tạo PIN cho ca đang mở */
export async function createPairingPin(sessionId: number, actor: PosActor) {
  const session = await getPrisma().cashSession.findUnique({ where: { id: sessionId } });
  if (!session) throw bizoneError("NOT_FOUND", `Ca #${sessionId} không tồn tại`);
  if (session.status !== "open") throw bizoneError("CONFLICT", "Ca đã khóa");
  if (session.userId !== actor.userId && !actor.canManage)
    throw bizoneError("FORBIDDEN", "Không thể ghép màn hình cho ca của nhân viên khác");

  const record: PinRecord = { tenantId: currentTenantId(), sessionId, userId: actor.userId };
  const redis = getRedis();
  for (let i = 0; i < 20; i++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ok = await redis.set(pinKey(pin), JSON.stringify(record), "EX", PIN_TTL_SECONDS, "NX");
    if (ok === "OK") {
      return {
        pin,
        expiresAt: new Date(Date.now() + PIN_TTL_SECONDS * 1000).toISOString(),
      };
    }
  }
  throw bizoneError("SERVICE_UNAVAILABLE", "Không tạo được mã PIN, thử lại");
}

/**
 * Màn hình khách nhập PIN → token màn hình (một lần; PIN bị xoá ngay khi dùng).
 * Returns null for an unknown / expired PIN or a shift that is no longer open.
 */
export async function redeemPairingPin(pin: string) {
  const raw = await getRedis().getdel(pinKey(pin));
  if (!raw) return null;
  const rec = JSON.parse(raw) as PinRecord;
  if (!isKnownTenant(rec.tenantId)) return null;

  return runWithTenant(rec.tenantId, async () => {
    const prisma = getPrisma();
    const session = await prisma.cashSession.findUnique({
      where: { id: rec.sessionId },
      select: { status: true, branch: { select: { name: true } } },
    });
    if (!session || session.status !== "open") return null;
    const store = await prisma.storeConfig.findUnique({ where: { configKey: "store_name" } });

    const token = DISPLAY_TOKEN_PREFIX + randomBytes(32).toString("base64url");
    const grant: DisplayGrant = { tenantId: rec.tenantId, sessionId: rec.sessionId };
    await getRedis().set(tokenKey(token), JSON.stringify(grant), "EX", TOKEN_TTL_SECONDS);

    const pairedAt = new Date().toISOString();
    await publishPosEvent(rec.sessionId, { type: "display:paired", data: { pairedAt } });
    await recordAudit({
      userId: rec.userId,
      module: "pos",
      action: "display_pair",
      entityType: "cash_session",
      entityId: rec.sessionId,
      newValue: { pairedAt },
    });
    return {
      token,
      tenantId: rec.tenantId,
      sessionId: rec.sessionId,
      storeName: store?.configValue || "BizOne",
      branchName: session.branch.name,
    };
  });
}

/** WebSocket auth for a paired display; null when the token is unknown or expired */
export async function resolveDisplayToken(token: string): Promise<DisplayGrant | null> {
  if (!token.startsWith(DISPLAY_TOKEN_PREFIX)) return null;
  const raw = await getRedis().get(tokenKey(token));
  return raw ? (JSON.parse(raw) as DisplayGrant) : null;
}
