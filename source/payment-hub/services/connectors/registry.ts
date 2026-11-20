import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { PartnerConfig } from "@/generated/prisma/client";
import type { ConnectorConfig } from "./types";
import type { CallbackKeysFn, IConnector } from "./interface";
import type { ConnectorManifest } from "./manifest";
import { catalogSnapshot, ensureCatalog, type PluginEntry } from "./loader";
import { PluginConnector, pluginCallbackKeys } from "./plugin-connector";
import { VNPAY_SANDBOX_API_URL, VNPAY_SANDBOX_PAY_URL, VnpayConnector } from "./vnpay";
import { MOMO_SANDBOX_CREATE_URL, MomoConnector, momoApiBase } from "./momo";
import { ZALOPAY_SANDBOX_CREATE_URL, ZalopayConnector, zalopayApiBase } from "./zalopay";

/**
 * Connector registry — maps a connector code / partner_configs.connector_type to its
 * implementation and builds an instance from a partner_configs row (secrets decrypted in
 * memory only). Two sources (P7.1): built-in connectors compiled into Payment Hub (VNPay, MoMo,
 * ZaloPay below) and plugins (signed packages uploaded at /connectors, loaded by ./loader.ts and
 * run in a sandbox process). Lookups are async: they first make sure the plugin catalog of this
 * process is current (hot-plug). Which payment_method goes to which connector lives in
 * services/routing/routeMap.ts; which partner config serves a request (merchant priority,
 * fallback, circuit breaker) is decided by services/routing/routeEngine.ts (P3.8).
 */

const VNPAY_PRODUCTION_API_URL = "https://merchant.vnpay.vn/merchant_webapi/api/transaction";
const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

export interface ConnectorDefinition {
  code: string;
  /** partner_configs.connector_type value */
  connectorType: string;
  source: "builtin" | "plugin";
  name: string;
  version: string;
  /** Where the customer's browser comes back (relative to APP_URL) */
  returnPath: string;
  /** Server-to-server notification endpoint (relative to APP_URL) */
  ipnPath: string;
  create(config: ConnectorConfig): IConnector;
  defaultEndpoint: string;
  /** Query/refund API base; `endpoint` = the payment endpoint configured for the environment. */
  apiEndpoint(env: ConnectorConfig["environment"], endpoint: string): string;
  /**
   * Default server-to-server notification URL sent with each payment request (PSPs that take
   * it per request, e.g. MoMo ipnUrl, ZaloPay callback_url). partner_configs.webhook_url overrides it.
   */
  defaultIpnUrl?: string;
  /**
   * The worker may query this PSP for Pending transactions whose IPN has not arrived
   * (server/jobs/syncPendingPayments.ts) — needs a getStatus() that works from stored data.
   */
  statusSync?: boolean;
  /** Refund support (P5.3) — absent = the PSP has no refund API (refunds are done outside the Hub). */
  refund?: RefundCapability;
  /**
   * Dispute API (P5.6): the connector implements submitDispute (+ queryDispute). None of the
   * current PSPs publishes one — their disputes go by e-mail (partner_configs.dispute_email) or are
   * recorded manually after using the partner portal.
   */
  disputeApi?: boolean;
  /** Plugins: reads txn code + signature of a callback / return payload (see interface.ts) */
  callbackKeys?: CallbackKeysFn;
  /** Plugins: manifest of the loaded package */
  manifest?: ConnectorManifest;
}

export interface RefundCapability {
  /** Several partial refunds may be sent (total ≤ the paid amount). */
  partial: boolean;
  /** Days after payment during which a refund may be requested (REFUND_WINDOW_DAYS overrides). */
  windowDays: number;
  /** The PSP answers asynchronously; the worker polls queryRefund() for Processing refunds. */
  async?: boolean;
}

/**
 * Default refund window. PSP contracts set the real limit (not in the public docs) — keep it
 * configurable rather than hard-coding a guess per PSP.
 */
