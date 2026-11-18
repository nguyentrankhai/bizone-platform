import type { Quote } from "@/lib/types";
import { fmtVnd } from "@/lib/format";

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function QuoteSummary({ quote }: { quote: Quote }) {
  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm"
      data-testid="quote"
    >
      <Row label="Tạm tính" value={fmtVnd(quote.subtotal)} />
      {quote.promotions.map((p) => (
        <Row
          key={p.label}
          label={p.label}
          value={`-${fmtVnd(p.discount)}`}
          className="text-red-600"
        />
      ))}
      {quote.memberDiscount > 0 && (
        <Row
          label={`Ưu đãi thành viên (${quote.memberDiscountPercent}%)`}
          value={`-${fmtVnd(quote.memberDiscount)}`}
          className="text-green-700"
        />
      )}
      {quote.coupon && quote.shippingDiscount === 0 && (
        <Row
          label={`Mã ${quote.coupon.code}`}
          value={`-${fmtVnd(quote.coupon.discount)}`}
          className="text-green-700"
        />
      )}
      <Row
        label="Phí giao hàng"
        value={quote.shippingFee ? fmtVnd(quote.shippingFee) : "Miễn phí"}
      />
      {quote.shippingDiscount > 0 && (
        <Row
          label={`Mã ${quote.coupon?.code ?? ""} (miễn phí giao hàng)`}
          value={`-${fmtVnd(quote.shippingDiscount)}`}
          className="text-green-700"
        />
      )}
      <Row
        label="Tổng thanh toán"
        value={fmtVnd(quote.total)}
        className="border-t border-slate-200 pt-2 text-base font-bold"
      />
      {quote.freeShippingFrom !== null &&
        quote.shippingFee > 0 &&
        quote.goodsTotal < quote.freeShippingFrom && (
          <p className="text-xs text-slate-500">
            Mua thêm {fmtVnd(quote.freeShippingFrom - quote.goodsTotal)} để được miễn phí giao hàng
          </p>
        )}
    </div>
  );
}
