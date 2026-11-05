import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis stand-in for the circuit breaker (INCR / PEXPIRE / MULTI / DEL / MGET).
const store = new Map<string, string>();
vi.mock("@/lib/redis", () => {
  const multi = () => {
    const ops: (() => void)[] = [];
    const chain = {
      set: (k: string, v: string) => (ops.push(() => store.set(k, v)), chain),
      del: (...ks: string[]) => (ops.push(() => ks.forEach((k) => store.delete(k))), chain),
      exec: async () => ops.forEach((op) => op()),
    };
    return chain;
  };
  return {
    getRedis: () => ({
      incr: async (k: string) => {
        const n = Number(store.get(k) ?? 0) + 1;
        store.set(k, String(n));
        return n;
      },
      pexpire: async () => 1,
      del: async (...ks: string[]) => ks.forEach((k) => store.delete(k)),
      mget: async (...ks: string[]) => ks.map((k) => store.get(k) ?? null),
      multi,
    }),
  };
});

const {
  NoRouteError,
  executeRoute,
  isBusinessError,
  openCircuits,
  orderCandidates,
  recordPartnerFailure,
} = await import("@/services/routing/routeEngine");
const { ROUTE_MAP, isPaymentMethod, methodsForConnectorType } =
  await import("@/services/routing/routeMap");

type Status = "Active" | "Inactive" | "Error";
type P = { id: number; name: string; connectorType: string; status: Status; timeout: number };
const partner = (id: number, connectorType: string, status: Status = "Active"): P => ({
  id,
  name: `${connectorType} #${id}`,
  connectorType,
  status,
  timeout: 30_000,
});

const PARTNERS = [
  partner(1, "VNPay"),
  partner(2, "VietQR"),
  partner(3, "VNPay"),
  partner(4, "VNPay", "Inactive"),
  partner(5, "VNPay", "Error"),
  partner(6, "VietQR"),
];

const base = {
  partners: PARTNERS,
  merchantRoutes: [],
  connectorEnabled: true,
  implemented: true,
  open: new Set<number>(),
};

function plan(candidates: P[]) {
  return {
    method: "vnpay_qr" as const,
    route: ROUTE_MAP.vnpay_qr,
    merchantId: 1,
    candidates: candidates as never,
    skipped: [],
    merchantConfigured: false,
  };
}

beforeEach(() => store.clear());

describe("routeMap", () => {
  it("maps the PLAN methods to their connectors", () => {
    expect(ROUTE_MAP.vnpay_qr.connectorType).toBe("VNPay");
    expect(ROUTE_MAP.vnpay_atm.connectorType).toBe("VNPay");
    expect(ROUTE_MAP.momo_qr.connectorType).toBe("MoMo");
    expect(ROUTE_MAP.zalopay_qr.connectorType).toBe("ZaloPay");
    expect(ROUTE_MAP.vietqr).toMatchObject({ connectorType: "VietQR", kind: "qr" });
    expect(isPaymentMethod("vietqr")).toBe(true);
    expect(isPaymentMethod("paypal")).toBe(false);
    expect(isPaymentMethod("toString")).toBe(false);
    expect(methodsForConnectorType("VietQR")).toEqual(["vietqr"]);
  });
});

