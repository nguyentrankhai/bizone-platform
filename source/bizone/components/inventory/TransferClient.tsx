"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { TransferForm } from "./TransferForm";
import { StatusBadge } from "./StatusBadge";
import { apiContext, errorMessage, fmtDate, type ApiAuth, type RouterOutputs } from "./shared";

type TransferRow = RouterOutputs["transfer"]["list"]["items"][number];
type Warehouse = RouterOutputs["warehouse"]["list"][number];

export function TransferClient({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trpc.transfer.list.query(
        {
          status: (status || undefined) as "draft" | "confirmed" | "cancelled" | undefined,
          page: 1,
          pageSize: 50,
        },
        apiContext(auth),
      );
      setRows(res.items);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, auth.authToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    trpc.warehouse.list
      .query(undefined, apiContext(auth))
      .then((w) => setWarehouses(w.filter((x) => x.isActive)))
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authToken]);

  async function act(id: number, action: "confirm" | "cancel") {
    if (action === "cancel" && !confirm("Huỷ phiếu chuyển kho này?")) return;
    setBusyId(id);
    try {
      if (action === "confirm") {
        await trpc.transfer.confirm.mutate({ id }, apiContext(auth));
        toast.success("Đã xác nhận chuyển kho");
      } else {
        await trpc.transfer.cancel.mutate({ id }, apiContext(auth));
        toast.info("Đã huỷ phiếu chuyển kho");
      }
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (creating) {
    return warehouses.length < 2 ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Cần ít nhất 2 kho đang hoạt động để chuyển kho.{" "}
        <button className="font-medium underline" onClick={() => setCreating(false)}>
          Quay lại
        </button>
      </div>
    ) : (
      <TransferForm
        auth={auth}
        warehouses={warehouses}
        onCancel={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Tạo phiếu chuyển kho
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mã phiếu</th>
              <th className="px-4 py-3">Kho nguồn → Kho đích</th>
              <th className="px-4 py-3 text-right">Số dòng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {loading ? "Đang tải..." : "Chưa có phiếu chuyển kho"}
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{t.transactionCode}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {t.warehouse.name} <ArrowRight className="h-3.5 w-3.5 text-gray-400" />{" "}
                      {t.destinationWarehouse?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{t._count.inventoryTransactionItems}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(t.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    {t.status === "draft" && (
                      <div className="flex justify-end gap-1">
                        <button
                          disabled={busyId === t.id}
                          onClick={() => act(t.id, "cancel")}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Huỷ
                        </button>
                        <button
                          disabled={busyId === t.id}
                          onClick={() => act(t.id, "confirm")}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Xác nhận
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
