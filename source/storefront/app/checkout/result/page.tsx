import { redirect } from "next/navigation";
import { parsePaymentReturn } from "@/lib/paymentHubClient";

/**
 * Payment Hub sends the customer back here (`return_url`). The query only says what the
 * browser saw; the order page reads the real status from BizOne (webhook / status check).
 */
export default async function PaymentResult({ searchParams }: PageProps<"/checkout/result">) {
  const r = parsePaymentReturn(await searchParams);
  if (!r.orderCode) redirect("/orders");
  redirect(`/orders/${r.orderCode}?payment=${r.result ?? "pending"}`);
}
