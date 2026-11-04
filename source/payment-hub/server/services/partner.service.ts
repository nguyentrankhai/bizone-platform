import { getPrisma } from "@/lib/prisma";
import { Prisma, type PartnerConfig } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  PARTNER_TYPES,
  type PartnerEnv,
  type PartnerLogView,
  type PartnerStatus,
  type PartnerView,
  type RetryPolicy,
  type TestResult,
} from "@/lib/partner-types";
import { connectorFromPartnerConfig } from "@/services/connectors/registry";
import { buildVietQrPayload, parseVietQrPayload, validateAccount } from "@/services/qr/vietqr";

/**
 * Partner (PSP) configuration — SRS-PH-PARTNER-01.
 *
 * Rules:
 *  - New configs start Inactive. Activation requires a successful connection test of the
 *    *current* config: changing credentials/endpoints/environment clears the test result, and an
 *    Active config whose connection settings change drops to Inactive until re-tested.
 *  - A failed test on an Active config marks it Error (removed from routing: the registry only
 *    picks Active configs); a passing test on an Error config restores Active.
 *  - Every change is written to partner_config_logs (field, old → new, who, IP). Secret values are
 *    never returned or logged — only "(đã thay đổi)".
 *  - Changes apply immediately (hot-plug): the connector registry reads partner_configs per request.
 */

export class PartnerError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PartnerError";
  }
}

export interface Actor {
  username: string;
  ipAddress?: string;
}

export interface PartnerInput {
  connectorType: string;
  name: string;
  merchantCode: string;
  environment: PartnerEnv;
  /** Empty/undefined on update = keep the stored value. */
  apiKey?: string;
  secretKey?: string;
  endpointSandbox?: string | null;
  endpointProduction?: string | null;
  callbackUrl?: string | null;
  webhookUrl?: string | null;
  timeout: number;
  retryPolicy: RetryPolicy;
}

/** Fields whose change invalidates the last connection test. */
const CONNECTION_FIELDS = new Set([
  "connector_type",
  "merchant_code",
  "environment",
  "api_key",
  "secret_key",
  "endpoint_sandbox",
  "endpoint_production",
]);

const SECRET_CHANGED = "(đã thay đổi)";

function maskSecret(plain: string): string {
  if (!plain) return "";
  return plain.length > 8 ? `••••${plain.slice(-4)}` : "••••";
}

function safeDecrypt(stored: string): string {
  try {
    return decryptSecret(stored);
  } catch {
    return "";
  }
}

export function toView(pc: PartnerConfig): PartnerView {
  const spec = PARTNER_TYPES[pc.connectorType];
  const apiKey = safeDecrypt(pc.apiKey);
  const secretKey = safeDecrypt(pc.secretKey);
  return {
    id: pc.id,
    connectorType: pc.connectorType,
    name: pc.name,
    merchantCode: pc.merchantCode,
    environment: pc.environment,
    status: pc.status,
    apiKey: spec && !spec.apiKey.secret ? apiKey : maskSecret(apiKey),
    secretKey: spec && !spec.secretKey.secret ? secretKey : secretKey ? "••••••••" : "",
    endpointSandbox: pc.endpointSandbox,
    endpointProduction: pc.endpointProduction,
    callbackUrl: pc.callbackUrl,
    webhookUrl: pc.webhookUrl,
    timeout: pc.timeout,
    retryPolicy: (pc.retryPolicy as RetryPolicy | null) ?? null,
    testResult: (pc.testResult as TestResult | null) ?? null,
    lastTestedAt: pc.lastTestedAt?.toISOString() ?? null,
    createdAt: pc.createdAt.toISOString(),
    updatedAt: pc.updatedAt.toISOString(),
  };
}

