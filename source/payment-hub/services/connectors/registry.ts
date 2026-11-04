import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { ConnectorConfig, PaymentConnector } from "./types";
import { VNPAY_SANDBOX_API_URL, VNPAY_SANDBOX_PAY_URL, VnpayConnector } from "./vnpay";

/**
 * Connector registry — maps a connector code to its implementation and builds an
 * instance from the Active partner_configs row (secrets decrypted in memory only).
 * Partner selection by rules/priority/failover is the Route Engine's job (P3.8);
 * here we take the first Active config for the connector type.
 */

const VNPAY_PRODUCTION_API_URL = "https://merchant.vnpay.vn/merchant_webapi/api/transaction";

interface ConnectorDefinition {
  code: string;
  /** partner_configs.connector_type value */
  connectorType: string;
  /** payment_method values handled by this connector */
  methods: string[];
  create(config: ConnectorConfig): PaymentConnector;
  defaultEndpoint: string;
  apiEndpoint(env: ConnectorConfig["environment"]): string;
}

const DEFINITIONS: ConnectorDefinition[] = [
  {
    code: "vnpay",
    connectorType: "VNPay",
    methods: ["vnpay", "vnpay_qr", "vnpay_atm", "vnpay_card"],
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

export function definitionForMethod(method: string): ConnectorDefinition | undefined {
  return DEFINITIONS.find((d) => d.methods.includes(method));
}

export function definitionForCode(code: string): ConnectorDefinition | undefined {
  return DEFINITIONS.find((d) => d.code === code);
}

export function supportedPaymentMethods(): string[] {
  return DEFINITIONS.flatMap((d) => d.methods);
}

export interface ResolvedConnector {
  connector: PaymentConnector;
  partnerConfigId: number;
  callbackUrl: string | null;
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

/** Resolve the connector for a payment method (first Active partner config). */
export async function resolveConnectorForMethod(method: string): Promise<ResolvedConnector> {
  const def = definitionForMethod(method);
  if (!def) throw new ConnectorUnavailableError(`Unsupported payment method: ${method}`);
  return buildFromPartnerConfig(def);
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
