/**
 * Route map (P3.8) — which connector handles each `payment_method`.
 *
 * Pure data, no server imports: shared by the Route Engine, the API validators and the
 * hosted payment page. Adding a PSP = one entry here + its connector (see P5.1/P5.2).
 *
 * `kind` tells the payment service how a selected partner is used:
 *   - "redirect": a PaymentConnector builds a PSP payment URL (VNPay, MoMo, ZaloPay)
 *   - "qr":       Payment Hub renders a VietQR bank-transfer code itself (qr.service)
 */

export type RouteKind = "redirect" | "qr";

export interface RouteMethod {
  /** partner_configs.connector_type */
  connectorType: string;
  /** connectors.code (plugin registry) */
  connectorCode: string;
  kind: RouteKind;
  /** Label on the hosted payment page */
  label: string;
  /** Amount limits (VND) the PSP accepts for this method — outside → 400 / hidden on /pay. */
  minAmount?: number;
  maxAmount?: number;
}

export const ROUTE_MAP = {
  vnpay_qr: { connectorType: "VNPay", connectorCode: "vnpay", kind: "redirect", label: "VNPay QR" },
  vnpay_atm: {
    connectorType: "VNPay",
    connectorCode: "vnpay",
    kind: "redirect",
    label: "Thẻ ATM / Tài khoản ngân hàng (VNPay)",
  },
  vnpay_card: {
    connectorType: "VNPay",
    connectorCode: "vnpay",
    kind: "redirect",
    label: "Thẻ quốc tế (VNPay)",
  },
  vnpay: {
    connectorType: "VNPay",
    connectorCode: "vnpay",
    kind: "redirect",
    label: "VNPay (chọn trên cổng VNPay)",
  },
  vietqr: {
    connectorType: "VietQR",
    connectorCode: "vietqr",
    kind: "qr",
    label: "Chuyển khoản VietQR (NAPAS 247)",
  },
  momo_qr: {
    connectorType: "MoMo",
    connectorCode: "momo",
    kind: "redirect",
    label: "Ví MoMo",
    // captureWallet limits (services/connectors/momo/momo.util.ts)
    minAmount: 1_000,
    maxAmount: 50_000_000,
  },
  zalopay_qr: {
    connectorType: "ZaloPay",
    connectorCode: "zalopay",
    kind: "redirect",
    label: "Ví ZaloPay",
  },
} as const satisfies Record<string, RouteMethod>;

export type PaymentMethod = keyof typeof ROUTE_MAP;

export const PAYMENT_METHODS = Object.keys(ROUTE_MAP) as PaymentMethod[];

export function isPaymentMethod(method: string): method is PaymentMethod {
  return Object.prototype.hasOwnProperty.call(ROUTE_MAP, method);
}

export function routeFor(method: string): RouteMethod | undefined {
  return isPaymentMethod(method) ? ROUTE_MAP[method] : undefined;
}

/** null when `amount` fits the method's limits, otherwise a message for the API / page. */
export function amountError(method: string, amount: number): string | null {
  const route = routeFor(method) as RouteMethod | undefined;
  if (!route) return null;
  if (route.minAmount !== undefined && amount < route.minAmount) {
    return `${route.label}: số tiền tối thiểu ${route.minAmount.toLocaleString("vi-VN")} ₫`;
  }
  if (route.maxAmount !== undefined && amount > route.maxAmount) {
    return `${route.label}: số tiền tối đa ${route.maxAmount.toLocaleString("vi-VN")} ₫`;
  }
  return null;
}

/** Methods served by a connector type (e.g. VNPay → vnpay_qr, vnpay_atm, …). */
export function methodsForConnectorType(connectorType: string): PaymentMethod[] {
  return PAYMENT_METHODS.filter((m) => ROUTE_MAP[m].connectorType === connectorType);
}
