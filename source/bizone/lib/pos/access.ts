/**
 * Who may use a cash session (QA-3 #93, #94) — pure, shared by the POS WebSocket and tRPC.
 *
 * - The session's branch must be one the user may access (P4.6 branch scope) → else "none".
 * - The cashier who opened the shift, and managers (admin / manager role) of that branch, may
 *   change it ("write": cart, parked bills, payment, QR on the customer display).
 * - Other staff of the branch only watch it ("read").
 */
export type SessionAccess = "none" | "read" | "write";

/** Keycloak realm roles allowed to act on other cashiers' shifts */
export const POS_MANAGER_ROLES = ["bizone-admin", "bizone-manager"] as const;

export function isPosManager(roles: readonly string[]): boolean {
  return roles.some((r) => (POS_MANAGER_ROLES as readonly string[]).includes(r));
}

export function sessionAccess(input: {
  /** Branches the user may access (BranchScope.allowed) */
  allowedBranchIds: readonly number[];
  sessionBranchId: number;
  sessionUserId: number;
  /** Local users.id of the caller (null when they have no staff row yet) */
  userId: number | null;
  canManage: boolean;
  canWrite: boolean;
}): SessionAccess {
  if (!input.allowedBranchIds.includes(input.sessionBranchId)) return "none";
  if (!input.canWrite) return "read";
  if (input.canManage) return "write";
  return input.userId !== null && input.userId === input.sessionUserId ? "write" : "read";
}
