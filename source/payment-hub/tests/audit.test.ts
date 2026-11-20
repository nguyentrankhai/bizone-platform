import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created: Record<string, unknown>[] = [];
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: BigInt(created.length), ...data };
      },
    },
  }),
}));

const {
  MAX_DATA_BYTES,
  auditEvents,
  recordAudit,
  retentionDays,
  sanitize,
  toStoredJson,
  withAudit,
} = await import("@/services/audit/logger");
const { toCsv } = await import("@/server/services/audit.service");

beforeEach(() => {
  created.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

function adminRequest(body?: unknown, method = "PUT") {
  return new Request("http://localhost:4000/api/internal/partners/7", {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": "kc-sub-1",
      "x-user-username": "payhub.admin@bizone.vn",
      "user-agent": "vitest",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("sanitize", () => {
  it("masks credentials at any depth, keeps the fact they were set", () => {
    const out = sanitize({
      name: "VNPay",
      apiKey: "k-123",
      secret_key: "s",
      nested: { password: "p", signature: "abc", authorization: "Bearer x", ok: 1 },
      list: [{ token: "t" }],
      empty: { secretKey: "" },
    }) as Record<string, unknown>;
    expect(out).toEqual({
      name: "VNPay",
      apiKey: "••••",
      secret_key: "••••",
      nested: { password: "••••", signature: "••••", authorization: "••••", ok: 1 },
      list: [{ token: "••••" }],
      empty: { secretKey: "" },
    });
  });

  it("caps strings, arrays and total size; bigint / dates serialisable", () => {
    const out = sanitize({
      s: "x".repeat(5000),
      a: Array.from({ length: 150 }, (_, i) => i),
      n: BigInt(5),
      d: new Date(0),
    }) as {
      s: string;
      a: unknown[];
      n: string;
      d: string;
    };
    expect(out.s.length).toBe(2001);
    expect(out.a).toHaveLength(101);
    expect(out.n).toBe("5");
    expect(out.d).toBe("1970-01-01T00:00:00.000Z");
    // Prisma Decimal (has toJSON) and class instances become plain values
    const decimal = { s: 1, toJSON: () => "12.5" };
    class Money {
      toString() {
        return "1000 VND";
      }
    }
    expect(sanitize({ fee: decimal, m: new Money() })).toEqual({ fee: "12.5", m: "1000 VND" });
    const big = toStoredJson({ rows: Array.from({ length: 100 }, () => "y".repeat(1000)) }) as {
      _truncated?: boolean;
      preview?: string;
    };
    expect(big._truncated).toBe(true);
    expect(big.preview!.length).toBe(MAX_DATA_BYTES);
  });
});

describe("recordAudit / withAudit", () => {
  it("records a success with actor, IP-less origin, old + new data (secrets masked) and emits", async () => {
    const seen: unknown[] = [];
    const listener = (e: unknown) => seen.push(e);
    auditEvents.on("recorded", listener);
    const res = await withAudit(
      adminRequest({ name: "VNPay 2", secret_key: "new-secret" }),
      {
        action: "partner.update",
        entityType: "partner_config",
        entityId: "7",
        before: async () => ({ id: 7, name: "VNPay", secretKey: "enc:v1:old" }),
      },
      async () =>
        Response.json({ success: true, data: { id: 7, name: "VNPay 2", secretKey: "••••" } }),
    );
    auditEvents.off("recorded", listener);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { name: "VNPay 2" } }); // body still readable
    expect(created).toHaveLength(1);
    const row = created[0]!;
    expect(row).toMatchObject({
      action: "partner.update",
      result: "success",
      entityType: "partner_config",
      entityId: "7",
      actorId: "kc-sub-1",
      username: "payhub.admin@bizone.vn",
      userAgent: "vitest",
      httpMethod: "PUT",
      requestPath: "/api/internal/partners/7",
      ipAddress: null,
    });
    expect(JSON.stringify(row)).not.toContain("new-secret");
    expect(JSON.stringify(row)).not.toContain("enc:v1:old");
    expect(row.oldData).toEqual({ id: 7, name: "VNPay", secretKey: "••••" });
    expect(seen).toHaveLength(1);
  });

  it("records denied (403) and failure (409) with the error; skips 401", async () => {
    await withAudit(
      adminRequest({}),
      { action: "partner.status", entityType: "partner_config" },
      async () =>
        Response.json(
          { success: false, error: { code: "FORBIDDEN", message: "Required role" } },
          { status: 403 },
        ),
    );
    await withAudit(
      adminRequest({}),
      { action: "partner.status", entityType: "partner_config" },
      async () =>
        Response.json(
          { success: false, error: { code: "CONFLICT", message: "Cần test" } },
          { status: 409 },
        ),
    );
    await withAudit(
      adminRequest({}),
      { action: "partner.status", entityType: "partner_config" },
      async () => Response.json({ success: false }, { status: 401 }),
    );
    expect(created.map((c) => c.result)).toEqual(["denied", "failure"]);
    expect(created[1]!.description).toBe("HTTP 409 — Cần test");
  });

  it("takes the id of a created entity from the response; binary bodies only by size", async () => {
    const req = new Request("http://localhost:4000/api/internal/connectors", {
      method: "POST",
      headers: { "content-type": "application/zip", "content-length": "1234" },
      body: new Uint8Array([1, 2, 3]),
    });
    await withAudit(
      req,
      {
        action: "connector.upload",
        entityType: "connector",
        entityIdFrom: (d) => (d as { connector: { code: string } }).connector.code,
      },
      async () =>
        Response.json({ success: true, data: { connector: { code: "demopay" } } }, { status: 201 }),
    );
    expect(created[0]).toMatchObject({ entityId: "demopay", result: "success" });
    expect((created[0]!.newData as { request: unknown }).request).toEqual({ bytes: 1234 });
  });

  it("never throws when the DB write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await recordAudit({
      action: "x",
      entityType: "y",
      oldData: {
        toJSON: () => {
          throw new Error("boom");
        },
      },
    });
    expect(ok).toBe(false);
    spy.mockRestore();
  });
});

describe("retention / export", () => {
  it("keeps at least 90 days", () => {
    expect(retentionDays()).toBe(90);
    vi.stubEnv("AUDIT_RETENTION_DAYS", "30");
    expect(retentionDays()).toBe(90);
    vi.stubEnv("AUDIT_RETENTION_DAYS", "365");
    expect(retentionDays()).toBe(365);
  });

  it("CSV: BOM, quoting, formula injection neutralised", () => {
    const csv = toCsv({
      title: "t",
      headers: ["a", "b"],
      rows: [
        ['=HYPERLINK("x")', 'say "hi", ok'],
        [null, 5],
      ],
      truncated: false,
    }).toString("utf8");
    expect(csv.startsWith("﻿a,b\r\n")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")","say ""hi"", ok"`);
    expect(csv).toContain(",5\r\n");
  });
});
