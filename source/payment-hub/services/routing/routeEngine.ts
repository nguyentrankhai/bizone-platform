import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { PartnerConfig } from "@/generated/prisma/client";
import { definitionForConnectorType } from "@/services/connectors/registry";
import {
  PAYMENT_METHODS,
  amountError,
  routeFor,
  type PaymentMethod,
  type RouteMethod,
} from "./routeMap";

/**
 * Route Engine (P3.8, SRS §3.3.4) — picks the partner (partner_configs row) that serves a
 * transaction's payment_method, with fallback and graceful degradation:
 *
 *  1. Candidates = partner configs of the method's connector type that are `Active`, whose
 *     connector is enabled (connectors.is_active) and implemented in this build.
 *  2. Order = the merchant's priority list (merchant_routes, lower priority first; rows with
 *     is_enabled = 0 are removed), then the remaining Active configs by id (fallback).
 *  3. Partners whose circuit is open (≥ ROUTE_CB_FAILURES consecutive failures within
 *     ROUTE_CB_WINDOW_S) are skipped for ROUTE_CB_OPEN_S seconds.
 *  4. executeRoute() tries candidates in order: a partner error/timeout records a failure and
 *     moves to the next one; a business error (transaction expired, invalid input…) stops.
 *
 * Every lookup reads the DB (a few tiny tables), so activating / deactivating a partner or
 * changing a merchant's routes takes effect on the next request — no restart, no cache to
 * invalidate (hot-plug, SRS-PH-PARTNER-02-07). Partners are isolated from each other: one
 * failing partner only affects its own circuit.
 */

export type SkipReason =
  | "inactive"
  | "error_status"
  | "connector_disabled"
  | "connector_not_implemented"
  | "disabled_for_merchant"
  | "circuit_open";

export interface SkippedPartner {
  partnerConfigId: number;
  name: string;
  reason: SkipReason;
}

export interface RoutePlan {
  method: PaymentMethod;
  route: RouteMethod;
  merchantId: number | null;
  /** Partners to try, in order */
  candidates: PartnerConfig[];
  skipped: SkippedPartner[];
  /** The merchant has its own priority list for this method */
  merchantConfigured: boolean;
}

