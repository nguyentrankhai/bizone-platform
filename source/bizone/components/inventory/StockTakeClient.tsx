"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { StockTakeForm } from "./StockTakeForm";
import { StatusBadge } from "./StatusBadge";
import { apiContext, errorMessage, fmtDate, type ApiAuth, type RouterOutputs } from "./shared";

type NoteRow = RouterOutputs["stockTake"]["list"]["items"][number];
type Warehouse = RouterOutputs["warehouse"]["list"][number];

export function StockTakeClient({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trpc.stockTake.list.query(
        {
          status: (status || undefined) as
            "draft" | "in_progress" | "completed" | "cancelled" | undefined,
          page: 1,
          pageSize: 50,
        },
        apiContext(auth),
      );
      setNotes(res.items);
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
      .then((w) => {
        const active = w.filter((x) => x.isActive);
        setWarehouses(active);
        setNewWarehouseId(String(active[0]?.id ?? ""));
      })
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authToken]);

  async function create() {
    if (!newWarehouseId) return;
    setSaving(true);
    try {
      const note = await trpc.stockTake.create.mutate(
        { warehouseId: Number(newWarehouseId), notes: newNotes.trim() || null },
        apiContext(auth),
      );
      toast.success(`Đã tạo phiếu ${note.code} với ${note._count.stockTakeItems} sản phẩm`);
      setCreating(false);
      setNewNotes("");
      setOpenId(note.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (openId !== null) {
    return (
      <StockTakeForm
        auth={auth}
        stockTakeId={openId}
        onBack={() => {
          setOpenId(null);
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
          <option value="in_progress">Đang kiểm</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Tạo phiếu kiểm kê
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mã phiếu</th>
              <th className="px-4 py-3">Kho</th>
              <th className="px-4 py-3 text-right">Số SP</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3">Hoàn thành</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {notes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {loading ? "Đang tải..." : "Chưa có phiếu kiểm kê"}
                </td>
              </tr>
            ) : (
              notes.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{n.code}</td>
                  <td className="px-4 py-3">{n.warehouse.name}</td>
                  <td className="px-4 py-3 text-right">{n._count.stockTakeItems}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(n.createdAt, true)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(n.completedAt, true)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setOpenId(n.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {n.status === "draft" || n.status === "in_progress" ? "Kiểm kê" : "Xem"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Tạo phiếu kiểm kê"
        footer={
          <>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Huỷ
            </button>
            <button
              onClick={create}
              disabled={saving || !newWarehouseId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Đang tạo..." : "Tạo phiếu"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5 font-medium text-gray-700">
            Kho kiểm kê
            <select
              value={newWarehouseId}
              onChange={(e) => setNewWarehouseId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none focus:border-blue-400"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-medium text-gray-700">
            Ghi chú
            <textarea
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 font-normal outline-none focus:border-blue-400"
            />
          </label>
          <p className="text-xs text-gray-500">
            Phiếu tự lấy danh sách sản phẩm và tồn hệ thống hiện tại của kho.
          </p>
        </div>
      </Modal>
    </div>
  );
}
