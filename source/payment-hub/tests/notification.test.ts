import { beforeEach, describe, expect, it, vi } from "vitest";

const created: Record<string, unknown>[] = [];
const published: { type: string; data: unknown }[] = [];
const enqueued: bigint[] = [];
let settings: Record<string, unknown>[] = [];
const counters = new Map<string, number>();

vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  return {
    getPrisma: () => ({
      notificationSetting: { findMany: async () => settings },
      notification: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.dedupeKey && created.some((c) => c.dedupeKey === data.dedupeKey)) {
            throw new Prisma.PrismaClientKnownRequestError("dup", {
              code: "P2002",
              clientVersion: "7",
            });
          }
          created.push(data);
          return { id: BigInt(created.length), createdAt: new Date(), ...data };
        },
        update: async () => ({}),
      },
    }),
  };
});
vi.mock("@/lib/events", async (orig) => ({
  ...(await orig<typeof import("@/lib/events")>()),
  publishEvent: async (type: string, data: unknown) => {
    published.push({ type, data });
  },
}));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    incr: async (k: string) => {
      counters.set(k, (counters.get(k) ?? 0) + 1);
      return counters.get(k)!;
    },
    expire: async () => 1,
  }),
}));
vi.mock("@/server/jobs/notificationQueue", () => ({
  enqueueNotificationEmail: async (id: bigint) => {
    enqueued.push(id);
  },
}));

const { effectiveSetting } = await import("@/services/notification/events");
const { canReceive } = await import("@/lib/events");
const { invalidateSettings, notify, notifyPaymentResult } =
  await import("@/services/notification/sender");

beforeEach(() => {
  created.length = 0;
  published.length = 0;
  enqueued.length = 0;
  counters.clear();
  settings = [];
  invalidateSettings();
  vi.stubEnv("NOTIFY_EMAILS", "ops@example.com");
});

describe("settings", () => {
  it("defaults, overrides, recipients", () => {
    expect(effectiveSetting("webhook.failed", null, ["a@x.vn"])).toMatchObject({
      inApp: true,
      email: true,
      threshold: 5,
      emailTo: ["a@x.vn"],
      customized: false,
    });
    expect(
      effectiveSetting(
        "webhook.failed",
        { inApp: false, email: true, threshold: 3, windowMinutes: null, emailTo: "b@x.vn; c@x.vn" },
        ["a@x.vn"],
      ),
    ).toMatchObject({
      inApp: false,
      threshold: 3,
      emailTo: ["b@x.vn", "c@x.vn"],
      customized: true,
    });
    // events without a threshold ignore a stored one
    expect(
      effectiveSetting("transaction.failed", {
        inApp: true,
        email: false,
        threshold: 9,
        windowMinutes: null,
        emailTo: null,
      }).threshold,
    ).toBeNull();
  });
});

describe("realtime audience", () => {
  const ev = (data: unknown) => ({ type: "notification.created", data, at: "" });
  it("admin-only notifications never reach viewers; merchant scoping kept", () => {
    expect(canReceive({ admin: false }, ev({ audience: "admin", merchantId: null }))).toBe(false);
    expect(canReceive({ admin: true }, ev({ audience: "admin", merchantId: null }))).toBe(true);
    expect(canReceive({ admin: false }, ev({ audience: "all", merchantId: 3 }))).toBe(true);
    expect(
      canReceive({ admin: false, merchantId: 2 }, ev({ audience: "all", merchantId: 3 })),
    ).toBe(false);
    expect(canReceive({ merchantId: 3 }, ev({ audience: "all", merchantId: 3 }))).toBe(true);
    // events without audience behave as before
    expect(canReceive({ admin: false }, ev({ merchantId: 1 }))).toBe(true);
  });
});

describe("notify", () => {
  it("stores, publishes in-app, queues e-mail; same dedupe key notifies once", async () => {
    const id = await notify("webhook.failed", { title: "x", dedupeKey: "webhook:1" });
    expect(id).toBe(BigInt(1));
    expect(await notify("webhook.failed", { title: "x", dedupeKey: "webhook:1" })).toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      event: "webhook.failed",
      audience: "admin",
      severity: "Error",
      inApp: true,
      emailStatus: "pending",
    });
    expect(published.map((p) => p.type)).toEqual(["notification.created"]);
    expect(enqueued).toEqual([BigInt(1)]);
  });

  it("respects channels: in-app off + e-mail on keeps history without realtime; both off = nothing", async () => {
    settings = [
      {
        event: "webhook.failed",
        inApp: false,
        email: true,
        threshold: 5,
        windowMinutes: null,
        emailTo: null,
      },
    ];
    await notify("webhook.failed", { title: "a" });
    expect(created[0]).toMatchObject({ inApp: false, emailStatus: "pending" });
    expect(published).toHaveLength(0);
    settings = [
      {
        event: "transaction.failed",
        inApp: false,
        email: false,
        threshold: null,
        windowMinutes: null,
        emailTo: null,
      },
    ];
    invalidateSettings();
    expect(await notify("transaction.failed", { title: "b" })).toBeNull();
    expect(created).toHaveLength(1);
  });

  it("e-mail is skipped without recipients", async () => {
    vi.stubEnv("NOTIFY_EMAILS", "");
    vi.stubEnv("DISPUTE_NOTIFY_EMAILS", "");
    await notify("connector.down", { title: "c" });
    expect(created[0]).toMatchObject({ emailStatus: "none", inApp: true });
    expect(enqueued).toHaveLength(0);
  });

  it("failed payments: notification + one suspicious alert when the IP threshold is reached", async () => {
    settings = [
      {
        event: "transaction.suspicious",
        inApp: true,
        email: false,
        threshold: 3,
        windowMinutes: 10,
        emailTo: null,
      },
    ];
    for (let i = 1; i <= 4; i++) {
      await notifyPaymentResult({
        id: i,
        txnCode: `TXN-${i}`,
        merchantId: 1,
        amount: 50_000,
        status: "Failed",
        error: "denied",
        ipAddress: "10.0.0.9",
      });
    }
    expect(created.filter((c) => c.event === "transaction.failed")).toHaveLength(4);
    const sus = created.filter((c) => c.event === "transaction.suspicious");
    expect(sus).toHaveLength(1);
    expect(sus[0]!.title).toBe("3 giao dịch thất bại từ cùng IP 10.0.0.9");
    expect(created[0]).toMatchObject({
      title: "Thanh toán 50.000₫ thất bại",
      merchantId: 1,
      audience: "all",
    });
  });
});
