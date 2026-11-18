import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { rankingRule } from "@/lib/pos/cart";
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILS } from "@/lib/omni/website";
import { hashPassword, newCustomerToken, newOtp, sha256, verifyPassword } from "@/lib/omni/secrets";
import { sendSms, smsProvider } from "@/server/services/sms.service";
import { generateCustomerCode } from "@/server/services/customer.service";
import { recordAudit } from "@/server/services/auditLog.service";

/**
 * Website customer accounts (P6.1). A login belongs to a CRM customer (`customer_accounts`):
 * phone + password (scrypt). Registration proves the phone with a one-time SMS code, so a
 * customer who already shops at the counter keeps his points and ranking online.
 * Sessions: opaque token `cst_…`, only its SHA-256 in Redis (`store:sess:{tenant}:{hash}`).
 */

const OTP_TTL = 600; // 10 minutes
const OTP_MAX_TRIES = 5;
const SESSION_TTL = 30 * 86_400; // 30 days

const otpKey = (phone: string) => `store:otp:${currentTenantId()}:${phone}`;
const sessionKey = (token: string) => `store:sess:${currentTenantId()}:${sha256(token)}`;

/** Dev only: echo the code when no SMS gateway is configured (`STORE_OTP_DEV_ECHO=true`) */
const devEcho = () => process.env.STORE_OTP_DEV_ECHO === "true" && smsProvider() === "log";

export async function startRegistration(phone: string, storeName: string) {
  const prisma = getPrisma();
  const existing = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, isActive: true, account: { select: { id: true } } },
  });
  if (existing?.account)
    throw bizoneError("CONFLICT", "Số điện thoại đã có tài khoản — vui lòng đăng nhập");
  if (existing && !existing.isActive)
    throw bizoneError("FORBIDDEN", "Tài khoản khách hàng đã bị khoá, liên hệ cửa hàng");

  const limit = await rateLimit(`rl:store:otp:${currentTenantId()}:${phone}`, 3, 600);
  if (!limit.allowed)
    throw bizoneError("RATE_LIMITED", "Đã gửi quá 3 mã trong 10 phút, thử lại sau");

  const code = newOtp();
  await getRedis().set(
    otpKey(phone),
    JSON.stringify({ hash: sha256(code), tries: 0 }),
    "EX",
    OTP_TTL,
  );
  try {
    await sendSms(phone, `${storeName}: ma xac nhan dang ky cua ban la ${code} (hieu luc 10 phut)`);
  } catch (err) {
    console.error("[store] OTP SMS failed:", err instanceof Error ? err.message : err);
    throw bizoneError("SERVICE_UNAVAILABLE", "Không gửi được tin nhắn mã xác nhận, thử lại sau");
  }
  return { sent: true, expiresIn: OTP_TTL, ...(devEcho() ? { devCode: code } : {}) };
}

async function checkOtp(phone: string, code: string) {
  const redis = getRedis();
  const raw = await redis.get(otpKey(phone));
  if (!raw) throw bizoneError("VALIDATION_ERROR", "Mã xác nhận đã hết hạn — gửi lại mã");
  const rec = JSON.parse(raw) as { hash: string; tries: number };
  if (rec.hash !== sha256(code)) {
    rec.tries += 1;
    if (rec.tries >= OTP_MAX_TRIES) await redis.del(otpKey(phone));
    else await redis.set(otpKey(phone), JSON.stringify(rec), "KEEPTTL");
    throw bizoneError(
      "VALIDATION_ERROR",
      rec.tries >= OTP_MAX_TRIES ? "Sai mã quá 5 lần — gửi lại mã" : "Mã xác nhận không đúng",
    );
  }
  await redis.del(otpKey(phone));
}

async function openSession(customerId: number) {
  const token = newCustomerToken();
  await getRedis().set(sessionKey(token), String(customerId), "EX", SESSION_TTL);
  return token;
}

