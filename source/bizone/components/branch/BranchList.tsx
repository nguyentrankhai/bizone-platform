"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, btnSecondary, useLoad } from "@/components/staff/shared";
import { BranchForm } from "./BranchForm";

/** Quản lý chi nhánh (SRS-CONFIG-03, P4.6) */
export function BranchList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const list = useLoad("branches", () =>
    trpc.branch.list.query({ includeInactive: true }, apiContext(auth)),
  );
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const rows = list.data ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Chi nhánh</h1>
          <p className="text-sm text-slate-500">
            Chi nhánh, kho bán hàng, cấu hình riêng (tài khoản VietQR, tiền tố hoá đơn…)
          </p>
        </div>
        <button onClick={() => setEditing(null)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Thêm chi nhánh
        </button>
      </div>
      <ErrorBox message={list.error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Chi nhánh</th>
              <th className="px-4 py-3">Liên hệ</th>
              <th className="px-4 py-3 text-right">Kho</th>
              <th className="px-4 py-3 text-right">Nhân viên</th>
              <th className="px-4 py-3 text-right">Hoá đơn</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setEditing(b.id)}
                    className="text-left font-medium text-primary hover:underline"
                  >
                    {b.name}
                  </button>
                  <p className="text-xs text-slate-500">
                    {b.code}
                    {b.isDefault && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-amber-800">
                        <Star className="h-3 w-3" /> Mặc định
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {b.address || "—"}
                  {b.phone && <p className="text-xs">{b.phone}</p>}
                </td>
                <td className="px-4 py-3 text-right">{b.warehouseCount}</td>
                <td className="px-4 py-3 text-right">{b.staffCount}</td>
                <td className="px-4 py-3 text-right">{b.invoiceCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      b.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {b.status === "active" ? "Hoạt động" : "Ngừng"}
                  </span>
                  {b.openSessions > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{b.openSessions} ca POS đang mở</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {!b.isDefault && b.status === "active" && (
                      <button
                        className={btnSecondary}
                        onClick={() =>
                          act(
                            () => trpc.branch.setDefault.mutate({ id: b.id }, apiContext(auth)),
                            `${b.name} là chi nhánh mặc định`,
                          )
                        }
                      >
                        Đặt mặc định
                      </button>
                    )}
                    {!b.isDefault && (
                      <button
                        className={btnSecondary}
                        onClick={() =>
                          act(
                            () =>
                              trpc.branch.setStatus.mutate(
                                { id: b.id, status: b.status === "active" ? "inactive" : "active" },
                                apiContext(auth),
                              ),
                            b.status === "active" ? `Đã ngừng ${b.name}` : `Đã mở lại ${b.name}`,
                          )
                        }
                      >
                        {b.status === "active" ? "Ngừng" : "Mở lại"}
                      </button>
                    )}
                    {!b.isDefault && b.invoiceCount === 0 && (
                      <button
                        className={cn(btnSecondary, "text-red-600")}
                        onClick={() =>
                          confirm(`Xoá chi nhánh ${b.name}?`) &&
                          act(
                            () => trpc.branch.delete.mutate({ id: b.id }, apiContext(auth)),
                            `Đã xoá ${b.name}`,
                          )
                        }
                      >
                        Xoá
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!list.loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Chưa có chi nhánh
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <BranchForm
        open={editing !== undefined}
        auth={auth}
        branchId={editing ?? null}
        onClose={() => setEditing(undefined)}
        onSaved={(m) => {
          toast.success(m);
          setEditing(undefined);
          list.reload();
        }}
      />
    </div>
  );
}
