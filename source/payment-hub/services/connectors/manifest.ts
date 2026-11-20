import { z } from "zod";
import { CONNECTOR_API_VERSION } from "./interface";

/**
 * manifest.json of a connector plugin (P7.1) — what the core needs to know about a plugin without
 * running it: identity / version, the partner_configs.connector_type it serves, its payment
 * methods (routing table), its config schema (partner form), capabilities, the HTTP answers of its
 * IPN endpoint, the hosts it may call and its changelog. See documents/Connector-Plugin-Guide.md.
 */

// ─── Semantic versioning ──────────────────────────────────────────────────────

const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export type Semver = [number, number, number];

export function parseSemver(v: string): Semver | null {
  const m = SEMVER.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Invalid version: ${!pa ? a : b}`);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

/**
 * `version` satisfies `range` — supports the usual subset: exact "1.2.3", "^1.2.3", "~1.2.3",
 * comparators ">=1.0.0", ">1.0.0", "<=…", "<…" and space-separated conjunctions
 * (">=1.0.0 <2.0.0"). Invalid range → false.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return false;
  return parts.every((part) => {
    const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(part);
    const base = m ? parseSemver(m[2]!) : null;
    if (!m || !base) return false;
    const cmp = v[0] - base[0] || v[1] - base[1] || v[2] - base[2];
    switch (m[1]) {
      case "^":
        if (cmp < 0) return false;
        if (base[0] > 0) return v[0] === base[0];
        if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
        return v[0] === 0 && v[1] === 0 && v[2] === base[2];
      case "~":
        return cmp >= 0 && v[0] === base[0] && v[1] === base[1];
      case ">=":
        return cmp >= 0;
      case ">":
        return cmp > 0;
      case "<=":
        return cmp <= 0;
      case "<":
        return cmp < 0;
      default:
        return cmp === 0;
    }
  });
}

// ─── Manifest schema ──────────────────────────────────────────────────────────

const semver = z.string().regex(SEMVER, "Phiên bản phải theo semver MAJOR.MINOR.PATCH");

/** Regex given as text; compiled to check it is valid (length-capped). */
const regexSource = z
  .string()
  .max(200)
  .refine((s) => {
    try {
      new RegExp(s);
      return true;
    } catch {
      return false;
    }
  }, "Biểu thức chính quy không hợp lệ");

const fieldSpec = z.object({
  label: z.string().trim().min(1).max(100),
  secret: z.boolean(),
  placeholder: z.string().max(200).optional(),
  pattern: regexSource.optional(),
  patternMessage: z.string().max(200).optional(),
});

const httpsOrHttpUrl = z.url({ protocol: /^https?$/ }).max(500);

/** Host a plugin may call: "api.psp.vn" or "*.psp.vn" (any sub-domain). */
const hostPattern = z
  .string()
  .toLowerCase()
  .regex(
    /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
    "Tên miền không hợp lệ",
  );

const callbackResponse = z.object({
  status: z.number().int().min(200).max(599),
  /** JSON value (sent as application/json) or text */
  body: z.union([z.string().max(2000), z.record(z.string(), z.unknown())]),
});

export const PAYMENT_METHOD_CODE = /^[a-z][a-z0-9_]{2,49}$/;

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    code: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,29}$/, "code: 3–30 ký tự a-z, 0-9, _ (bắt đầu bằng chữ)"),
    connectorType: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]{2,29}$/, "connectorType: 3–30 ký tự chữ / số / _"),
    name: z.string().trim().min(1).max(100),
    version: semver,
    description: z.string().max(500).optional(),
    publisher: z.string().trim().min(1).max(100),
    /** Range of the core plugin API (CONNECTOR_API_VERSION) the plugin was built for */
    coreCompatibility: z.string().max(50),
    /** PSP API version the plugin speaks (informative — SRS §3.3.8) */
    pspApiVersion: z.string().max(50).optional(),
    entry: z
      .string()
      .regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.mjs$/, "entry phải là file .mjs trong gói"),
    protocols: z
      .array(z.enum(["REST", "SOAP", "MQ", "SFTP", "OpenAPI", "Proprietary"]))
      .max(6)
      .default(["REST"]),
    paymentMethods: z
      .array(
        z.object({
          method: z.string().regex(PAYMENT_METHOD_CODE, "method: 3–50 ký tự a-z, 0-9, _"),
          label: z.string().trim().min(1).max(100),
          minAmount: z.number().int().min(0).optional(),
          maxAmount: z.number().int().min(1).optional(),
          minExpiryMinutes: z.number().int().min(1).max(1440).optional(),
        }),
      )
      .min(1)
      .max(20),
    config: z.object({
      merchantCode: fieldSpec,
      apiKey: fieldSpec,
      secretKey: fieldSpec,
      usesEndpoints: z.boolean().default(true),
      defaultEndpointSandbox: httpsOrHttpUrl.optional(),
      defaultEndpointProduction: httpsOrHttpUrl.optional(),
    }),
    capabilities: z
      .object({
        /** The worker may query getStatus() for Pending transactions whose IPN is late */
        statusSync: z.boolean().default(false),
        refund: z
          .object({
            partial: z.boolean(),
            windowDays: z.number().int().min(1).max(365),
            /** answers later → worker polls queryRefund() */
            async: z.boolean().default(false),
          })
          .nullable()
          .default(null),
      })
      .default({ statusSync: false, refund: null }),
    /** HTTP answers of /api/ipn/plugin/{code} per processing outcome */
    callback: z
      .object({
        responses: z.object({
          ok: callbackResponse,
          invalid_signature: callbackResponse,
          not_found: callbackResponse,
          amount_mismatch: callbackResponse,
          error: callbackResponse,
        }),
      })
      .optional(),
    network: z.object({
      /** Hosts the plugin may fetch (plus the hosts of the partner config endpoints) */
      allowedHosts: z.array(hostPattern).max(20),
    }),
    changelog: z
      .array(
        z.object({
          version: semver,
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          changes: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((m, ctx) => {
    if (!m.changelog.some((c) => c.version === m.version)) {
      ctx.addIssue({
        code: "custom",
        path: ["changelog"],
        message: `changelog phải có mục cho phiên bản ${m.version}`,
      });
    }
    const seen = new Set<string>();
    for (const [i, pm] of m.paymentMethods.entries()) {
      if (seen.has(pm.method)) {
        ctx.addIssue({
          code: "custom",
          path: ["paymentMethods", i, "method"],
          message: `Trùng phương thức ${pm.method}`,
        });
      }
      seen.add(pm.method);
      if (pm.minAmount !== undefined && pm.maxAmount !== undefined && pm.minAmount > pm.maxAmount) {
        ctx.addIssue({
          code: "custom",
          path: ["paymentMethods", i],
          message: "minAmount > maxAmount",
        });
      }
    }
  });

export type ConnectorManifest = z.infer<typeof manifestSchema>;

export class ManifestError extends Error {
  constructor(public readonly issues: string[]) {
    super(`manifest.json không hợp lệ: ${issues.join("; ")}`);
    this.name = "ManifestError";
  }
}

/** Parse + validate a manifest (JSON text). Also checks core compatibility. */
export function parseManifest(text: string): ConnectorManifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ManifestError(["không phải JSON hợp lệ"]);
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new ManifestError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`),
    );
  }
  if (!satisfies(CONNECTOR_API_VERSION, parsed.data.coreCompatibility)) {
    throw new ManifestError([
      `coreCompatibility "${parsed.data.coreCompatibility}" không gồm phiên bản API connector của Payment Hub (${CONNECTOR_API_VERSION})`,
    ]);
  }
  return parsed.data;
}

/** Host allowed by a list of patterns ("*.psp.vn" matches sub-domains, not psp.vn itself). */
export function hostAllowed(host: string, patterns: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return patterns.some((p) =>
    p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p,
  );
}
