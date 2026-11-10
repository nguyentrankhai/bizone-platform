import { connection, type NextRequest } from "next/server";
import { errorResponse, okResponse } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { pairDisplaySchema } from "@/lib/validators/pos";
import { getPrisma } from "@/lib/prisma";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import { redeemPairingPin, resolveDisplayToken } from "@/server/services/posPairing.service";

/**
 * POST /api/pos/pair — màn hình khách đổi mã PIN (do thu ngân tạo) lấy token màn hình.
 * Public (the display has no login); the PIN is single use, valid 5 minutes, and attempts are
 * limited per IP so the 6-digit space can't be brute-forced.
 */
const ATTEMPTS_PER_MINUTE = 10;

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  await connection();
  const limit = await rateLimit(`rl:pos-pair:${clientIp(req)}`, ATTEMPTS_PER_MINUTE, 60);
  if (!limit.allowed)
    return errorResponse(429, "RATE_LIMITED", "Nhập sai quá nhiều lần, thử lại sau 1 phút");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ");
  }
  const parsed = pairDisplaySchema.safeParse(body);
  if (!parsed.success)
    return errorResponse(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Mã PIN sai");

  const grant = await redeemPairingPin(parsed.data.pin);
  if (!grant) return errorResponse(404, "NOT_FOUND", "Mã PIN không đúng, đã dùng hoặc đã hết hạn");
  return okResponse(grant);
}

/**
 * GET /api/pos/pair — a paired display checks its token (`Authorization: Bearer pdt_…`) when its
 * WebSocket keeps failing: `valid: false` → pair again; `valid: true` → the WS server is just down.
 */
export async function GET(req: NextRequest) {
  await connection();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const grant = await resolveDisplayToken(token);
  if (!grant || !isKnownTenant(grant.tenantId)) return okResponse({ valid: false });
  const session = await runWithTenant(grant.tenantId, () =>
    getPrisma().cashSession.findUnique({
      where: { id: grant.sessionId },
      select: { status: true },
    }),
  );
  return okResponse({ valid: session?.status === "open", sessionId: grant.sessionId });
}
