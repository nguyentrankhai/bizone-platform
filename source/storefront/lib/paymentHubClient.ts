import "server-only";
import { bizone } from "./bizone-sync";
import { storefrontUrl, type StoreRef } from "./store";

/**
 * Online payment of website orders through Payment Hub (P6.1).
 *
 * The storefront never holds Payment Hub credentials: BizOne owns the merchant API key, opens
 * the Payment Hub transaction for the order (`merchant_txn_id = WEB-{tenant}-{id}`) and receives
 * its webhook. The storefront only sends the customer to the hosted payment page (VNPay / MoMo /
 * ZaloPay / VietQR — the customer picks there) and gives a return URL on this site. Payment Hub
 * appends `txn_code`, `status`, `result` to it; BizOne adds `order`. The return page only shows
 * the outcome — the order is marked paid by the webhook (or BizOne asking Payment Hub), never by
 * the browser.
 */

/** Return URL handed to Payment Hub (must be on the storefront URL configured in BizOne) */
export function paymentReturnUrl(): string {
  return `${storefrontUrl()}/checkout/result`;
}

export interface PaymentReturn {
  orderCode: string | null;
  txnCode: string | null;
  /** What the browser was told — informative only */
  result: "success" | "failed" | "pending" | null;
}

export function parsePaymentReturn(
  q: Record<string, string | string[] | undefined>,
): PaymentReturn {
  const one = (k: string) => {
    const v = q[k];
    return typeof v === "string" ? v : null;
  };
  const order = one("order");
  const result = one("result");
  return {
    orderCode: order && /^[A-Z0-9-]{6,50}$/.test(order) ? order : null,
    txnCode: one("txn_code"),
    result: result === "success" || result === "failed" || result === "pending" ? result : null,
  };
}

/** Payment page of an unpaid order (re-uses the open Payment Hub transaction if any) */
export async function startOrderPayment(
  store: StoreRef,
  code: string,
  who: { token?: string | null; phone?: string | null },
): Promise<string> {
  const r = await bizone.payOrder(store, code, paymentReturnUrl(), who);
  return r.paymentUrl;
}