describe("orderCandidates", () => {
  it("default order: Active partners of the connector type by id; others skipped with reason", () => {
    const r = orderCandidates({ ...base, route: ROUTE_MAP.vnpay_qr, method: "vnpay_qr" });
    expect(r.candidates.map((p) => p.id)).toEqual([1, 3]);
    expect(r.skipped).toEqual([
      { partnerConfigId: 4, name: "VNPay #4", reason: "inactive" },
      { partnerConfigId: 5, name: "VNPay #5", reason: "error_status" },
    ]);
  });

  it("merchant priority first, unlisted Active partners after (fallback), disabled removed", () => {
    const r = orderCandidates({
      ...base,
      partners: [...PARTNERS, partner(7, "VNPay")],
      route: ROUTE_MAP.vnpay_qr,
      method: "vnpay_qr",
      merchantRoutes: [
        { paymentMethod: "vnpay_qr", partnerConfigId: 3, priority: 0, isEnabled: true },
        { paymentMethod: "vnpay_qr", partnerConfigId: 1, priority: 1, isEnabled: false },
        // another method's row must not leak in
        { paymentMethod: "vnpay_atm", partnerConfigId: 7, priority: 0, isEnabled: false },
      ],
    });
    expect(r.candidates.map((p) => p.id)).toEqual([3, 7]);
    expect(r.skipped).toContainEqual({
      partnerConfigId: 1,
      name: "VNPay #1",
      reason: "disabled_for_merchant",
    });
  });

  it("skips open circuits, disabled and unimplemented connectors", () => {
    const open = orderCandidates({
      ...base,
      route: ROUTE_MAP.vnpay_qr,
      method: "vnpay_qr",
      open: new Set([1]),
    });
    expect(open.candidates.map((p) => p.id)).toEqual([3]);
    expect(open.skipped[0]).toMatchObject({ partnerConfigId: 1, reason: "circuit_open" });

    const disabled = orderCandidates({
      ...base,
      route: ROUTE_MAP.vnpay_qr,
      method: "vnpay_qr",
      connectorEnabled: false,
    });
    expect(disabled.candidates).toEqual([]);
    expect(disabled.skipped.every((s) => s.reason === "connector_disabled")).toBe(true);

    const momo = orderCandidates({
      ...base,
      partners: [partner(9, "MoMo")],
      route: ROUTE_MAP.momo_qr,
      method: "momo_qr",
      implemented: false,
    });
    expect(momo.candidates).toEqual([]);
    expect(momo.skipped[0].reason).toBe("connector_not_implemented");
  });

  it("graceful degradation: VNPay all down does not affect VietQR", () => {
    const vnpayDown = PARTNERS.map((p) =>
      p.connectorType === "VNPay" ? { ...p, status: "Inactive" as const } : p,
    );
    const vn = orderCandidates({
      ...base,
      partners: vnpayDown,
      route: ROUTE_MAP.vnpay_qr,
      method: "vnpay_qr",
    });
    const qr = orderCandidates({
      ...base,
      partners: vnpayDown,
      route: ROUTE_MAP.vietqr,
      method: "vietqr",
    });
    expect(vn.candidates).toEqual([]);
    expect(qr.candidates.map((p) => p.id)).toEqual([2, 6]);
  });
});

describe("executeRoute", () => {
  it("uses the first partner when it works", async () => {
    const out = await executeRoute(
      plan([partner(1, "VNPay"), partner(3, "VNPay")]),
      async (p) => `url-${p.id}`,
    );
    expect(out.result).toBe("url-1");
    expect(out.fallbackUsed).toBe(false);
    expect(out.attempts).toHaveLength(1);
  });

  it("falls back to the next partner on a partner error and records the failure", async () => {
    const out = await executeRoute(plan([partner(1, "VNPay"), partner(3, "VNPay")]), async (p) => {
      if (p.id === 1) throw new Error("ECONNRESET");
      return `url-${p.id}`;
    });
    expect(out.result).toBe("url-3");
    expect(out.partner.id).toBe(3);
    expect(out.fallbackUsed).toBe(true);
    expect(out.attempts.map((a) => [a.partnerConfigId, a.ok])).toEqual([
      [1, false],
      [3, true],
    ]);
    expect(store.get("payhub:route:fail:1")).toBe("1");
  });

  it("falls back on timeout", async () => {
    const slow = { ...partner(1, "VNPay"), timeout: 1000 };
    const out = await executeRoute(plan([slow, partner(3, "VNPay")]), (p) =>
      p.id === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok"),
    );
    expect(out.partner.id).toBe(3);
    expect(out.attempts[0].error).toMatch(/1000 ms/);
  });

  it("business errors stop routing (no fallback, no circuit failure)", async () => {
    const conflict = Object.assign(new Error("Transaction has expired"), { code: "CONFLICT" });
    expect(isBusinessError(conflict)).toBe(true);
    expect(isBusinessError(new Error("x"))).toBe(false);
    const attempt = vi.fn(async () => {
      throw conflict;
    });
    await expect(
      executeRoute(plan([partner(1, "VNPay"), partner(3, "VNPay")]), attempt),
    ).rejects.toBe(conflict);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
  });

  it("no partner / all failed → NoRouteError", async () => {
    await expect(executeRoute(plan([]), async () => 1)).rejects.toMatchObject({
      reason: "no_partner",
    });
    const e = await executeRoute(plan([partner(1, "VNPay")]), async () => {
      throw new Error("down");
    }).catch((x) => x);
    expect(e).toBeInstanceOf(NoRouteError);
    expect(e.reason).toBe("all_failed");
    expect(e.attempts).toHaveLength(1);
  });
});

describe("circuit breaker", () => {
  it("opens after 5 consecutive failures; a success resets the count", async () => {
    for (let i = 0; i < 4; i++) expect(await recordPartnerFailure(1)).toBe(false);
    // success in between resets the consecutive count
    await executeRoute(plan([partner(1, "VNPay")]), async () => "ok");
    for (let i = 0; i < 4; i++) expect(await recordPartnerFailure(1)).toBe(false);
    expect((await openCircuits([1])).has(1)).toBe(false);
    expect(await recordPartnerFailure(1)).toBe(true);
    expect((await openCircuits([1, 3])).has(1)).toBe(true);
    expect((await openCircuits([1, 3])).has(3)).toBe(false);
  });
});
