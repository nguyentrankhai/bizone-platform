import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { bizone, StoreApiError } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { customerToken, readCart } from "@/lib/session";
import { Alert, PageTitle } from "@/components/ui";
import { QuoteSummary } from "@/components/QuoteSummary";
import { CheckoutForm } from "@/components/CheckoutForm";

export const metadata: Metadata = { title: "Thanh toán" };

/** Thông tin giao hàng + phương thức thanh toán (COD / online qua Payment Hub) */
export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const sp = await searchParams;
  const coupon = typeof sp.coupon === "string" ? sp.coupon.trim().slice(0, 100) : "";
  const store = await currentStore();
  const [items, token, info] = await Promise.all([
    readCart(store),
    customerToken(store),
    bizone.store(store),
  ]);
  if (items.length === 0) redirect("/cart");
  const profile = token ? await bizone.me(store, token).catch(() => null) : null;
  let quote;
  let error = "";
  try {
    quote = await bizone.quote(store, items, coupon || null, profile ? token : null);
  } catch (e) {
    error = e instanceof StoreApiError ? e.message : "Không tính được giỏ hàng";
  }

  return (
    <div>
      <PageTitle back={{ href: "/cart", label: "Giỏ hàng" }}>Đặt hàng</PageTitle>
      {error && <Alert>{error}</Alert>}
      {quote && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <CheckoutForm
            idempotencyKey={randomUUID()}
            couponCode={quote.coupon ? coupon : ""}
            paymentMethods={info.paymentMethods}
            paymentMinutes={info.paymentMinutes}
            profile={
              profile
                ? {
                    name: profile.fullName,
                    phone: profile.phone,
                    email: profile.email ?? "",
                    address:
                      profile.addresses.find((a) => a.isDefault)?.address ??
                      profile.addresses[0]?.address ??
                      "",
                  }
                : null
            }
            disabled={quote.stockProblems.length > 0}
          />
          <aside className="space-y-3">
            <ul className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              {quote.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {l.name} × {l.quantity}
                    {l.gift && " (quà)"}
                  </span>
                </li>
              ))}
            </ul>
            <QuoteSummary quote={quote} />
            {quote.stockProblems.length > 0 && (
              <Alert>Không đủ hàng: {quote.stockProblems.join("; ")}</Alert>
            )}
            {!profile && (
              <p className="text-center text-xs text-slate-500">
                Đã có tài khoản?{" "}
                <Link href="/login?next=/checkout" className="text-primary hover:underline">
                  Đăng nhập
                </Link>{" "}
                để được giảm giá thành viên và tích điểm
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
