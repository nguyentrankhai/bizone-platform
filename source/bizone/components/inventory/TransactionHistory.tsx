"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "./StatusBadge";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
  type RouterOutputs,
} from "./shared";
import type { WarehouseRow } from "./WarehouseTable";

type TxRow = RouterOutputs["inventory"]["transactions"]["items"][number];
type TxDetail = RouterOutputs["inventory"]["transaction"];
type TxType = RouterOutputs["inventory"]["transactionTypes"][number];

const PAGE_SIZE = 20;

interface TransactionHistoryProps {
  auth: ApiAuth;
  warehouses: WarehouseRow[];
  txTypes: TxType[];
  onChanged: () => void;
}

export function TransactionHistory({
  auth,
  warehouses,
  txTypes,
  onChanged,
}: TransactionHistoryProps) {
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TxDetail | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trpc.inventory.transactions.query(
        {
          page,
          pageSize: PAGE_SIZE,
          warehouseId: warehouseId ? Number(warehouseId) : undefined,
          transactionTypeId: typeId ? Number(typeId) : undefined,
          status: (status || undefined) as "draft" | "confirmed" | "cancelled" | undefined,
        },
        apiContext(auth),
      );
      setRows(res.items);
      setTotal(res.meta.total);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, warehouseId, typeId, status, auth.authToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function openDetail(id: number) {
    try {
      setDetail(await trpc.inventory.transaction.query({ id }, apiContext(auth)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function act(id: number, action: "confirm" | "cancel") {
    if (action === "cancel" && !confirm("Huỷ phiếu kho này?")) return;
    setBusyId(id);
    try {
      if (action === "confirm") {
        await trpc.inventory.confirmTransaction.mutate({ id }, apiContext(auth));
        toast.success("Đã xác nhận phiếu — tồn kho đã cập nhật");
      } else {
        await trpc.inventory.cancelTransaction.mutate({ id }, apiContext(auth));
        toast.info("Đã huỷ phiếu");
      }
      setDetail(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectCls =
    "rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm outline-none focus:border-blue-400";

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          aria-label="Lọc theo kho"
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          className={selectCls}
        >
          <option value="">Tất cả kho</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc theo loại phiếu"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setPage(1);
          }}
          className={selectCls}
        >
          <option value="">Tất cả loại phiếu</option>
          {txTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={selectCls}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mã phiếu</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Kho</th>
              <th className="px-4 py-3 text-right">Số dòng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {loading ? "Đang tải..." : "Chưa có phiếu kho"}
                </td>
              </tr>
            ) : (
              rows.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{tx.transactionCode}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {tx.transactionType.direction === "in" ? (
                        <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 text-amber-600" />
                      )}
                      {tx.transactionType.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {tx.warehouse.name}
                    {tx.destinationWarehouse ? ` → ${tx.destinationWarehouse.name}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right">{tx._count.inventoryTransactionItems}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(tx.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {tx.status === "draft" && (
                        <button
                          disabled={busyId === tx.id}
                          onClick={() => act(tx.id, "confirm")}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Xác nhận
                        </button>
                      )}
                      <button
                        onClick={() => openDetail(tx.id)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                        aria-label={`Xem phiếu ${tx.transactionCode}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>{fmtNumber(total)} phiếu</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
          >
            Trước
          </button>
          <span>
            {page}/{totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        size="xl"
        title={detail ? `Phiếu ${detail.transactionCode}` : undefined}
        footer={
          detail?.status === "draft" ? (
            <>
              <button
                onClick={() => act(detail.id, "cancel")}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Huỷ phiếu
              </button>
              <button
                onClick={() => act(detail.id, "confirm")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Xác nhận phiếu
              </button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Loại phiếu" value={detail.transactionType.name} />
              <Info
                label="Kho"
                value={
                  detail.warehouse.name +
                  (detail.destinationWarehouse ? ` → ${detail.destinationWarehouse.name}` : "")
                }
              />
              <Info label="Trạng thái" value={<StatusBadge status={detail.status} />} />
              <Info label="Ngày tạo" value={fmtDate(detail.createdAt, true)} />
            </div>
            {detail.notes && <p className="text-gray-600">Ghi chú: {detail.notes}</p>}
            <table className="w-full">
              <thead className="text-left text-xs text-gray-500 uppercase">
                <tr className="border-b border-gray-200">
                  <th className="py-2">Sản phẩm</th>
                  <th className="py-2">SKU</th>
                  <th className="py-2">Lô / HSD</th>
                  <th className="py-2 text-right">SL</th>
                  <th className="py-2 text-right">Đơn giá</th>
                  <th className="py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detail.inventoryTransactionItems.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.product.name}</td>
                    <td className="py-2 font-mono text-xs">{it.variant?.sku ?? it.product.sku}</td>
                    <td className="py-2 text-gray-500">
                      {it.batch ? `${it.batch.batchCode} · ${fmtDate(it.batch.expiryDate)}` : "—"}
                    </td>
                    <td className="py-2 text-right">{fmtNumber(it.quantity)}</td>
                    <td className="py-2 text-right">
                      {it.unitCost != null ? fmtMoney(it.unitCost) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {it.unitCost != null
                        ? fmtMoney(Number(it.unitCost) * Number(it.quantity))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="mt-0.5 font-medium text-gray-900">{value}</div>
    </div>
  );
}
