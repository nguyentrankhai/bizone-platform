import { z } from "zod";
import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { PAYMENT_METHODS, ROUTE_MAP, isPaymentMethod } from "@/services/routing/routeMap";
import {
  circuitState,
  isImplemented,
  loadRoutingContext,
  planFromContext,
  resetCircuit,
} from "@/services/routing/routeEngine";

/**
 * Admin API for the Route Engine (P3.8) — Keycloak JWT (proxy.ts) + role:
 *   GET    /api/internal/routes                       default routing (no merchant priority)
 *   GET    /api/internal/routes/{merchantId}          a merchant's priority list + effective route
 *   PUT    /api/internal/routes/{merchantId}          set priorities for the methods in the body
 *   DELETE /api/internal/routes/circuits/{partnerId}  close a partner's circuit breaker
 * Read: payhub-admin | payhub-viewer. Write: payhub-admin. A token bound to one merchant
 * (merchant_id claim) only sees/edits that merchant and cannot reset circuits (global).
 *
 * PUT body: { routes: [{ payment_method, partners: [{ partner_config_id, enabled? }] }] }
 * — array order = priority; `partners: []` removes the merchant's list for that method
 * (back to default order). Methods not in the body are left unchanged.
 */

function ok(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function authorize(
  req: NextRequest,
  write: boolean,
  merchantId: number | null,
): AdminContext | Response {
  const auth = write ? requireAdmin(req, ADMIN_WRITE_ROLES) : requireAdmin(req);
  if (auth instanceof Response) return auth;
  if (auth.merchantId !== undefined && auth.merchantId !== merchantId) {
    return err("FORBIDDEN", "Not allowed for this merchant", 403);
  }
  return auth;
}

const putSchema = z.object({
  routes: z
    .array(
      z.object({
        payment_method: z.string().refine(isPaymentMethod, "Unsupported payment_method"),
        partners: z
          .array(
            z.object({
              partner_config_id: z.number().int().positive(),
              enabled: z.boolean().default(true),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(PAYMENT_METHODS.length),
});

async function describeRoutes(merchantId: number | null) {
  const prisma = getPrisma();
  const merchant = merchantId
    ? await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, code: true, name: true, status: true },
      })
    : null;
  if (merchantId && !merchant) return null;

  const ctx = await loadRoutingContext(merchantId);
  const circuits = await circuitState(ctx.partners.map((p) => p.id));
  const partnerById = new Map(ctx.partners.map((p) => [p.id, p]));

  const methods = PAYMENT_METHODS.map((m) => {
    const route = ROUTE_MAP[m];
    const plan = planFromContext(ctx, m);
    return {
      payment_method: m,
      label: route.label,
      connector_type: route.connectorType,
      kind: route.kind,
      implemented: isImplemented(route),
      connector_enabled: ctx.connectors.get(route.connectorCode) ?? true,
      available: plan.candidates.length > 0,
      merchant_configured: plan.merchantConfigured,
      configured: ctx.merchantRoutes
        .filter((r) => r.paymentMethod === m)
        .sort((a, b) => a.priority - b.priority || a.partnerConfigId - b.partnerConfigId)
        .map((r) => ({
          partner_config_id: r.partnerConfigId,
          name: partnerById.get(r.partnerConfigId)?.name ?? null,
          priority: r.priority,
          enabled: r.isEnabled,
        })),
      route: plan.candidates.map((p, i) => ({
        order: i + 1,
        partner_config_id: p.id,
        name: p.name,
        environment: p.environment,
      })),
      skipped: plan.skipped.map((s) => ({
        partner_config_id: s.partnerConfigId,
        name: s.name,
        reason: s.reason,
      })),
    };
  });

  return {
    merchant,
    methods,
    partners: ctx.partners.map((p) => {
      const c = circuits.get(p.id);
      return {
        partner_config_id: p.id,
        name: p.name,
        connector_type: p.connectorType,
        status: p.status,
        environment: p.environment,
        circuit: {
          open: c?.open ?? false,
          failures: c?.failures ?? 0,
          open_ms_left: c?.openMsLeft ?? null,
        },
      };
    }),
  };
}

export async function handleGetDefaultRoutes(req: NextRequest): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  // A merchant-bound token sees its own merchant's effective routing.
  const data = await describeRoutes(auth.merchantId ?? null);
  return ok(data);
}

export async function handleGetMerchantRoutes(req: NextRequest, rawId: string): Promise<Response> {
  const merchantId = parseId(rawId);
  if (!merchantId) return err("NOT_FOUND", "Merchant not found", 404);
  const auth = authorize(req, false, merchantId);
  if (auth instanceof Response) return auth;
  const data = await describeRoutes(merchantId);
  if (!data) return err("NOT_FOUND", "Merchant not found", 404);
  return ok(data);
}

export async function handlePutMerchantRoutes(req: NextRequest, rawId: string): Promise<Response> {
  const merchantId = parseId(rawId);
  if (!merchantId) return err("NOT_FOUND", "Merchant not found", 404);
  const auth = authorize(req, true, merchantId);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Validation failed", 400, parsed.error.flatten());
  }

  const prisma = getPrisma();
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return err("NOT_FOUND", "Merchant not found", 404);

  const ids = parsed.data.routes.flatMap((r) => r.partners.map((p) => p.partner_config_id));
  const partners = await prisma.partnerConfig.findMany({
    where: { id: { in: ids } },
    select: { id: true, connectorType: true },
  });
  const typeOf = new Map(partners.map((p) => [p.id, p.connectorType]));

  const errors: Record<string, string> = {};
  const seenMethods = new Set<string>();
  parsed.data.routes.forEach((r, i) => {
    if (seenMethods.has(r.payment_method)) {
      errors[`routes.${i}.payment_method`] = "Duplicate payment_method";
    }
    seenMethods.add(r.payment_method);
    const expected = ROUTE_MAP[r.payment_method as keyof typeof ROUTE_MAP].connectorType;
    const seen = new Set<number>();
    r.partners.forEach((p, j) => {
      const key = `routes.${i}.partners.${j}.partner_config_id`;
      const type = typeOf.get(p.partner_config_id);
      if (!type) errors[key] = "Partner config not found";
      else if (type !== expected) errors[key] = `Partner is ${type}, method needs ${expected}`;
      else if (seen.has(p.partner_config_id)) errors[key] = "Duplicate partner";
      seen.add(p.partner_config_id);
    });
  });
  if (Object.keys(errors).length > 0) {
    return err("VALIDATION_ERROR", "Validation failed", 400, { fieldErrors: errors });
  }

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.routes) {
      await tx.merchantRoute.deleteMany({
        where: { merchantId, paymentMethod: r.payment_method },
      });
      if (r.partners.length > 0) {
        await tx.merchantRoute.createMany({
          data: r.partners.map((p, priority) => ({
            merchantId,
            paymentMethod: r.payment_method,
            partnerConfigId: p.partner_config_id,
            priority,
            isEnabled: p.enabled,
          })),
        });
      }
    }
  });
  console.info(
    `[route] merchant #${merchantId} routes updated by ${req.headers.get("x-user-username") ?? auth.userId}: ${parsed.data.routes.map((r) => r.payment_method).join(", ")}`,
  );

  return ok(await describeRoutes(merchantId));
}

export async function handleResetCircuit(req: NextRequest, rawId: string): Promise<Response> {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  if (auth.merchantId !== undefined) {
    return err("FORBIDDEN", "Partner circuits are not available to merchant users", 403);
  }
  const id = parseId(rawId);
  const exists = id && (await getPrisma().partnerConfig.findUnique({ where: { id } }));
  if (!id || !exists) return err("NOT_FOUND", "Partner config not found", 404);
  await resetCircuit(id);
  return ok({ partner_config_id: id, circuit: { open: false, failures: 0 } });
}
