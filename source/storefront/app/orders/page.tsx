import Link from "next/link";
import type { Metadata } from "next";
import { bizone } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { customerToken, guestOrders } from "@/lib/session";
import { PageTitle, StatusBadge } from "@/components/ui";
import { OrderLookup } from "@/components/OrderLookup";
import { fmtDateTime, fmtVnd } from "@/lib/format";

export const metadata: Metadata = { title: "Đơn hàng" };

/** Theo dõi đơn hàng: khách đã đăng nhập xem danh sách; khách vãng lai tra cứu mã đơn + SĐT */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const store = await currentStore();
  const token = await customerToken(store);
  const list = token ? await bizone.orders(store, token, page).catch(() => null) : null;
  const guest = [...(await guestOrders(store)).keys()];

  return (
    <div className="space-y-6">
      <PageTitle>Đơn hàng của tôi</PageTitle>
      {list ? (
        list.items.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-slate-500">
            Bạn chưa có đơn hàng nào
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {list.items.map((o) => (
              <li key={o.code}>
                <Link
                  href={`/orders/${o.code}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium">{o.code}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDateTime(o.createdAt)} · {o.itemCount} sản phẩm
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={o.status} label={o.statusLabel} />
                    <span className="font-semibold">{fmtVnd(o.totalAmount)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        guest.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold">Đơn đã đặt trên trình duyệt này</h2>
            <ul className="flex flex-wrap gap-2">
              {guest.map((c) => (
                <li key={c}>
                  <Link
                    href={`/orders/${c}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-primary"
                  >
                    {c}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
      {list && list.total > list.limit && (
        <nav className="flex justify-center gap-3 text-sm">
          {page > 1 && <Link href={`/orders?page=${page - 1}`}>Trước</Link>}
          {page * list.limit < list.total && <Link href={`/orders?page=${page + 1}`}>Sau</Link>}
        </nav>
      )}
      <div className="max-w-md space-y-2">
        <h2 className="font-semibold">Tra cứu đơn hàng</h2>
        <OrderLookup />
      </div>
    </div>
  );
}