export interface RouteAttempt {
  partnerConfigId: number;
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface RouteOutcome<T> {
  result: T;
  partner: PartnerConfig;
  attempts: RouteAttempt[];
  /** true when the first candidate failed and a later one served the request */
  fallbackUsed: boolean;
}

export class NoRouteError extends Error {
  constructor(
    public readonly method: string,
    public readonly reason: "unknown_method" | "no_partner" | "all_failed",
    public readonly skipped: SkippedPartner[] = [],
    public readonly attempts: RouteAttempt[] = [],
  ) {
    super(
      reason === "unknown_method"
        ? `Unsupported payment method: ${method}`
        : reason === "no_partner"
          ? `No available partner for ${method}`
          : `All partners failed for ${method}`,
    );
    this.name = "NoRouteError";
  }
}

// ─── Circuit breaker (lightweight, Redis) ─────────────────────────────────────

const CB_FAILURES = Number(process.env.ROUTE_CB_FAILURES ?? 5);
const CB_WINDOW_MS = Number(process.env.ROUTE_CB_WINDOW_S ?? 60) * 1000;
const CB_OPEN_MS = Number(process.env.ROUTE_CB_OPEN_S ?? 30) * 1000;

const failKey = (id: number) => `payhub:route:fail:${id}`;
const openKey = (id: number) => `payhub:route:open:${id}`;

async function bestEffort<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[route] redis: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** Partner ids whose circuit is currently open. Redis down → none (fail open). */
export async function openCircuits(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const values = await bestEffort(() => getRedis().mget(...ids.map(openKey)));
  return new Set(ids.filter((_, i) => values?.[i]));
}

/** Count a failure; opens the circuit after CB_FAILURES consecutive failures in the window. */
export async function recordPartnerFailure(id: number): Promise<boolean> {
  const opened = await bestEffort(async () => {
    const redis = getRedis();
    const count = await redis.incr(failKey(id));
    if (count === 1) await redis.pexpire(failKey(id), CB_WINDOW_MS);
    if (count < CB_FAILURES) return false;
    await redis
      .multi()
      .set(openKey(id), String(Date.now()), "PX", CB_OPEN_MS)
      .del(failKey(id))
      .exec();
    console.warn(`[route] circuit OPEN for partner config #${id} (${count} failures)`);
    return true;
  });
  return opened ?? false;
}

export async function recordPartnerSuccess(id: number): Promise<void> {
  await bestEffort(() => getRedis().del(failKey(id)));
}

/** Admin: close a partner's circuit and clear its failure count. */
export async function resetCircuit(id: number): Promise<void> {
  await bestEffort(() => getRedis().del(failKey(id), openKey(id)));
}

export async function circuitState(
  ids: number[],
): Promise<Map<number, { open: boolean; failures: number; openMsLeft: number | null }>> {
  const out = new Map<number, { open: boolean; failures: number; openMsLeft: number | null }>();
  if (ids.length === 0) return out;
  const res = await bestEffort(async () => {
    const pipe = getRedis().multi();
    for (const id of ids) pipe.get(failKey(id)).pttl(openKey(id));
    return pipe.exec();
  });
  ids.forEach((id, i) => {
    const failures = Number(res?.[i * 2]?.[1] ?? 0) || 0;
    const ttl = Number(res?.[i * 2 + 1]?.[1] ?? -2);
    out.set(id, { open: ttl > 0, failures, openMsLeft: ttl > 0 ? ttl : null });
  });
  return out;
}

// ─── Planning (pure core) ─────────────────────────────────────────────────────

export interface MerchantRouteRow {
  paymentMethod: string;
  partnerConfigId: number;
  priority: number;
  isEnabled: boolean;
}

type PartnerRow = Pick<PartnerConfig, "id" | "name" | "connectorType" | "status">;

export interface PlanInput<P extends PartnerRow> {
  route: RouteMethod;
  method: string;
  /** All partner configs (any status / type) */
  partners: P[];
  /** This merchant's rows for this method */
  merchantRoutes: MerchantRouteRow[];
  connectorEnabled: boolean;
  implemented: boolean;
  open: Set<number>;
}

/** Order and filter candidates — no I/O, unit-tested. */
export function orderCandidates<P extends PartnerRow>(
  input: PlanInput<P>,
): { candidates: P[]; skipped: SkippedPartner[] } {
  const ofType = input.partners
    .filter((p) => p.connectorType === input.route.connectorType)
    .sort((a, b) => a.id - b.id);
  const rows = new Map(
    input.merchantRoutes
      .filter((r) => r.paymentMethod === input.method)
      .map((r) => [r.partnerConfigId, r]),
  );

  const skipped: SkippedPartner[] = [];
  const usable: P[] = [];
  for (const p of ofType) {
    const skip = (reason: SkipReason) =>
      skipped.push({ partnerConfigId: p.id, name: p.name, reason });
    if (!input.implemented) skip("connector_not_implemented");
    else if (!input.connectorEnabled) skip("connector_disabled");
    else if (p.status === "Error") skip("error_status");
    else if (p.status !== "Active") skip("inactive");
    else if (rows.get(p.id)?.isEnabled === false) skip("disabled_for_merchant");
    else if (input.open.has(p.id)) skip("circuit_open");
    else usable.push(p);
  }

  // Listed partners by (priority, id) first, then unlisted ones by id.
  const rank = (p: P) => {
    const r = rows.get(p.id);
    return r ? [0, r.priority, p.id] : [1, 0, p.id];
  };
  usable.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });
  return { candidates: usable, skipped };
}

// ─── Planning (DB) ────────────────────────────────────────────────────────────

export function isImplemented(route: RouteMethod): boolean {
  return route.kind === "qr"
    ? route.connectorType === "VietQR"
    : !!definitionForConnectorType(route.connectorType);
}

export interface RoutingContext {
  merchantId: number | null;
  partners: PartnerConfig[];
  merchantRoutes: MerchantRouteRow[];
  /** connectors.code → is_active (a missing row counts as enabled) */
  connectors: Map<string, boolean>;
  open: Set<number>;
}

