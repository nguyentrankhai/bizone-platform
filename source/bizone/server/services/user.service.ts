import { getPrisma } from "@/lib/prisma";
import type { AuthUser } from "@/types/auth";

function matchUser(user: AuthUser) {
  return { OR: [{ username: user.username }, ...(user.email ? [{ email: user.email }] : [])] };
}

/**
 * Map a Keycloak user (sub is a UUID) to the numeric `users.id` used by
 * `created_by` / `approved_by` columns. Matches on username or email;
 * returns null when the user has no local record yet (columns are nullable).
 */
export async function resolveDbUserId(user: AuthUser): Promise<number | null> {
  const prisma = getPrisma();
  const found = await prisma.user.findFirst({ where: matchUser(user), select: { id: true } });
  return found?.id ?? null;
}

/**
 * Like resolveDbUserId, but creates the local `users` row on first use for
 * tables whose user column is NOT NULL (cash_sessions, invoices).
 * Keycloak owns credentials, so the local password hash is a non-usable marker.
 */
export async function ensureDbUserId(user: AuthUser): Promise<number> {
  const existing = await resolveDbUserId(user);
  if (existing) return existing;
  const prisma = getPrisma();
  try {
    const created = await prisma.user.create({
      data: {
        username: user.username,
        fullName: user.name ?? user.username,
        email: user.email ?? null,
        passwordHash: "!keycloak",
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    // Concurrent first requests: the other one created it
    const again = await resolveDbUserId(user);
    if (again) return again;
    throw new Error(`Không tạo được hồ sơ người dùng cho ${user.username}`);
  }
}
