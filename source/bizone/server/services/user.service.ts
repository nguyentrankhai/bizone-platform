import { getPrisma } from "@/lib/prisma";
import type { AuthUser } from "@/types/auth";

/**
 * Map a Keycloak user (sub is a UUID) to the numeric `users.id` used by
 * `created_by` / `approved_by` columns. Matches on username or email;
 * returns null when the user has no local record yet (columns are nullable).
 */
export async function resolveDbUserId(user: AuthUser): Promise<number | null> {
  const prisma = getPrisma();
  const found = await prisma.user.findFirst({
    where: {
      OR: [{ username: user.username }, ...(user.email ? [{ email: user.email }] : [])],
    },
    select: { id: true },
  });
  return found?.id ?? null;
}
