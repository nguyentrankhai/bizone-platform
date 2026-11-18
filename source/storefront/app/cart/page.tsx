import Link from "next/link";
import type { Metadata } from "next";
import { bizone, StoreApiError } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { customerToken, readCart } from "@/lib/session";
import { updateCartAction } from "@/app/actions";
import { Alert, PageTitle, btn, input } from "@/components/ui";
import { QuoteSummary } from "@/components/QuoteSummary";
import { fmtVnd } from "@/lib/format";

export const metadata: Metadata = { title: "Giỏ hàng" };

/** Giỏ hàng: BizOne tính lại giá, khuyến mãi, mã giảm giá và kiểm tồn kho mỗi lần xem */
export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const sp = await searchParams;
  const coupon = typeof sp.coupon === "string" ? sp.coupon.trim().slice(0, 100).toUpperCase() : "";
  const store = await currentStore();
  const [items, token] = await Promise.all([readCart(store), customerToken(store)]);
  if (items.length === 0)
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <PageTitle>Giỏ hàng trống</PageTitle>
        <Link href="/" className={btn}>
          Tiếp tục mua sắm
        </Link>
      </div>
    );

  let quote;
  let error = "";
  try {
    quote = await bizone.quote(store, items, coupon || null, token);
  } catch (e) {
    error = e instanceof StoreApiError ? e.message : "Không tính được giỏ hàng";
  }

  return (
    <div>
      <PageTitle back={{ href: "/", label: "Tiếp tục mua sắm" }}>Giỏ hàng</PageTitle>
      {error && (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <p className="text-sm text-slate-500">
            Một sản phẩm trong giỏ có thể đã ngừng bán — xoá giỏ để chọn lại.
          </p>
          {items.map((i) => (
            <form
              key={`${i.productId}-${i.variantId}`}
              action={updateCartAction}
              className="flex items-center gap-2 text-sm"
            >
              <input type="hidden" name="productId" value={i.productId} />
              {i.variantId && <input type="hidden" name="variantId" value={i.variantId} />}
              <input type="hidden" name="quantity" value={0} />
              <span>
                Sản phẩm #{i.productId} × {i.quantity}
              </span>
              <button className="text-red-600 hover:underline">Xoá</button>
            </form>
          ))}
        </div>
      )}
      {quote && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {quote.lines.map((l, idx) => (
              <li
                key={`${l.productId}-${l.variantId}-${idx}`}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${l.slug}`} className="font-medium hover:text-primary">
                    {l.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {l.sku} · {fmtVnd(l.unitPrice)} / {l.unit}
                  </div>
                  {l.gift && <div className="text-xs font-medium text-green-600">Quà tặng kèm</div>}
                  {l.promotions.map((p) => (
                    <div key={p} className="text-xs text-red-600">
                      {p}
                    </div>
                  ))}
                  {l.stock !== null && l.quantity > l.stock && (
                    <div className="text-xs font-medium text-red-600">
                      Chỉ còn {l.stock} {l.unit}
                    </div>
                  )}
                </div>
                {l.gift ? (
                  <span className="text-sm">× {l.quantity}</span>
                ) : (
                  <form action={updateCartAction} className="flex items-center gap-2">
                    <input type="hidden" name="productId" value={l.productId} />
                    {l.variantId && <input type="hidden" name="variantId" value={l.variantId} />}
                    <input
                      aria-label={`Số lượng ${l.name}`}
                      name="quantity"
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={l.quantity}
                      className={`${input} h-9 w-20`}
                    />
                    <button className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
                      Cập nhật
                    </button>
                  </form>
                )}
                <div className="w-28 text-right">
                  <div className="font-semibold">{fmtVnd(l.totalAmount)}</div>
                  {l.discountAmount > 0 && (
                    <div className="text-xs text-slate-400 line-through">
                      {fmtVnd(l.unitPrice * l.quantity)}
                    </div>
                  )}
                </div>
                {!l.gift && (
                  <form action={updateCartAction}>
                    <input type="hidden" name="productId" value={l.productId} />
                    {l.variantId && <input type="hidden" name="variantId" value={l.variantId} />}
                    <input type="hidden" name="quantity" value={0} />
                    <button className="text-sm text-red-600 hover:underline">Xoá</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <aside className="space-y-4">
            <form action="/cart" className="flex gap-2">
              <input
                name="coupon"
                defaultValue={coupon}
                placeholder="Mã giảm giá"
                aria-label="Mã giảm giá"
                className={input}
              />
              <button className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium">
                Áp dụng
              </button>
            </form>
            {coupon && quote.couponError && <Alert>{quote.couponError}</Alert>}
            <QuoteSummary quote={quote} />
            {quote.stockProblems.length > 0 && (
              <Alert>Không đủ hàng: {quote.stockProblems.join("; ")}</Alert>
            )}
            {quote.stockProblems.length === 0 ? (
              <Link
                href={`/checkout${coupon && !quote.couponError ? `?coupon=${encodeURIComponent(coupon)}` : ""}`}
                className={`${btn} w-full`}
              >
                Đặt hàng
              </Link>
            ) : (
              <span className={`${btn} w-full opacity-50`}>Đặt hàng</span>
            )}
            {!token && (
              <p className="text-center text-xs text-slate-500">
                <Link href="/login?next=/cart" className="text-primary hover:underline">
                  Đăng nhập
                </Link>{" "}
                để nhận ưu đãi thành viên và tích điểm
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