const DEFAULT_REFUND_WINDOW_DAYS = 30;
function refundWindowDays(): number {
  const n = Number(process.env.REFUND_WINDOW_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REFUND_WINDOW_DAYS;
}

const BUILTIN_DEFINITIONS: ConnectorDefinition[] = [
  {
    code: "vnpay",
    source: "builtin",
    name: "VNPay",
    version: "1.0.0",
    returnPath: "/pay/vnpay/return",
    ipnPath: "/api/ipn/vnpay",
    connectorType: "VNPay",
    create: (config) => new VnpayConnector(config),
    defaultEndpoint: VNPAY_SANDBOX_PAY_URL,
    apiEndpoint: (env) =>
      env === "Production"
        ? VNPAY_PRODUCTION_API_URL
        : (process.env.VNPAY_API_URL ?? VNPAY_SANDBOX_API_URL),
    // merchant_webapi refund: 02 full / 03 partial
    refund: { partial: true, windowDays: DEFAULT_REFUND_WINDOW_DAYS },
  },
  {
    code: "momo",
    source: "builtin",
    name: "MoMo",
    version: "1.0.0",
    returnPath: "/pay/momo/return",
    ipnPath: "/api/ipn/momo",
    connectorType: "MoMo",
    create: (config) => new MomoConnector(config),
    defaultEndpoint: MOMO_SANDBOX_CREATE_URL,
    // query/refund live next to /create on the same host (sandbox / production / mock)
    apiEndpoint: (_env, endpoint) => momoApiBase(endpoint),
    defaultIpnUrl: `${APP_URL}/api/ipn/momo`,
    statusSync: true,
    refund: { partial: true, windowDays: DEFAULT_REFUND_WINDOW_DAYS },
  },
  {
    code: "zalopay",
    source: "builtin",
    name: "ZaloPay",
    version: "1.0.0",
    returnPath: "/pay/zalopay/return",
    ipnPath: "/api/ipn/zalopay",
    connectorType: "ZaloPay",
    create: (config) => new ZalopayConnector(config),
    defaultEndpoint: ZALOPAY_SANDBOX_CREATE_URL,
    // query / refund / query_refund live next to /v2/create on the same host
    apiEndpoint: (_env, endpoint) => zalopayApiBase(endpoint),
    // callback_url sent with each order (ZaloPay calls back only for paid orders)
    defaultIpnUrl: `${APP_URL}/api/ipn/zalopay`,
    statusSync: true,
    // refund → query_refund; still processing → polled by syncPendingRefunds
    refund: { partial: true, windowDays: DEFAULT_REFUND_WINDOW_DAYS, async: true },
  },
];

export class ConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorUnavailableError";
  }
}

export function builtinDefinitions(): readonly ConnectorDefinition[] {
  return BUILTIN_DEFINITIONS;
}

/** Built-in connector for a partner_configs.connector_type (no plugin lookup, no I/O). */
export function builtinDefinitionForType(connectorType: string): ConnectorDefinition | undefined {
  return BUILTIN_DEFINITIONS.find((d) => d.connectorType === connectorType);
}

/** Definition of a loaded plugin (null when its package could not be loaded in this process). */
export function pluginDefinition(entry: PluginEntry): ConnectorDefinition | null {
  const { manifest, sandbox } = entry;
  if (!manifest || !sandbox || entry.loadError) return null;
  const handle = { code: entry.code, version: manifest.version, manifest, sandbox };
  return {
    code: entry.code,
    connectorType: entry.connectorType,
    source: "plugin",
    name: manifest.name,
    version: manifest.version,
    returnPath: `/pay/plugin/${entry.code}/return`,
    ipnPath: `/api/ipn/plugin/${entry.code}`,
    create: (config) => new PluginConnector(handle, config),
    defaultEndpoint:
      manifest.config.defaultEndpointSandbox ?? manifest.config.defaultEndpointProduction ?? "",
    apiEndpoint: (_env, endpoint) => endpoint,
    defaultIpnUrl: `${APP_URL}/api/ipn/plugin/${entry.code}`,
    statusSync: manifest.capabilities.statusSync,
    refund: manifest.capabilities.refund ?? undefined,
    disputeApi: false,
    callbackKeys: pluginCallbackKeys(handle),
    manifest,
  };
}

/** Every usable connector definition: built-ins + loaded plugins (fresh catalog). */
export async function allDefinitions(): Promise<ConnectorDefinition[]> {
  const plugins = await ensureCatalog();
  const out = [...BUILTIN_DEFINITIONS];
  for (const entry of plugins.values()) {
    const def = pluginDefinition(entry);
    if (def) out.push(def);
  }
  return out;
}

export async function definitionForCode(code: string): Promise<ConnectorDefinition | undefined> {
  return (await allDefinitions()).find((d) => d.code === code);
}

export interface ResolvedConnector {
  connector: IConnector;
  partnerConfigId: number;
  callbackUrl: string | null;
}

export async function definitionForConnectorType(
  connectorType: string,
): Promise<ConnectorDefinition | undefined> {
  return (await allDefinitions()).find((d) => d.connectorType === connectorType);
}

/** Plugin catalog entry serving a connector type (loaded or not) — for "why unavailable". */
export async function pluginEntryForType(connectorType: string): Promise<PluginEntry | undefined> {
  return [...(await ensureCatalog()).values()].find((e) => e.connectorType === connectorType);
}