export async function completeRegistration(input: {
  phone: string;
  code: string;
  fullName: string;
  email?: string | null;
  password: string;
}) {
  await checkOtp(input.phone, input.code);
  const prisma = getPrisma();
  const passwordHash = await hashPassword(input.password);
  const customer = await prisma.$transaction(async (tx) => {
    let c = await tx.customer.findUnique({
      where: { phone: input.phone },
      select: { id: true, account: { select: { id: true } } },
    });
    if (c?.account)
      throw bizoneError("CONFLICT", "Số điện thoại đã có tài khoản — vui lòng đăng nhập");
    if (!c) {
      c = await tx.customer.create({
        data: {
          code: generateCustomerCode(),
          fullName: input.fullName,
          phone: input.phone,
          email: input.email || null,
          notes: "Đăng ký trên website",
        },
        select: { id: true, account: { select: { id: true } } },
      });
    } else if (input.email) {
      await tx.customer.updateMany({
        where: { id: c.id, email: null },
        data: { email: input.email },
      });
    }
    await tx.customerAccount.create({ data: { customerId: c.id, passwordHash } });
    return c;
  });
  await recordAudit({
    userId: null,
    module: "omni",
    action: "customer_register",
    entityType: "customer",
    entityId: customer.id,
    newValue: { channel: "website" },
  });
  return { token: await openSession(customer.id), customer: await customerProfile(customer.id) };
}

export async function login(phone: string, password: string) {
  const prisma = getPrisma();
  const account = await prisma.customerAccount.findFirst({
    where: { customer: { phone } },
    include: { customer: { select: { isActive: true } } },
  });
  const invalid = () => bizoneError("UNAUTHORIZED", "Số điện thoại hoặc mật khẩu không đúng");
  if (!account) {
    await verifyPassword(
      password,
      "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    );
    throw invalid();
  }
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    const mins = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60_000);
    throw bizoneError(
      "RATE_LIMITED",
      `Tài khoản tạm khoá do sai mật khẩu nhiều lần, thử lại sau ${mins} phút`,
    );
  }
  if (!account.customer.isActive)
    throw bizoneError("FORBIDDEN", "Tài khoản đã bị khoá, liên hệ cửa hàng");
  if (!(await verifyPassword(password, account.passwordHash))) {
    const fails = account.failedAttempts + 1;
    await prisma.customerAccount.update({
      where: { id: account.id },
      data:
        fails >= LOGIN_MAX_FAILS
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) }
          : { failedAttempts: fails },
    });
    if (fails >= LOGIN_MAX_FAILS)
      throw bizoneError(
        "RATE_LIMITED",
        `Sai mật khẩu ${LOGIN_MAX_FAILS} lần — tài khoản tạm khoá ${LOGIN_LOCK_MINUTES} phút`,
      );
    throw invalid();
  }
  await prisma.customerAccount.update({
    where: { id: account.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return {
    token: await openSession(account.customerId),
    customer: await customerProfile(account.customerId),
  };
}

export async function logout(token: string) {
  await getRedis().del(sessionKey(token));
}

/** Customer id of a session token (null = no / expired session) */
export async function customerOfToken(token: string | null | undefined): Promise<number | null> {
  if (!token || !token.startsWith("cst_")) return null;
  const id = Number(await getRedis().get(sessionKey(token)));
  if (!Number.isInteger(id) || id <= 0) return null;
  const c = await getPrisma().customer.findUnique({ where: { id }, select: { isActive: true } });
  return c?.isActive ? id : null;
}

export async function customerProfile(customerId: number) {
  const c = await getPrisma().customer.findUniqueOrThrow({
    where: { id: customerId },
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      email: true,
      ranking: true,
      totalPoints: true,
      totalSpent: true,
      customerAddresses: {
        select: { id: true, address: true, isDefault: true },
        orderBy: { id: "desc" },
      },
    },
  });
  const rule = rankingRule(c.ranking);
  return {
    id: c.id,
    code: c.code,
    fullName: c.fullName,
    phone: c.phone,
    email: c.email,
    ranking: c.ranking,
    memberDiscountPercent: rule.discountPercent,
    pointMultiplier: rule.pointMultiplier,
    totalPoints: c.totalPoints,
    totalSpent: Number(c.totalSpent),
    addresses: c.customerAddresses,
  };
}

export async function pointHistory(customerId: number, page: number, limit: number) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    getPrisma().customerLoyaltyPoint.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, points: true, type: true, notes: true, createdAt: true },
    }),
    getPrisma().customerLoyaltyPoint.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    page,
    limit,
  };
}
