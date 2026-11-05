import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { PartnerConfig } from "@/generated/prisma/client";
import type { ConnectorConfig, PaymentConnector } from "./types";
import { VNPAY_SANDBOX_API_URL, VNPAY_SANDBOX_PAY_URL, VnpayConnector } from "./vnpay";

/**
 * Connector registry — maps a connector code / partner_configs.connector_type to its
 * implementation and builds an instance from a partner_configs row (secrets decrypted in
 * memory only). Which payment_method goes to which connector lives in
 * services/routing/routeMap.ts; which partner config serves a request (merchant priority,
 * fallback, circuit breaker) is decided by services/routing/routeEngine.ts (P3.8).
 */

const VNPAY_PRODUCTION_API_URL = "https://merchant.vnpay.vn/merchant_webapi/api/transaction";

interface ConnectorDefinition {
  code: string;
  /** partner_configs.connector_type value */
  connectorType: string;
  create(config: ConnectorConfig): PaymentConnector;
  defaultEndpoint: string;
  apiEndpoint(env: ConnectorConfig["environment"]): string;
}

const DEFINITIONS: ConnectorDefinition[] = [
  {
    code: "vnpay",
    connectorType: "VNPay",
    create: (config) => new VnpayConnector(config),
    defaultEndpoint: VNPAY_SANDBOX_PAY_URL,
    apiEndpoint: (env) =>
      env === "Production"
        ? VNPAY_PRODUCTION_API_URL
        : (process.env.VNPAY_API_URL ?? VNPAY_SANDBOX_API_URL),
  },
];

export class ConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorUnavailableError";
  }
}

export function definitionForCode(code: string): ConnectorDefinition | undefined {
  return DEFINITIONS.find((d) => d.code === code);
}

export interface ResolvedConnector {
  connector: PaymentConnector;
  partnerConfigId: number;
  callbackUrl: string | null;
}

export function definitionForConnectorType(connectorType: string): ConnectorDefinition | undefined {
  return DEFINITIONS.find((d) => d.connectorType === connectorType);
}

/**
 * Build a connector instance from a partner_configs row regardless of its status
 * (used by "test connection" before a config is activated). Secrets are decrypted in memory.
 */
export function connectorFromPartnerConfig(pc: PartnerConfig): ResolvedConnector {
  const def = definitionForConnectorType(pc.connectorType);
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
    apiEndpoint: def.apiEndpoint(pc.environment),
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
  const def = definitionForCode(code);
  if (!def) throw new ConnectorUnavailableError(`Unknown connector: ${code}`);
  return buildFromPartnerConfig(def, partnerConfigId ?? undefined);
}