/** Synchronous check for code that already awaited a lookup in this request (route engine). */
export function isConnectorTypeImplemented(connectorType: string): boolean {
  if (builtinDefinitionForType(connectorType)) return true;
  for (const entry of catalogSnapshot().values()) {
    if (entry.connectorType === connectorType) return !!pluginDefinition(entry);
  }
  return false;
}

/**
 * Build a connector instance from a partner_configs row regardless of its status
 * (used by "test connection" before a config is activated). Secrets are decrypted in memory.
 */
export async function connectorFromPartnerConfig(pc: PartnerConfig): Promise<ResolvedConnector> {
  const def = await definitionForConnectorType(pc.connectorType);
  if (!def) throw new ConnectorUnavailableError(`No connector for ${pc.connectorType}`);
  return buildConnector(def, pc);
}

async function buildFromPartnerConfig(
  def: ConnectorDefinition,
  partnerConfigId?: number,
): Promise<ResolvedConnector> {
  const prisma = getPrisma();
  const pc = partnerConfigId
    ? await prisma.partnerConfig.findUnique({ where: { id: partnerConfigId } })
    : await prisma.partnerConfig.findFirst({
        where: { connectorType: def.connectorType, status: "Active" },
        orderBy: { id: "asc" },
      });
  if (!pc) {
    throw new ConnectorUnavailableError(`No active partner config for ${def.connectorType}`);
  }
  // A transaction routed through another PSP must never be verified with these secrets.
  if (pc.connectorType !== def.connectorType) {
    throw new ConnectorUnavailableError(
      `Partner config #${pc.id} is ${pc.connectorType}, not ${def.connectorType}`,
    );
  }
  return buildConnector(def, pc);
}

function buildConnector(def: ConnectorDefinition, pc: PartnerConfig): ResolvedConnector {
  if (!pc.merchantCode) {
    throw new ConnectorUnavailableError(`Partner config #${pc.id} has no merchant code`);
  }
  const endpoint =
    (pc.environment === "Production" ? pc.endpointProduction : pc.endpointSandbox) ??
    def.defaultEndpoint;

  const config: ConnectorConfig = {
    partnerConfigId: pc.id,
    connectorType: pc.connectorType,
    merchantCode: pc.merchantCode,
    apiKey: decryptSecret(pc.apiKey),
    secretKey: decryptSecret(pc.secretKey),
    endpoint,
    apiEndpoint: def.apiEndpoint(pc.environment, endpoint),
    ipnUrl: pc.webhookUrl || def.defaultIpnUrl,
    environment: pc.environment,
    timeoutMs: pc.timeout,
  };
  return { connector: def.create(config), partnerConfigId: pc.id, callbackUrl: pc.callbackUrl };
}

/**
 * Resolve the connector that handled a transaction (its partner_config_id), falling
 * back to the first Active config — used by IPN/redirect where secrets must match.
 */
export async function resolveConnectorByCode(
  code: string,
  partnerConfigId?: number | null,
): Promise<ResolvedConnector> {
  const def = await definitionForCode(code);
  if (!def) throw new ConnectorUnavailableError(`Unknown connector: ${code}`);
  return buildFromPartnerConfig(def, partnerConfigId ?? undefined);
}

/** connector_type values whose Pending transactions the worker may poll (statusSync). */
export async function statusSyncDefinitions(): Promise<{ code: string; connectorType: string }[]> {
  return (await allDefinitions())
    .filter((d) => d.statusSync)
    .map((d) => ({ code: d.code, connectorType: d.connectorType }));
}

/** Refund support of a connector type (VietQR / unknown → null). Window from REFUND_WINDOW_DAYS. */
export async function refundCapability(
  connectorType: string | null | undefined,
): Promise<RefundCapability | null> {
  const def = connectorType ? await definitionForConnectorType(connectorType) : undefined;
  if (!def?.refund) return null;
  return {
    ...def.refund,
    windowDays: process.env.REFUND_WINDOW_DAYS ? refundWindowDays() : def.refund.windowDays,
  };
}

/** connector_type values whose Processing refunds the worker may poll (queryRefund). */
export async function asyncRefundConnectorTypes(): Promise<string[]> {
  return (await allDefinitions()).filter((d) => d.refund?.async).map((d) => d.connectorType);
}

/** Connector type has a dispute API (P5.6) — see ConnectorDefinition.disputeApi (built-ins). */
export function disputeApiSupported(connectorType: string | null | undefined): boolean {
  return !!(connectorType && builtinDefinitionForType(connectorType)?.disputeApi);
}