function validateTypeFields(input: PartnerInput, isCreate: boolean): void {
  const spec = PARTNER_TYPES[input.connectorType];
  if (!spec) throw new PartnerError("VALIDATION_ERROR", "Loại connector không hợp lệ");
  const checks: [keyof PartnerInput, typeof spec.apiKey][] = [
    ["merchantCode", spec.merchantCode],
    ["apiKey", spec.apiKey],
    ["secretKey", spec.secretKey],
  ];
  for (const [key, field] of checks) {
    const value = (input[key] as string | undefined)?.trim() ?? "";
    const required = key === "merchantCode" || isCreate;
    if (!value) {
      if (required) throw new PartnerError("VALIDATION_ERROR", `Thiếu ${field.label}`);
      continue;
    }
    if (field.pattern && !field.pattern.test(value)) {
      throw new PartnerError("VALIDATION_ERROR", field.patternMessage ?? `${field.label} sai`);
    }
  }
}

async function resolveUserId(username: string): Promise<number | null> {
  const user = await getPrisma().user.findUnique({ where: { username }, select: { id: true } });
  return user?.id ?? null;
}

type LogRow = { field: string; oldValue: string | null; newValue: string | null };

async function writeLogs(
  tx: Prisma.TransactionClient,
  partnerConfigId: number,
  rows: LogRow[],
  actor: Actor,
): Promise<void> {
  if (rows.length === 0) return;
  const userId = await resolveUserId(actor.username);
  await tx.partnerConfigLog.createMany({
    data: rows.map((r) => ({
      partnerConfigId,
      userId,
      fieldChanged: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      ipAddress: actor.ipAddress?.slice(0, 45) ?? null,
      changedBy: actor.username.slice(0, 100),
    })),
  });
}

const str = (v: unknown) =>
  v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface PartnerFilter {
  status?: PartnerStatus;
  environment?: PartnerEnv;
  connectorType?: string;
}

export async function listPartners(filter: PartnerFilter = {}): Promise<PartnerView[]> {
  const rows = await getPrisma().partnerConfig.findMany({
    where: {
      status: filter.status,
      environment: filter.environment,
      connectorType: filter.connectorType,
    },
    orderBy: [{ connectorType: "asc" }, { environment: "desc" }, { id: "asc" }],
  });
  return rows.map(toView);
}

export async function getPartner(id: number): Promise<PartnerView | null> {
  const pc = await getPrisma().partnerConfig.findUnique({ where: { id } });
  return pc ? toView(pc) : null;
}

