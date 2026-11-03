"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  BarcodeScanInput,
  type BarcodeScanInputHandle,
  type ScannedProduct,
} from "./BarcodeScanInput";
import {
  apiContext,
  errorMessage,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
  type RouterOutputs,
} from "./shared";

type TxType = RouterOutputs["inventory"]["transactionTypes"][number];
type Warehouse = RouterOutputs["warehouse"]["list"][number];

interface Line extends ScannedProduct {
  key: string;
  quantity: string;
  unitCost: string;
  batchCode: string;
  expiryDate: string;
}

// Transfers have their own 3-step flow; stock take adjusts through its own note
const EXCLUDED_TYPES = ["transfer_out", "transfer_in", "stock_take"];
const DEFAULT_TYPE = { in: "purchase_receipt", out: "sales_issue" };

interface TransactionFormProps {
  auth: ApiAuth;
  direction: "in" | "out";
}

/** Phiếu nhập / xuất kho với quét mã vạch (mockup 04-warehouse §08) */
export function TransactionForm({ auth, direction }: TransactionFormProps) {
  const router = useRouter();
  const toast = useToast();
  const scanRef = useRef<BarcodeScanInputHandle>(null);
  const [types, setTypes] = useState<TxType[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [typeId, setTypeId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      trpc.inventory.transactionTypes.query(undefined, apiContext(auth)),
      trpc.warehouse.list.query(undefined, apiContext(auth)),
    ])
      .then(([t, w]) => {
        const usable = t.filter(
          (x) => x.direction === direction && !EXCLUDED_TYPES.includes(x.code),
        );
        setTypes(usable);
        const preferred = usable.find((x) => x.code === DEFAULT_TYPE[direction]) ?? usable[0];
        setTypeId(String(preferred?.id ?? ""));
        const active = w.filter((x) => x.isActive);
        setWarehouses(active);
        setWarehouseId(String(active[0]?.id ?? ""));
      })
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, auth.authToken]);

  function addProduct(p: ScannedProduct) {
    const key = `${p.productId}-${p.variantId ?? 0}`;
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l,
        );
      }
      return [...prev, { ...p, key, quantity: "1", unitCost: "", batchCode: "", expiryDate: "" }];
    });
    setLastKey(key);
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totals = useMemo(
    () => ({
      quantity: lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
      value: lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    }),
    [lines],
  );

  async function submit(confirmNow: boolean) {
    if (!typeId || !warehouseId) return toast.error("Chọn loại phiếu và kho");
    if (lines.length === 0) return toast.error("Phiếu phải có ít nhất 1 sản phẩm");
    const bad = lines.find((l) => !(Number(l.quantity) > 0));
    if (bad) return toast.error(`Số lượng của "${bad.name}" phải lớn hơn 0`);
    setSaving(true);
    try {
      const tx = await trpc.inventory.createTransaction.mutate(
        {
          transactionTypeId: Number(typeId),
          warehouseId: Number(warehouseId),
          notes: notes.trim() || null,
          items: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost ? Number(l.unitCost) : null,
            batchCode: l.batchCode.trim() || null,
            expiryDate: l.expiryDate ? new Date(`${l.expiryDate}T00:00:00Z`).toISOString() : null,
          })),
        },
        apiContext(auth),
      );
      if (confirmNow) {
        try {
          await trpc.inventory.confirmTransaction.mutate({ id: tx.id }, apiContext(auth));
          toast.success(
            `Đã ${direction === "in" ? "nhập" : "xuất"} kho — phiếu ${tx.transactionCode}`,
          );
        } catch (e) {
          // The draft exists; let the user fix stock and confirm it from history
          toast.error(
            `Phiếu ${tx.transactionCode} đã lưu nháp nhưng chưa xác nhận: ${errorMessage(e)}`,
          );
          return;
        }
      } else {
        toast.success(`Đã lưu nháp phiếu ${tx.transactionCode}`);
      }
      router.push("/warehouse?tab=transactions");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const cellInput =
    "w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Loại phiếu
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none focus:border-blue-400"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Kho {direction === "in" ? "nhập" : "xuất"} <span className="text-red-500">*</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none focus:border-blue-400"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <BarcodeScanInput ref={scanRef} auth={auth} onPick={addProduct} className="mb-4" />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs font-semibold text-gray-500 uppercase">
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-2">Sản phẩm</th>
                <th className="py-2 pr-2">SKU</th>
                {direction === "in" && <th className="w-28 py-2 pr-2">Lô</th>}
                {direction === "in" && <th className="w-36 py-2 pr-2">HSD</th>}
                <th className="w-24 py-2 pr-2 text-right">SL</th>
                <th className="w-32 py-2 pr-2 text-right">Đơn giá</th>
                <th className="py-2 pr-2 text-right">Thành tiền</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">
                    Quét mã vạch hoặc tìm sản phẩm để thêm vào phiếu
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.key} className={l.key === lastKey ? "bg-blue-50/60" : undefined}>
                    <td className="py-2 pr-2 font-medium text-gray-900">{l.name}</td>
                    <td className="py-2 pr-2 font-mono text-xs text-gray-500">{l.sku}</td>
                    {direction === "in" && (
                      <td className="py-2 pr-2">
                        <input
                          aria-label={`Lô ${l.name}`}
                          placeholder="Lô"
                          value={l.batchCode}
                          onChange={(e) => update(l.key, { batchCode: e.target.value })}
                          className={cellInput}
                        />
                      </td>
                    )}
                    {direction === "in" && (
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          aria-label={`Hạn sử dụng ${l.name}`}
                          value={l.expiryDate}
                          onChange={(e) => update(l.key, { expiryDate: e.target.value })}
                          className={cellInput}
                        />
                      </td>
                    )}
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        aria-label={`Số lượng ${l.name}`}
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        aria-label={`Đơn giá ${l.name}`}
                        value={l.unitCost}
                        onChange={(e) => update(l.key, { unitCost: e.target.value })}
                        className={`${cellInput} text-right`}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">
                      {fmtNumber((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => {
                          setLines((prev) => prev.filter((x) => x.key !== l.key));
                          scanRef.current?.focus();
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        aria-label={`Bỏ ${l.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Tổng số lượng</span>
            <span className="font-semibold">{fmtNumber(totals.quantity)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Tổng số sản phẩm</span>
            <span className="font-semibold">{lines.length}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-3 text-base">
            <span className="font-medium">Tổng giá trị</span>
            <span className="font-bold text-blue-600">{fmtMoney(totals.value)}</span>
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Ghi chú
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nhập ghi chú..."
            className="rounded-lg border border-gray-300 px-3 py-2 font-normal outline-none focus:border-blue-400"
          />
        </label>
        <button
          disabled={saving}
          onClick={() => submit(false)}
          className="h-11 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Lưu nháp
        </button>
        <button
          disabled={saving}
          onClick={() => submit(true)}
          className="h-11 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Đang xử lý..." : `Xác nhận ${direction === "in" ? "nhập" : "xuất"} kho`}
        </button>
      </div>
    </div>
  );
}
