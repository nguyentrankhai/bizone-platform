"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { BarcodeScanInput, type ScannedProduct } from "./BarcodeScanInput";
import { apiContext, errorMessage, fmtNumber, type ApiAuth, type RouterOutputs } from "./shared";

type Warehouse = RouterOutputs["warehouse"]["list"][number];

interface Line extends ScannedProduct {
  key: string;
  quantity: string;
  available: number;
}

const STEPS = ["Chọn kho", "Chọn sản phẩm", "Xác nhận"];

interface TransferFormProps {
  auth: ApiAuth;
  warehouses: Warehouse[];
  onDone: () => void;
  onCancel: () => void;
}

/** Chuyển kho 3 bước: chọn kho nguồn/đích → chọn sản phẩm → xác nhận */
export function TransferForm({ auth, warehouses, onDone, onCancel }: TransferFormProps) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState(String(warehouses[0]?.id ?? ""));
  const [destId, setDestId] = useState(String(warehouses[1]?.id ?? ""));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const source = warehouses.find((w) => String(w.id) === sourceId);
  const dest = warehouses.find((w) => String(w.id) === destId);
  const step1Error =
    !sourceId || !destId
      ? "Chọn kho nguồn và kho đích"
      : sourceId === destId
        ? "Kho đích phải khác kho nguồn"
        : null;
  const lineError = (l: Line) => {
    const q = Number(l.quantity);
    if (!(q > 0)) return "SL phải > 0";
    if (q > l.available) return `Vượt tồn (${fmtNumber(l.available)})`;
    return null;
  };
  const step2Error =
    lines.length === 0
      ? "Thêm ít nhất 1 sản phẩm"
      : lines.some(lineError)
        ? "Kiểm tra lại số lượng"
        : null;

  async function addProduct(p: ScannedProduct) {
    const key = `${p.productId}-${p.variantId ?? 0}`;
    const existing = lines.find((l) => l.key === key);
    if (existing) {
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l,
        ),
      );
      return;
    }
    try {
      const inv = await trpc.inventory.list.query(
        { warehouseId: Number(sourceId), productId: p.productId, page: 1, pageSize: 100 },
        apiContext(auth),
      );
      const row = inv.items.find((i) => (i.variantId ?? null) === p.variantId);
      const available = Number(row?.quantity ?? 0);
      if (available <= 0) {
        toast.warning(`"${p.name}" đã hết hàng ở ${source?.name}`);
        return;
      }
      setLines((prev) => [...prev, { ...p, key, quantity: "1", available }]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function submit(confirmNow: boolean) {
    setSaving(true);
    try {
      const tx = await trpc.transfer.create.mutate(
        {
          sourceWarehouseId: Number(sourceId),
          destinationWarehouseId: Number(destId),
          notes: notes.trim() || null,
          items: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: Number(l.quantity),
          })),
        },
        apiContext(auth),
      );
      if (confirmNow) {
        await trpc.transfer.confirm.mutate({ id: tx.id }, apiContext(auth));
        toast.success(`Đã chuyển kho ${source?.name} → ${dest?.name} (${tx.transactionCode})`);
      } else {
        toast.success(`Đã lưu nháp phiếu chuyển ${tx.transactionCode}`);
      }
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none focus:border-blue-400";
  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Stepper */}
      <ol className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                i < step
                  ? "bg-emerald-500 text-white"
                  : i === step
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-500",
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                i === step ? "font-semibold text-gray-900" : "text-gray-500",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px w-8 bg-gray-200" />}
          </li>
        ))}
      </ol>

      <div className="p-5">
        {step === 0 && (
          <div className="grid max-w-2xl gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Kho nguồn (xuất)
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setLines([]);
                }}
                className={selectCls}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight className="mb-3 hidden h-5 w-5 text-gray-400 sm:block" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Kho đích (nhập)
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className={selectCls}
              >
                <option value="">— Chọn kho —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700 sm:col-span-3">
              Ghi chú
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={selectCls}
              />
            </label>
            {step1Error && <p className="text-sm text-red-600 sm:col-span-3">{step1Error}</p>}
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="mb-3 text-sm text-gray-600">
              {source?.name} <ArrowRight className="inline h-4 w-4" /> {dest?.name}
            </p>
            <BarcodeScanInput auth={auth} onPick={addProduct} className="mb-4 max-w-xl" />
            <LinesTable
              lines={lines}
              lineError={lineError}
              onQty={(key, quantity) =>
                setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)))
              }
              onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-500">Kho nguồn</p>
                <p className="font-medium">{source?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Kho đích</p>
                <p className="font-medium">{dest?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Số sản phẩm</p>
                <p className="font-medium">{lines.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Tổng số lượng</p>
                <p className="font-medium">{fmtNumber(totalQty)}</p>
              </div>
            </div>
            <LinesTable lines={lines} lineError={lineError} />
            <p className="text-xs text-gray-500">
              Xác nhận sẽ trừ tồn {source?.name} và cộng tồn {dest?.name} trong cùng một giao dịch.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-3 border-t border-gray-100 px-5 py-4">
        <button
          onClick={step === 0 ? onCancel : () => setStep((s) => s - 1)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {step === 0 ? "Huỷ" : "Quay lại"}
        </button>
        {step < 2 ? (
          <button
            disabled={!!(step === 0 ? step1Error : step2Error)}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            title={(step === 0 ? step1Error : step2Error) ?? undefined}
          >
            Tiếp tục
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              disabled={saving}
              onClick={() => submit(false)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Lưu nháp
            </button>
            <button
              disabled={saving}
              onClick={() => submit(true)}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Đang xử lý..." : "Xác nhận chuyển kho"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinesTable({
  lines,
  lineError,
  onQty,
  onRemove,
}: {
  lines: Line[];
  lineError: (l: Line) => string | null;
  onQty?: (key: string, qty: string) => void;
  onRemove?: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs font-semibold text-gray-500 uppercase">
          <tr className="border-b border-gray-200">
            <th className="py-2 pr-2">Sản phẩm</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2 text-right">Tồn kho nguồn</th>
            <th className="w-32 py-2 pr-2 text-right">SL chuyển</th>
            {onRemove && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-gray-400">
                Quét mã vạch hoặc tìm sản phẩm để thêm
              </td>
            </tr>
          ) : (
            lines.map((l) => {
              const err = lineError(l);
              return (
                <tr key={l.key}>
                  <td className="py-2 pr-2 font-medium text-gray-900">{l.name}</td>
                  <td className="py-2 pr-2 font-mono text-xs text-gray-500">{l.sku}</td>
                  <td className="py-2 pr-2 text-right">{fmtNumber(l.available)}</td>
                  <td className="py-2 pr-2 text-right">
                    {onQty ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          aria-label={`Số lượng chuyển ${l.name}`}
                          value={l.quantity}
                          onChange={(e) => onQty(l.key, e.target.value)}
                          className={cn(
                            "w-full rounded-md border px-2 py-1.5 text-right outline-none",
                            err ? "border-red-400" : "border-gray-200 focus:border-blue-400",
                          )}
                        />
                        {err && <span className="text-xs text-red-600">{err}</span>}
                      </>
                    ) : (
                      <span className="font-medium">{fmtNumber(l.quantity)}</span>
                    )}
                  </td>
                  {onRemove && (
                    <td className="py-2">
                      <button
                        onClick={() => onRemove(l.key)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        aria-label={`Bỏ ${l.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
