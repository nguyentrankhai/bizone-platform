import { initTRPC, TRPCError } from "@trpc/server";
import { auditTrpcMutation, isAudited } from "@/server/middleware/auditLog";
import type { NextRequest } from "next/server";
import superjson from "superjson";
import { verifyJwt, extractBearerToken } from "@/lib/auth";
import { hasPermission, ForbiddenError } from "@/lib/rbac";
import { rateLimitGeneral, rateLimitPos } from "@/lib/rate-limit";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import type { AuthUser, Permission } from "@/types/auth";

// ─── Context ─────────────────────────────────────────────────────────────────

export interface TRPCContext {
  req: NextRequest;
  user: AuthUser | null;
  tenantId: string | null;
}

export async function createTRPCContext(req: NextRequest): Promise<TRPCContext> {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return { req, user: null, tenantId: null };

  const result = await verifyJwt(token);
  if (!result.ok) return { req, user: null, tenantId: null };

  const tenantId = req.headers.get("x-tenant-id");
  return { req, user: result.user, tenantId };
}

// ─── tRPC init ───────────────────────────────────────────────────────────────

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Unwrap BizOne error JSON from message if present
    try {
      const parsed = JSON.parse(error.message) as {
        code: string;
        message: string;
        details?: unknown;
      };
      return {
        ...shape,
        data: {
          ...shape.data,
          bizoneCode: parsed.code,
          bizoneMessage: parsed.message,
          bizoneDetails: parsed.details,
        },
      };
    } catch {
      return shape;
    }
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── Auth middleware ──────────────────────────────────────────────────────────

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing or invalid token" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const enforceTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Missing X-Tenant-ID header" });
  }
  if (ctx.user && ctx.tenantId !== ctx.user.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "X-Tenant-ID mismatch" });
  }
  const tenantId = ctx.tenantId;
  if (!isKnownTenant(tenantId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant is not provisioned" });
  }
  // Everything downstream (rate limit, RBAC, resolver, services) runs against this tenant's DB.
  return runWithTenant(tenantId, () => next({ ctx: { ...ctx, tenantId } }));
});

// ─── Rate-limit middleware ────────────────────────────────────────────────────

const enforceRateLimit = (variant: "general" | "pos" = "general") =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || !ctx.tenantId) return next();

    const result =
      variant === "pos"
        ? await rateLimitPos(ctx.tenantId, ctx.user.id)
        : await rateLimitGeneral(ctx.tenantId, ctx.user.id);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded",
      });
    }
    return next();
  });

// ─── RBAC middleware factory ──────────────────────────────────────────────────

const enforcePermission = (permission: Permission) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    try {
      if (!hasPermission(ctx.user, permission)) {
        throw new ForbiddenError(`Required permission: ${permission}`);
      }
    } catch (e) {
      if (e instanceof ForbiddenError) {
        throw new TRPCError({ code: "FORBIDDEN", message: e.message });
      }
      throw e;
    }
    return next();
  });

// ─── Audit middleware ─────────────────────────────────────────────────────────

/** Records successful mutations listed in server/middleware/auditLog.ts (after tenant is set) */
const auditMutations = t.middleware(async ({ ctx, path, type, getRawInput, next }) => {
  const result = await next();
  if (type === "mutation" && result.ok && isAudited(path)) {
    const input = await getRawInput().catch(() => undefined);
    await auditTrpcMutation(path, { req: ctx.req, user: ctx.user }, input, result.data);
  }
  return result;
});

// ─── Procedure builders ───────────────────────────────────────────────────────

/** Requires valid JWT + X-Tenant-ID + rate limit */
export const protectedProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceTenant)
  .use(enforceRateLimit("general"))
  .use(auditMutations);

/** protectedProcedure + higher rate limit for POS */
export const posProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceTenant)
  .use(enforceRateLimit("pos"))
  .use(auditMutations);

/** Factory: protectedProcedure + specific RBAC permission check */
export const permissionProcedure = (permission: Permission) =>
  protectedProcedure.use(enforcePermission(permission));

/** posProcedure (300 req/min) + specific RBAC permission check */
export const posPermissionProcedure = (permission: Permission) =>
  posProcedure.use(enforcePermission(permission));