/** Load everything routing needs in 3 queries + 1 Redis MGET. */
export async function loadRoutingContext(merchantId: number | null): Promise<RoutingContext> {
  const prisma = getPrisma();
  const [partners, merchantRoutes, connectors] = await Promise.all([
    prisma.partnerConfig.findMany({ orderBy: { id: "asc" } }),
    merchantId
      ? prisma.merchantRoute.findMany({
          where: { merchantId },
          select: { paymentMethod: true, partnerConfigId: true, priority: true, isEnabled: true },
        })
      : Promise.resolve([] as MerchantRouteRow[]),
    prisma.connector.findMany({ select: { code: true, isActive: true } }),
  ]);
  const open = await openCircuits(partners.filter((p) => p.status === "Active").map((p) => p.id));
  return {
    merchantId,
    partners,
    merchantRoutes,
    connectors: new Map(connectors.map((c) => [c.code, c.isActive])),
    open,
  };
}

export function planFromContext(ctx: RoutingContext, method: string): RoutePlan {
  const route = routeFor(method);
  if (!route) throw new NoRouteError(method, "unknown_method");
  const { candidates, skipped } = orderCandidates({
    route,
    method,
    partners: ctx.partners,
    merchantRoutes: ctx.merchantRoutes,
    connectorEnabled: ctx.connectors.get(route.connectorCode) ?? true,
    implemented: isImplemented(route),
    open: ctx.open,
  });
  return {
    method: method as PaymentMethod,
    route,
    merchantId: ctx.merchantId,
    candidates,
    skipped,
    merchantConfigured: ctx.merchantRoutes.some((r) => r.paymentMethod === method),
  };
}

export async function planRoute(merchantId: number | null, method: string): Promise<RoutePlan> {
  if (!routeFor(method)) throw new NoRouteError(method, "unknown_method");
  return planFromContext(await loadRoutingContext(merchantId), method);
}

/** Methods a merchant can use right now (at least one candidate), in route-map order. */
/** Methods with a usable partner for this merchant (and, when given, accepting `amount`). */
export async function availableMethods(
  merchantId: number | null,
  amount?: number,
): Promise<PaymentMethod[]> {
  const ctx = await loadRoutingContext(merchantId);
  return PAYMENT_METHODS.filter(
    (m) =>
      (amount === undefined || amountError(m, amount) === null) &&
      planFromContext(ctx, m).candidates.length > 0,
  );
}

// ─── Execution with fallback ──────────────────────────────────────────────────

const BUSINESS_ERROR_CODES = new Set(["NOT_FOUND", "CONFLICT", "VALIDATION_ERROR"]);

/** Errors about the transaction/input (not the partner) stop routing instead of falling back. */
export function isBusinessError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && BUSINESS_ERROR_CODES.has(code);
}

class PartnerTimeoutError extends Error {
  constructor(ms: number) {
    super(`Partner did not respond within ${ms} ms`);
    this.name = "PartnerTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PartnerTimeoutError(ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Run `attempt` against the plan's candidates in order until one succeeds.
 * Partner failures (exceptions, timeouts) are recorded for the circuit breaker and routing
 * falls back to the next candidate; business errors are re-thrown immediately.
 */
export async function executeRoute<T>(
  plan: RoutePlan,
  attempt: (partner: PartnerConfig) => Promise<T>,
): Promise<RouteOutcome<T>> {
  if (plan.candidates.length === 0) {
    throw new NoRouteError(plan.method, "no_partner", plan.skipped);
  }
  const attempts: RouteAttempt[] = [];
  for (const partner of plan.candidates) {
    const started = Date.now();
    try {
      const result = await withTimeout(attempt(partner), Math.max(1000, partner.timeout));
      attempts.push({
        partnerConfigId: partner.id,
        name: partner.name,
        ok: true,
        durationMs: Date.now() - started,
      });
      void recordPartnerSuccess(partner.id);
      if (attempts.length > 1) {
        console.warn(
          `[route] ${plan.method}: fell back to partner #${partner.id} after ${attempts.length - 1} failure(s)`,
        );
      }
      return { result, partner, attempts, fallbackUsed: attempts.length > 1 };
    } catch (e) {
      if (isBusinessError(e)) throw e;
      const message = e instanceof Error ? e.message : String(e);
      attempts.push({
        partnerConfigId: partner.id,
        name: partner.name,
        ok: false,
        durationMs: Date.now() - started,
        error: message,
      });
      console.error(`[route] ${plan.method}: partner #${partner.id} failed: ${message}`);
      await recordPartnerFailure(partner.id);
    }
  }
  throw new NoRouteError(plan.method, "all_failed", plan.skipped, attempts);
}
