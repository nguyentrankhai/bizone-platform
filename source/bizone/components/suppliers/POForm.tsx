"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import { lineTotal, poTotals } from "@/lib/supplier/calc";
import { cn } from "@/lib/utils";
import { SupplierNav, type Outputs } from "./shared";

type LookupRow = Outputs["purchaseOrder"]["productLookup"][number];
type PoDetail = Outputs["purchaseOrder"]["get"];

interface Line {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  unit: string | null;
  quantity: string;
  unitCost: string;
  discountPercent: string;
  costPrice: number;
  lastSupplierCost: number | null;
}

const toNum = (s: string) => {
  const n = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function fromPo(po: PoDetail): Line[] {
  return po.items.map((i) => ({
    key: `${i.product.id}:${i.variant?.id ?? 0}`,
    productId: i.product.id,
    variantId: i.variant?.id ?? null,
    name: i.product.name,
    sku: i.variant?.sku ?? i.product.sku,
    unit: i.product.unit,
    quantity: String(i.quantity),
    unitCost: String(i.unitCost),
    discountPercent: String(i.discountPercent),
    costPrice: i.unitCost,
    lastSupplierCost: null,
  }));
}

/** Create (no `po`) or edit a pending purchase order */
export function POForm({
  auth,
  po,
  initialSupplierId,
}: {
  auth: ApiAuth;
  po?: PoDetail;
  initialSupplierId?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);
  const [supplierId, setSupplierId] = useState<number | "">(
    po?.supplier.id ?? initialSupplierId ?? "",
  );
  const [warehouseId, setWarehouseId] = useState<number | "">(po?.warehouse?.id ?? "");
  const [lines, setLines] = useState<Line[]>(po ? fromPo(po) : []);
  const [discount, setDiscount] = useState(String(po?.discountAmount ?? 0));
  const [tax, setTax] = useState(String(po?.taxAmount ?? 0));
  const [notes, setNotes] = useState(po?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suppliers = useLoad("po-sup", () => trpc.supplier.options.query(undefined, ctx));
  const warehouses = useLoad("po-wh", () =>
    trpc.purchaseOrder.warehouseOptions.query(undefined, ctx),
  );
  const effectiveWarehouse =
    warehouseId || (warehouses.data && warehouses.data.length === 1 ? warehouses.data[0].id : "");

  // Product search (debounced)
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupRow[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (!term) return;
    timer.current = setTimeout(() => {
      setSearching(true);
      trpc.purchaseOrder.productLookup
        .query({ q: term, ...(supplierId ? { supplierId: Number(supplierId) } : {}) }, ctx)
        .then(setResults, (e: unknown) => setError(errorMessage(e)))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is rebuilt each render
  }, [q, supplierId]);

  function addLine(r: LookupRow) {
    const key = `${r.productId}:${r.variantId ?? 0}`;
    setLines((ls) => {
      const existing = ls.find((l) => l.key === key);
      if (existing) {
        return ls.map((l) =>
          l.key === key ? { ...l, quantity: String(toNum(l.quantity) + 1) } : l,
        );
      }
      const price = r.lastSupplierCost?.unitCost ?? r.costPrice;
      return [
        ...ls,
        {
          key,
          productId: r.productId,
          variantId: r.variantId,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          quantity: "1",
          unitCost: String(price),
          discountPercent: "0",
          costPrice: r.costPrice,
          lastSupplierCost: r.lastSupplierCost?.unitCost ?? null,
        },
      ];
    });
    setQ("");
    setResults([]);
  }

  const update = (key: string, field: "quantity" | "unitCost" | "discountPercent", value: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const totals = useMemo(() => {
    try {
      return {
        ...poTotals(
          lines.map((l) => ({
            quantity: toNum(l.quantity),
            unitCost: toNum(l.unitCost),
            discountPercent: toNum(l.discountPercent),
          })),
          toNum(discount),
          toNum(tax),
        ),
        error: "",
      };
    } catch (e) {
      return {
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        error: (e as Error).message,
      };
    }
  }, [lines, discount, tax]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supplierId) return setError("Chọn nhà cung cấp");
    if (!effectiveWarehouse) return setError("Chọn kho nhận hàng");
    if (lines.length === 0) return setError("Thêm ít nhất 1 sản phẩm");
    const bad = lines.find((l) => toNum(l.quantity) <= 0 || !Number.isInteger(toNum(l.quantity)));
    if (bad) return setError(`Số lượng của "${bad.name}" phải là số nguyên > 0`);
    const badDisc = lines.find((l) => toNum(l.discountPercent) > 100);
    if (badDisc) return setError(`Chiết khấu của "${badDisc.name}" tối đa 100%`);
    if (totals.error) return setError(totals.error);

    const payload = {
      supplierId: Number(supplierId),
      warehouseId: Number(effectiveWarehouse),
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: toNum(l.quantity),
        unitCost: toNum(l.unitCost),
        discountPercent: toNum(l.discountPercent),
      })),
      discountAmount: toNum(discount),
      taxAmount: toNum(tax),
      notes: notes.trim() || undefined,
    };
    setSaving(true);
    try {
      const saved = po
        ? await trpc.purchaseOrder.update.mutate({ id: po.id, ...payload }, ctx)
        : await trpc.purchaseOrder.create.mutate(payload, ctx);
      toast.success(po ? `Đã cập nhật đơn ${saved.poCode}` : `Đã tạo đơn nhập ${saved.poCode}`);
      router.push(`/purchase-orders/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <SupplierNav />
      <div>
        <Link
          href={po ? `/purchase-orders/${po.id}` : "/purchase-orders"}
          className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> {po ? `Đơn ${po.poCode}` : "Đơn nhập hàng"}
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">
          {po ? `Sửa đơn ${po.poCode}` : "Tạo đơn nhập hàng"}
        </h1>
      </div>

      <ErrorBox message={error || suppliers.error || warehouses.error} />

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="Nhà cung cấp *" htmlFor="po-supplier">
          <select
            id="po-supplier"
            className={inputCls}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— Chọn nhà cung cấp —</option>
            {(suppliers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kho nhận hàng *" htmlFor="po-wh">
          <select
            id="po-wh"
            className={inputCls}
            value={effectiveWarehouse}
            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— Chọn kho —</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {warehouses.data?.length === 0 && (
            <p className="text-xs text-amber-700">
              Chưa có kho nào — tạo kho ở{" "}
              <Link href="/warehouse" className="underline">
                Kho hàng
              </Link>
              .
            </p>
          )}
        </Field>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="relative border-b border-slate-100 p-4">
          <Search className="pointer-events-none absolute top-1/2 left-7 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Thêm sản phẩm: tên, SKU, mã vạch…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value.trim()) setResults([]);
            }}
            aria-label="Tìm sản phẩm để thêm vào đơn"
          />
          {q.trim() && (
            <div className="absolute inset-x-4 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {searching && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">Đang tìm…</p>
              )}
              {!searching && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">Không tìm thấy sản phẩm</p>
              )}
              {results.map((r) => (
                <button
                  key={`${r.productId}:${r.variantId ?? 0}`}
                  type="button"
                  onClick={() => addLine(r)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-slate-800">{r.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{r.sku}</span>
                  </span>
                  <span className="text-right text-xs text-slate-500 tabular-nums">
                    Giá vốn {fmtMoney(r.costPrice)}
                    {r.lastSupplierCost && (
                      <span className="block text-slate-700">
                        NCC này lần trước {fmtMoney(r.lastSupplierCost.unitCost)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Sản phẩm</th>
                <th className="w-24 px-2 py-2 text-right">Số lượng</th>
                <th className="w-36 px-2 py-2 text-right">Đơn giá nhập</th>
                <th className="w-20 px-2 py-2 text-right">CK %</th>
                <th className="w-32 px-4 py-2 text-right">Thành tiền</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Chưa có sản phẩm — tìm và chọn ở ô phía trên
                  </td>
                </tr>
              )}
              {lines.map((l) => {
                const cost = toNum(l.unitCost);
                const moved = l.lastSupplierCost !== null && cost !== l.lastSupplierCost;
                return (
                  <tr key={l.key}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-800">{l.name}</div>
                      <div className="text-xs text-slate-500">
                        {l.sku}
                        {l.unit && <> · {l.unit}</>}
                        {moved && (
                          <span
                            className={cn(
                              "ml-2",
                              cost > l.lastSupplierCost! ? "text-red-600" : "text-emerald-700",
                            )}
                          >
                            lần trước {fmtMoney(l.lastSupplierCost)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right tabular-nums`}
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => update(l.key, "quantity", e.target.value)}
                        aria-label={`Số lượng ${l.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right tabular-nums`}
                        inputMode="numeric"
                        value={l.unitCost}
                        onChange={(e) => update(l.key, "unitCost", e.target.value)}
                        aria-label={`Đơn giá ${l.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right tabular-nums`}
                        inputMode="decimal"
                        value={l.discountPercent}
                        onChange={(e) => update(l.key, "discountPercent", e.target.value)}
                        aria-label={`Chiết khấu % ${l.name}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {fmtMoney(lineTotal(toNum(l.quantity), cost, toNum(l.discountPercent)))}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Xoá ${l.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Field label="Ghi chú" htmlFor="po-notes">
          <textarea
            id="po-notes"
            rows={4}
            className={inputCls.replace("h-10", "min-h-24 py-2")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <Row label="Tiền hàng" value={fmtMoney(totals.subtotal)} />
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-600">Chiết khấu đơn (₫)</span>
            <input
              className={`${inputCls} w-36 text-right tabular-nums`}
              inputMode="numeric"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-600">Thuế / phí (₫)</span>
            <input
              className={`${inputCls} w-36 text-right tabular-nums`}
              inputMode="numeric"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </label>
          {totals.error && <p className="text-xs text-red-600">{totals.error}</p>}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base">
            <span className="font-semibold text-slate-700">Tổng cộng</span>
            <span className="font-bold text-primary tabular-nums">
              {fmtMoney(totals.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={po ? `/purchase-orders/${po.id}` : "/purchase-orders"} className={btnSecondary}>
          Huỷ
        </Link>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? "Đang lưu…" : po ? "Lưu thay đổi" : "Tạo đơn nhập"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** /purchase-orders/[id]/edit — load the PO, then the same form */
export function POEditLoader({ auth, poId }: { auth: ApiAuth; poId: number }) {
  const data = useLoad(`po-edit:${poId}`, () =>
    trpc.purchaseOrder.get.query({ id: poId }, apiContext(auth)),
  );
  if (!data.data) {
    return (
      <div className="space-y-4">
        <SupplierNav />
        <ErrorBox message={data.error} />
        {!data.error && <p className="py-12 text-center text-sm text-slate-400">Đang tải…</p>}
      </div>
    );
  }
  if (data.data.status !== "pending") {
    return (
      <div className="space-y-4">
        <SupplierNav />
        <ErrorBox message={`Đơn ${data.data.poCode} đã nhận hàng hoặc đã huỷ — không sửa được.`} />
        <Link href={`/purchase-orders/${poId}`} className={btnSecondary}>
          Xem đơn
        </Link>
      </div>
    );
  }
  return <POForm auth={auth} po={data.data} />;
}
