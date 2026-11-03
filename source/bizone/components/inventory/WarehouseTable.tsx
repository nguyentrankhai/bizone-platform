"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/forms/Input";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, fmtNumber, type ApiAuth, type RouterOutputs } from "./shared";

export type WarehouseRow = RouterOutputs["warehouse"]["list"][number];
type StockRow = RouterOutputs["inventory"]["stockByWarehouse"][number];

interface WarehouseTableProps {
  auth: ApiAuth;
  warehouses: WarehouseRow[];
  stock: StockRow[];
  loading?: boolean;
  onChanged: () => void;
}

interface FormState {
  id?: number;
  name: string;
  code: string;
  address: string;
  isActive: boolean;
}

const EMPTY: FormState = { name: "", code: "", address: "", isActive: true };

export function WarehouseTable({
  auth,
  warehouses,
  stock,
  loading,
  onChanged,
}: WarehouseTableProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function save() {
    if (!form) return;
    if (!form.name.trim() || !form.code.trim()) {
      setFormError("Vui lòng nhập tên và mã kho");
      return;
    }
    setSaving(true);
    setFormError(null);
    const data = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (form.id) {
        await trpc.warehouse.update.mutate({ id: form.id, data }, apiContext(auth));
        toast.success(`Đã cập nhật kho ${data.name}`);
      } else {
        await trpc.warehouse.create.mutate(data, apiContext(auth));
        toast.success(`Đã thêm kho ${data.name}`);
      }
      setForm(null);
      onChanged();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(wh: WarehouseRow) {
    if (!confirm(`Xoá kho "${wh.name}"?`)) return;
    try {
      await trpc.warehouse.delete.mutate({ id: wh.id }, apiContext(auth));
      toast.success(`Đã xoá kho ${wh.name}`);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => {
            setFormError(null);
            setForm(EMPTY);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Thêm kho
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mã kho</th>
              <th className="px-4 py-3">Tên kho</th>
              <th className="px-4 py-3">Địa chỉ</th>
              <th className="px-4 py-3 text-right">Mặt hàng</th>
              <th className="px-4 py-3 text-right">Tổng tồn</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && warehouses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Đang tải...
                </td>
              </tr>
            ) : warehouses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Chưa có kho nào
                </td>
              </tr>
            ) : (
              warehouses.map((wh) => {
                const s = stock.find((x) => x.id === wh.id);
                return (
                  <tr key={wh.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{wh.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{wh.name}</td>
                    <td className="px-4 py-3 text-gray-500">{wh.address ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{fmtNumber(s?.itemCount)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtNumber(s?.totalQuantity)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          wh.isActive
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                        }
                      >
                        {wh.isActive ? "Hoạt động" : "Ngừng"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setFormError(null);
                            setForm({
                              id: wh.id,
                              name: wh.name,
                              code: wh.code,
                              address: wh.address ?? "",
                              isActive: wh.isActive,
                            });
                          }}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                          aria-label={`Sửa kho ${wh.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(wh)}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                          aria-label={`Xoá kho ${wh.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Sửa kho" : "Thêm kho mới"}
        footer={
          <>
            <button
              onClick={() => setForm(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Huỷ
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            <Input
              id="wh-name"
              label="Tên kho"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              id="wh-code"
              label="Mã kho"
              required
              hint="Chữ cái, số, dấu gạch ngang"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              id="wh-address"
              label="Địa chỉ"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Đang hoạt động
            </label>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
