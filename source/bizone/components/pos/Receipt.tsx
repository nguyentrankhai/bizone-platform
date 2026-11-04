import { fmtDate, fmtMoney, type RouterOutputs } from "@/components/inventory/shared";
import { METHOD_LABEL } from "./PaymentModal";
import type { PaymentMethod } from "@/lib/validators/pos";

type PrintData = RouterOutputs["pos"]["print"];

/**
 * Hóa đơn nhiệt 80mm. Chỉ hiện khi in (`print:block`); phần còn lại của trang POS
 * được ẩn bằng `print:hidden`, nên window.print() in đúng tờ hóa đơn.
 */
export function Receipt({ data }: { data: PrintData | null }) {
  if (!data) return null;
  return (
    <div
      id="pos-receipt"
      className="hidden w-[72mm] font-mono text-[11px] leading-snug text-black print:block"
    >
      <style>{"@page { size: 80mm auto; margin: 4mm; }"}</style>
      <div className="text-center">
        <p className="text-sm font-bold">{data.store.name}</p>
        {data.store.address && <p>{data.store.address}</p>}
        {data.store.phone && <p>ĐT: {data.store.phone}</p>}
        <p className="mt-2 font-bold">HÓA ĐƠN BÁN HÀNG</p>
        <p>
          {data.invoiceCode} · {fmtDate(data.createdAt, true)}
        </p>
        <p>Thu ngân: {data.cashier}</p>
        {data.customer && (
          <p>
            KH: {data.customer.name} ({data.customer.phone})
          </p>
        )}
      </div>
      <hr className="my-1 border-dashed border-black" />
      {data.items.map((i, idx) => (
        <div key={idx}>
          <p>{i.name}</p>
          <p className="flex justify-between">
            <span>
              {i.quantity} x {fmtMoney(i.unitPrice)}
              {i.discountAmount ? ` (−${fmtMoney(i.discountAmount)})` : ""}
            </span>
            <span>{fmtMoney(i.total)}</span>
          </p>
        </div>
      ))}
      <hr className="my-1 border-dashed border-black" />
      <Row label="Tạm tính" value={fmtMoney(data.subtotal)} />
      {data.discountAmount > 0 && (
        <Row label="Giảm giá" value={`−${fmtMoney(data.discountAmount)}`} />
      )}
      <Row label="TỔNG CỘNG" value={fmtMoney(data.total)} bold />
      <Row label="(Đã gồm VAT)" value={fmtMoney(data.taxAmount)} />
      {data.payments.map((p, i) => (
        <Row
          key={i}
          label={METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
          value={fmtMoney(p.amount)}
        />
      ))}
      {data.change > 0 && <Row label="Tiền thừa" value={fmtMoney(data.change)} />}
      {data.status !== "active" && (
        <p className="mt-1 text-center font-bold">
          *** {data.status === "cancelled" ? "ĐÃ HỦY" : "ĐÃ ĐỔI/TRẢ"} ***
        </p>
      )}
      <p className="mt-2 text-center">Cảm ơn quý khách!</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <p className={bold ? "flex justify-between text-xs font-bold" : "flex justify-between"}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}