export async function listPartnerLogs(
  id: number,
  page = 1,
  limit = 20,
): Promise<{ items: PartnerLogView[]; total: number; page: number; totalPages: number }> {
  const prisma = getPrisma();
  const [rows, total] = await Promise.all([
    prisma.partnerConfigLog.findMany({
      where: { partnerConfigId: id },
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.partnerConfigLog.count({ where: { partnerConfigId: id } }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id.toString(),
      field: r.fieldChanged,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedBy: r.changedBy,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPartner(input: PartnerInput, actor: Actor): Promise<PartnerView> {
  validateTypeFields(input, true);
  const prisma = getPrisma();
  const pc = await prisma.$transaction(async (tx) => {
    const row = await tx.partnerConfig.create({
      data: {
        connectorType: input.connectorType,
        name: input.name.trim(),
        merchantCode: input.merchantCode.trim(),
        environment: input.environment,
        apiKey: encryptSecret(input.apiKey!.trim()),
        secretKey: encryptSecret(input.secretKey!.trim()),
        endpointSandbox: input.endpointSandbox || null,
        endpointProduction: input.endpointProduction || null,
        callbackUrl: input.callbackUrl || null,
        webhookUrl: input.webhookUrl || null,
        timeout: input.timeout,
        retryPolicy: input.retryPolicy as unknown as Prisma.InputJsonValue,
        status: "Inactive",
      },
    });
    await writeLogs(
      tx,
      row.id,
      [{ field: "created", oldValue: null, newValue: `${row.connectorType} · ${row.name}` }],
      actor,
    );
    return row;
  });
  return toView(pc);
}

export async function updatePartner(
  id: number,
  input: PartnerInput,
  actor: Actor,
): Promise<PartnerView> {
  validateTypeFields(input, false);
  const prisma = getPrisma();
  const spec = PARTNER_TYPES[input.connectorType]!;

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.partnerConfig.findUnique({ where: { id } });
    if (!current) throw new PartnerError("NOT_FOUND", "Không tìm thấy đối tác");

    const data: Prisma.PartnerConfigUpdateInput = {};
    const logs: LogRow[] = [];
    const plain = (field: string, key: keyof PartnerConfig, next: unknown) => {
      const prev = current[key];
      if (str(prev) === str(next)) return;
      (data as Record<string, unknown>)[key] = next;
      logs.push({ field, oldValue: str(prev), newValue: str(next) });
    };

    if (input.connectorType !== current.connectorType) {
      // Column meanings differ per type (e.g. VietQR api_key = bank BIN) — create a new config.
      throw new PartnerError("VALIDATION_ERROR", "Không đổi được loại connector của đối tác");
    }
    plain("name", "name", input.name.trim());
    plain("merchant_code", "merchantCode", input.merchantCode.trim());
    plain("environment", "environment", input.environment);
    plain("endpoint_sandbox", "endpointSandbox", input.endpointSandbox || null);
    plain("endpoint_production", "endpointProduction", input.endpointProduction || null);
    plain("callback_url", "callbackUrl", input.callbackUrl || null);
    plain("webhook_url", "webhookUrl", input.webhookUrl || null);
    plain("timeout", "timeout", input.timeout);
    plain("retry_policy", "retryPolicy", input.retryPolicy);

    for (const [field, key, fieldSpec] of [
      ["api_key", "apiKey", spec.apiKey],
      ["secret_key", "secretKey", spec.secretKey],
    ] as const) {
      const next = input[key]?.trim();
      if (!next) continue;
      const prev = safeDecrypt(current[key]);
      if (prev === next) continue;
      data[key] = encryptSecret(next);
      logs.push(
        fieldSpec.secret
          ? { field, oldValue: prev ? SECRET_CHANGED : null, newValue: SECRET_CHANGED }
          : { field, oldValue: prev || null, newValue: next },
      );
    }

    if (logs.length === 0) return current;

    if (logs.some((l) => CONNECTION_FIELDS.has(l.field))) {
      data.testResult = Prisma.DbNull;
      data.lastTestedAt = null;
      if (current.status !== "Inactive") {
        data.status = "Inactive";
        logs.push({
          field: "status",
          oldValue: current.status,
          newValue: "Inactive",
        });
      }
    }

    const row = await tx.partnerConfig.update({ where: { id }, data });
    await writeLogs(tx, id, logs, actor);
    return row;
  });
  return toView(updated);
}

export async function setPartnerStatus(
  id: number,
  status: "Active" | "Inactive",
  actor: Actor,
): Promise<PartnerView> {
  const prisma = getPrisma();
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.partnerConfig.findUnique({ where: { id } });
    if (!current) throw new PartnerError("NOT_FOUND", "Không tìm thấy đối tác");
    if (current.status === status) return current;
    if (status === "Active") {
      if (!PARTNER_TYPES[current.connectorType]?.implemented) {
        throw new PartnerError("CONFLICT", `Connector ${current.connectorType} chưa được hỗ trợ`);
      }
      const test = current.testResult as TestResult | null;
      if (!test?.success) {
        throw new PartnerError(
          "CONFLICT",
          "Chỉ kích hoạt được sau khi test kết nối thành công với cấu hình hiện tại",
        );
      }
    }
    // Conditional on the status we read: a concurrent test/edit must not be overwritten.
    const { count } = await tx.partnerConfig.updateMany({
      where: { id, status: current.status },
      data: { status },
    });
    if (count === 0) throw new PartnerError("CONFLICT", "Cấu hình vừa bị thay đổi, hãy tải lại");
    await writeLogs(
      tx,
      id,
      [{ field: "status", oldValue: current.status, newValue: status }],
      actor,
    );
    return { ...current, status };
  });
  return toView(updated);
}

// ─── Connection test ──────────────────────────────────────────────────────────

const NAPAS_BANKS_URL = process.env.VIETQR_BANKS_URL ?? "https://api.vietqr.io/v2/banks";

async function testVietQr(pc: PartnerConfig): Promise<TestResult> {
  const started = Date.now();
  const account = {
    bin: safeDecrypt(pc.apiKey),
    accountNo: pc.merchantCode ?? "",
    accountName: safeDecrypt(pc.secretKey),
  };
  const done = (success: boolean, message: string): TestResult => ({
    success,
    message,
    response_time_ms: Date.now() - started,
  });
  try {
    validateAccount(account);
    const payload = buildVietQrPayload({ account, amount: 10_000, note: "TEST" });
    if (!parseVietQrPayload(payload).crcValid) return done(false, "Sinh payload VietQR lỗi CRC");
  } catch (e) {
    return done(false, e instanceof Error ? e.message : "Cấu hình VietQR không hợp lệ");
  }
  try {
    const res = await fetch(NAPAS_BANKS_URL, {
      signal: AbortSignal.timeout(Math.min(pc.timeout, 10_000)),
    });
    if (!res.ok)
      return done(false, `Không tra được danh sách ngân hàng NAPAS (HTTP ${res.status})`);
    const body = (await res.json()) as {
      data?: { bin: string; shortName?: string; transferSupported?: number }[];
    };
    const bank = body.data?.find((b) => b.bin === account.bin);
    if (!bank) return done(false, `Mã BIN ${account.bin} không có trong danh sách NAPAS`);
    if (bank.transferSupported === 0) {
      return done(false, `${bank.shortName ?? account.bin} chưa hỗ trợ chuyển khoản VietQR`);
    }
    return done(
      true,
      `VietQR hợp lệ: ${bank.shortName ?? account.bin} · TK ${account.accountNo} · payload EMVCo + CRC OK`,
    );
  } catch (e) {
    return done(
      false,
      `Không kết nối được danh sách ngân hàng NAPAS: ${e instanceof Error ? e.message : e}`,
    );
  }
}

async function runConnectionTest(pc: PartnerConfig): Promise<TestResult> {
  const spec = PARTNER_TYPES[pc.connectorType];
  if (!spec?.implemented) {
    return {
      success: false,
      message: `Connector ${pc.connectorType} chưa được hỗ trợ trong phiên bản này`,
      response_time_ms: 0,
    };
  }
  if (pc.connectorType === "VietQR") return testVietQr(pc);
  try {
    const { connector } = connectorFromPartnerConfig(pc);
    const health = await connector.healthCheck();
    return { success: health.healthy, message: health.message, response_time_ms: health.latencyMs };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Không tạo được connector",
      response_time_ms: 0,
    };
  }
}

export async function testPartner(
  id: number,
  actor: Actor,
): Promise<{ partner: PartnerView; testResult: TestResult }> {
  const prisma = getPrisma();
  const pc = await prisma.partnerConfig.findUnique({ where: { id } });
  if (!pc) throw new PartnerError("NOT_FOUND", "Không tìm thấy đối tác");

  const testResult = await runConnectionTest(pc);
  const testedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Only record the result if the config was not edited while the test ran.
    const current = await tx.partnerConfig.findUnique({ where: { id } });
    if (!current || current.updatedAt.getTime() !== pc.updatedAt.getTime()) {
      throw new PartnerError("CONFLICT", "Cấu hình vừa bị thay đổi trong lúc test, hãy test lại");
    }
    let status = current.status;
    if (!testResult.success && status === "Active") status = "Error";
    else if (testResult.success && status === "Error") status = "Active";

    const row = await tx.partnerConfig.update({
      where: { id },
      data: {
        testResult: testResult as unknown as Prisma.InputJsonValue,
        lastTestedAt: testedAt,
        status,
      },
    });
    const logs: LogRow[] = [
      {
        field: "test_connection",
        oldValue: null,
        newValue:
          `${testResult.success ? "OK" : "FAIL"} (${testResult.response_time_ms} ms) — ${testResult.message}`.slice(
            0,
            1000,
          ),
      },
    ];
    if (status !== current.status) {
      logs.push({ field: "status", oldValue: current.status, newValue: status });
    }
    await writeLogs(tx, id, logs, actor);
    return row;
  });

  return { partner: toView(updated), testResult };
}
