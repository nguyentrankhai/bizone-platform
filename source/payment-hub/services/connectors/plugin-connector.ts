import { z } from "zod";
import type { CallbackKeysFn, IConnector, QrRequest } from "./interface";
import type { ConnectorManifest } from "./manifest";
import type { PluginSandbox } from "./sandbox";
import type {
  ConfigSchemaField,
  ConnectorConfig,
  CreatePaymentResult,
  HealthResult,
  PartnerQr,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
  StatusQuery,
  StatusResult,
} from "./types";

/**
 * IConnector proxy for a plugin (P7.1): every call goes to the plugin's sandbox process with the
 * partner config of this instance. What comes back is untrusted — it is validated / normalised
 * here before the core uses it (a URL must be http(s), outcomes must be known values, raw data
 * must be flat strings…). A malformed answer is a plugin error (→ fallback / circuit breaker).
 */

const strRecord = z.record(z.string(), z.unknown()).transform((r) =>
  Object.fromEntries(
    Object.entries(r)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [
        k.slice(0, 100),
        (typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 4000),
      ]),
  ),
);

const httpUrl = z.url({ protocol: /^https?$/ }).max(4000);

const partnerQr = z.object({
  content: z.string().min(1).max(2000),
  deeplink: z.string().max(2000).optional(),
  expiresAt: z.date().optional(),
});

const createResult = z.object({
  paymentUrl: httpUrl,
  partnerRequest: strRecord,
  partnerResponse: z.record(z.string(), z.unknown()).optional(),
  partnerQr: partnerQr.optional(),
});

const outcome = z.enum(["Success", "Failed", "Pending"]);

const paymentResult = z.object({
  txnCode: z.string().min(1).max(100),
  outcome,
  partnerTxnId: z.string().max(255).optional(),
  amount: z.number().int().min(0),
  paidAt: z.date().optional(),
  errorCode: z.string().max(50).optional(),
  errorMessage: z.string().max(500).optional(),
  bankCode: z.string().max(50).optional(),
  partnerRaw: strRecord,
});

const refundResult = z.object({
  success: z.boolean(),
  pending: z.boolean().optional(),
  partnerRefundId: z.string().max(255).optional(),
  partnerRefundRef: z.string().max(255).optional(),
  responseCode: z.string().max(50),
  message: z.string().max(500),
  signatureValid: z.boolean(),
  partnerRequest: strRecord,
  partnerRaw: z.unknown(),
});

const statusResult = z.object({
  outcome: z.enum(["Success", "Failed", "Pending", "Unknown"]),
  responseCode: z.string().max(50),
  transactionStatus: z.string().max(50).optional(),
  message: z.string().max(500),
  partnerTxnId: z.string().max(255).optional(),
  amount: z.number().int().min(0).optional(),
  signatureValid: z.boolean(),
  partnerRaw: z.unknown(),
});

const healthResult = z.object({
  healthy: z.boolean(),
  latencyMs: z.number().min(0),
  message: z.string().max(500),
});

const callbackKeysResult = z
  .object({ txnCode: z.string().min(1).max(100), signature: z.string().min(1).max(2000) })
  .nullable();

export class PluginOutputError extends Error {
  constructor(code: string, method: string, issues: string) {
    super(`Plugin ${code}.${method} trả dữ liệu không hợp lệ: ${issues}`);
    this.name = "PluginOutputError";
  }
}

function check<T>(schema: z.ZodType<T>, value: unknown, code: string, method: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new PluginOutputError(
      code,
      method,
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(gốc)"} ${i.message}`)
        .join("; "),
    );
  }
  return parsed.data;
}

export interface PluginHandle {
  code: string;
  version: string;
  manifest: ConnectorManifest;
  sandbox: PluginSandbox;
}

export class PluginConnector implements IConnector {
  readonly code: string;
  readonly version: string;

  constructor(
    private readonly plugin: PluginHandle,
    private readonly config: ConnectorConfig,
  ) {
    this.code = plugin.code;
    this.version = plugin.version;
  }

  private invoke(method: string, args: unknown[]): Promise<unknown> {
    return this.plugin.sandbox.call("invoke", {
      config: this.config,
      method,
      args,
      // the plugin's own HTTP timeout + margin for the IPC round trip
      timeoutMs: Math.min(this.config.timeoutMs, 120_000) + 2000,
    });
  }

  async createTransaction(req: PaymentRequest): Promise<CreatePaymentResult> {
    return check(
      createResult,
      await this.invoke("createTransaction", [req]),
      this.code,
      "createTransaction",
    );
  }

  async processResult(raw: Record<string, string>): Promise<PaymentResult> {
    return check(
      paymentResult,
      await this.invoke("processResult", [raw]),
      this.code,
      "processResult",
    );
  }

  async verifySignature(payload: Record<string, string>, signature: string): Promise<boolean> {
    return (await this.invoke("verifySignature", [payload, signature])) === true;
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    return check(
      refundResult,
      await this.invoke("refund", [req]),
      this.code,
      "refund",
    ) as RefundResult;
  }

  async queryRefund(partnerRefundRef: string): Promise<RefundResult> {
    return check(
      refundResult,
      await this.invoke("queryRefund", [partnerRefundRef]),
      this.code,
      "queryRefund",
    ) as RefundResult;
  }

  async getStatus(query: StatusQuery): Promise<StatusResult> {
    return check(
      statusResult,
      await this.invoke("getStatus", [query]),
      this.code,
      "getStatus",
    ) as StatusResult;
  }

  async generateQR(data: QrRequest): Promise<PartnerQr> {
    return check(partnerQr, await this.invoke("generateQR", [data]), this.code, "generateQR");
  }

  /** From the manifest (the partner form is driven by it — no process needed). */
  getConfigSchema(): ConfigSchemaField[] {
    const c = this.plugin.manifest.config;
    const field = (key: string, f: { label: string; secret: boolean }) => ({
      key,
      label: f.label,
      type: f.secret ? ("secret" as const) : ("string" as const),
      required: true,
    });
    return [
      field("merchantCode", c.merchantCode),
      field("apiKey", c.apiKey),
      field("secretKey", c.secretKey),
      ...(c.usesEndpoints
        ? [{ key: "endpoint", label: "Endpoint", type: "url" as const, required: true }]
        : []),
    ];
  }

  async healthCheck(): Promise<HealthResult> {
    return check(healthResult, await this.invoke("healthCheck", []), this.code, "healthCheck");
  }
}

/** Static callbackKeys() of a plugin (no partner config needed). */
export function pluginCallbackKeys(plugin: PluginHandle): CallbackKeysFn {
  return async (raw) =>
    check(
      callbackKeysResult,
      await plugin.sandbox.call("callbackKeys", { args: [raw], timeoutMs: 5000 }),
      plugin.code,
      "callbackKeys",
    );
}
