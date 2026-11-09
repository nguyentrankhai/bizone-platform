"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, inputAutoCls, inputCls, useLoad } from "@/components/staff/shared";
import { Pager } from "@/components/suppliers/shared";
import { couponValue } from "./CouponList";
import { MarketingHeader, RANKING_LABEL, StatusPill, fmtDT } from "./shared";

const STATUS = {
  active: { label: "Còn hiệu lực", tone: "green" },
  used: { label: "Đã dùng", tone: "blue" },
  expired: { label: "Hết hạn", tone: "slate" },
  cancelled: { label: "Đã huỷ", tone: "red" },
} as const;
type Status = keyof typeof STATUS;

export function VoucherList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [couponId, setCouponId] = useState<number | "">("");
  const coupons = useLoad("coupon-options", () => trpc.coupon.options.query(undefined, ctx));
  const input = {
    page,
    pageSize: 20,
    ...(query ? { search: query } : {}),
    ...(status ? { status } : {}),
    ...(couponId ? { couponId: Number(couponId) } : {}),
  };
  const list = useLoad(JSON.stringify(input), () => trpc.coupon.vouchers.query(input, ctx));
  const rows = list.data?.items ?? [];

  async function cancel(id: number, code: string) {
    if (!confirm(`Huỷ voucher ${code}?`)) return;
    try {
      await trpc.coupon.cancelVoucher.mutate({ id }, ctx);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <MarketingHeader
        title="Voucher khách hàng"
        subtitle="Mã cá nhân dùng 1 lần, phát hành từ mã giảm giá (nút “Phát voucher” ở tab Mã giảm giá)"
      />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Mã voucher, tên / SĐT khách (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm voucher"
          />
        </div>
        <select
          className={inputAutoCls}
          value={couponId}
          onChange={(e) => {
            setPage(1);
            setCouponId(e.target.value ? Number(e.target.value) : "");
          }}
          aria-label="Mã gốc"
        >
          <option value="">Mọi mã gốc</option>
          {(coupons.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <select
          className={inputAutoCls}
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as "" | Status);
          }}
          aria-label="Trạng thái"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
      </form>
      <ErrorBox message={list.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Voucher</th>
                <th className="px-4 py-3">Mức giảm</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Phát hành</th>
                <th className="px-4 py-3">Hết hạn</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {list.loading ? "Đang tải…" : "Chưa có voucher"}
                  </td>
                </tr>
              )}
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{v.code}</td>
                  <td className="px-4 py-3">
                    {v.coupon ? couponValue(v.coupon) : "—"}
                    <div className="text-xs text-slate-500">{v.coupon?.code}</div>
                  </td>
                  <td className="px-4 py-3">
                    {v.customer ? (
                      <>
                        {v.customer.fullName}
                        <div className="text-xs text-slate-500">
                          {v.customer.phone} ·{" "}
                          {RANKING_LABEL[v.customer.ranking] ?? v.customer.ranking}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Không gắn khách</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDT(v.issuedAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDT(v.expiredAt)}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusPill>
                    {v.usedAt && <div className="text-xs text-slate-500">{fmtDT(v.usedAt)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {v.status === "active" && (
                      <button
                        type="button"
                        className="text-sm font-medium text-red-600 hover:underline"
                        onClick={() => cancel(v.id, v.code)}
                      >
                        Huỷ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && (
          <Pager
            page={list.data.meta.page}
            totalPages={list.data.meta.totalPages}
            total={list.data.meta.total}
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}
