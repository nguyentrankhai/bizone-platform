"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
} from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, inputAutoCls, useLoad } from "@/components/staff/shared";
import { Pager } from "@/components/suppliers/shared";
import { FlashSaleForm } from "./FlashSaleForm";
import { MarketingHeader, StatusPill, fmtDT, type Outputs } from "./shared";

type Detail = Outputs["flashSale"]["get"];
type Status = "scheduled" | "active" | "ended" | "cancelled";
const STATUS = {
  scheduled: { label: "Sắp diễn ra", tone: "blue" },
  active: { label: "Đang diễn ra", tone: "green" },
  ended: { label: "Đã kết thúc", tone: "slate" },
  cancelled: { label: "Đã huỷ", tone: "red" },
} as const;

export function FlashSaleList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | Status>("");
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Detail | "new" | null>(null);
  const input = { page, pageSize: 20, ...(status ? { status } : {}) };
  const list = useLoad(JSON.stringify(input), () => trpc.flashSale.list.query(input, ctx));
  const detail = useLoad(`fs:${open ?? 0}`, () =>
    open ? trpc.flashSale.get.query({ id: open }, ctx) : Promise.resolve(null),
  );
  const rows = list.data?.items ?? [];

  async function act(kind: "end" | "cancel", id: number, name: string) {
    if (!confirm(kind === "end" ? `Kết thúc ngay "${name}"?` : `Huỷ flash sale "${name}"?`)) return;
    try {
      if (kind === "end") await trpc.flashSale.end.mutate({ id }, ctx);
      else await trpc.flashSale.cancel.mutate({ id }, ctx);
      list.reload();
      detail.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function edit(id: number) {
    try {
      setForm(await trpc.flashSale.get.query({ id }, ctx));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <MarketingHeader
        title="Flash sale"
        subtitle="Giá sốc theo khung giờ — POS tự áp dụng khi bắt đầu, tự về giá thường khi hết giờ hoặc hết suất"
        actions={
          <button type="button" className={btnPrimary} onClick={() => setForm("new")}>
            <Plus className="h-4 w-4" /> Tạo flash sale
          </button>
        }
      />
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
      <ErrorBox message={list.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Chương trình</th>
                <th className="px-4 py-3">Khung giờ</th>
                <th className="px-4 py-3 text-right">Sản phẩm</th>
                <th className="px-4 py-3 text-right">Đã bán</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {list.loading ? "Đang tải…" : "Chưa có flash sale"}
                  </td>
                </tr>
              )}
              {rows.map((f) => (
                <Fragment key={f.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="flex items-center gap-1 font-medium text-slate-800"
                        onClick={() => setOpen(open === f.id ? null : f.id)}
                        aria-expanded={open === f.id}
                      >
                        {open === f.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {f.name}
                      </button>
                      {f.description && (
                        <div className="ml-5 text-xs text-slate-500">{f.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                      {fmtDT(f.startTime)} → {fmtDT(f.endTime)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.productCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNumber(f.sold)}
                      {f.limit ? `/${fmtNumber(f.limit)}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={STATUS[f.status].tone}>{STATUS[f.status].label}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-3 text-sm font-medium">
                        {f.status === "scheduled" && (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => edit(f.id)}
                          >
                            Sửa
                          </button>
                        )}
                        {f.status === "active" && (
                          <button
                            type="button"
                            className="text-slate-700 hover:underline"
                            onClick={() => act("end", f.id, f.name)}
                          >
                            Kết thúc ngay
                          </button>
                        )}
                        {(f.status === "scheduled" || f.status === "active") && (
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() => act("cancel", f.id, f.name)}
                          >
                            Huỷ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open === f.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-4 py-3">
                        {!detail.data ? (
                          <p className="text-sm text-slate-400">Đang tải…</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500">
                              <tr>
                                <th className="py-1">Sản phẩm</th>
                                <th className="py-1 text-right">Giá bán</th>
                                <th className="py-1 text-right">Giá flash</th>
                                <th className="py-1 text-right">Đã bán / suất</th>
                                <th className="py-1 text-right">Suất / khách</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.data.items.map((i) => (
                                <tr key={i.id}>
                                  <td className="py-1">
                                    {i.product.name}{" "}
                                    <span className="text-xs text-slate-500">{i.product.sku}</span>
                                  </td>
                                  <td className="py-1 text-right text-slate-500 tabular-nums line-through">
                                    {fmtMoney(i.regularPrice)}
                                  </td>
                                  <td className="py-1 text-right font-semibold text-rose-600 tabular-nums">
                                    {fmtMoney(i.flashPrice)}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {i.soldQuantity}/{i.quantityLimit || "∞"}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {i.perCustomerLimit || "∞"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
      {form && (
        <FlashSaleForm
          auth={auth}
          sale={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
