"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import { ProductPicker, localIn, toLocalInput, type Outputs } from "./shared";

type FlashDetail = Outputs["flashSale"]["get"];

interface Item {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  price: number;
  flashPrice: string;
  quantityLimit: string;
  perCustomerLimit: string;
}

const toNum = (s: string) => Number(String(s).replace(/[^\d.]/g, "")) || 0;

/** Create, or edit a flash sale that hasn't started (`sale`) */
export function FlashSaleForm({
  auth,
  sale,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  sale?: FlashDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(sale?.name ?? "");
  const [description, setDescription] = useState(sale?.description ?? "");
  const [start, setStart] = useState(sale ? toLocalInput(sale.startTime) : localIn(60));
  const [end, setEnd] = useState(sale ? toLocalInput(sale.endTime) : localIn(180));
  const [items, setItems] = useState<Item[]>(
    sale?.items.map((i) => ({
      key: `${i.product.id}:${i.variantId ?? 0}`,
      productId: i.product.id,
      variantId: i.variantId,
      name: i.product.name,
      sku: i.product.sku,
      price: i.regularPrice,
      flashPrice: String(i.flashPrice),
      quantityLimit: String(i.quantityLimit),
      perCustomerLimit: String(i.perCustomerLimit),
    })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (
    key: string,
    field: "flashPrice" | "quantityLimit" | "perCustomerLimit",
    value: string,
  ) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [field]: value } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const bad = items.find((i) => toNum(i.flashPrice) >= i.price || toNum(i.flashPrice) <= 0);
    if (bad)
      return setError(
        `Giá flash của "${bad.name}" phải > 0 và thấp hơn giá bán ${fmtMoney(bad.price)}`,
      );
    const data = {
      name,
      description: description || undefined,
      startTime: start,
      endTime: end,
      items: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        flashPrice: toNum(i.flashPrice),
        quantityLimit: toNum(i.quantityLimit),
        perCustomerLimit: toNum(i.perCustomerLimit),
      })),
    };
    setSaving(true);
    try {
      if (sale) await trpc.flashSale.update.mutate({ id: sale.id, data }, apiContext(auth));
      else await trpc.flashSale.create.mutate(data, apiContext(auth));
      toast.success(sale ? "Đã cập nhật flash sale" : "Đã tạo flash sale — tự bắt đầu đúng giờ");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={sale ? `Sửa flash sale “${sale.name}”` : "Tạo flash sale"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên chương trình *" htmlFor="fs-name">
            <input
              id="fs-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flash sale 12h trưa"
            />
          </Field>
          <Field label="Mô tả" htmlFor="fs-desc">
            <input
              id="fs-desc"
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field
            label="Bắt đầu *"
            htmlFor="fs-start"
            hint="Giờ Việt Nam — POS tự giảm giá từ thời điểm này"
          >
            <input
              id="fs-start"
              type="datetime-local"
              className={inputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field
            label="Kết thúc *"
            htmlFor="fs-end"
            hint="Hết giờ (hoặc hết suất) POS tự về giá thường"
          >
            <input
              id="fs-end"
              type="datetime-local"
              className={inputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <ProductPicker
          auth={auth}
          onPick={(p) =>
            setItems((xs) =>
              xs.some((x) => x.key === `${p.productId}:${p.variantId ?? 0}`)
                ? xs
                : [
                    ...xs,
                    {
                      key: `${p.productId}:${p.variantId ?? 0}`,
                      ...p,
                      flashPrice: String(Math.round(p.price * 0.8)),
                      quantityLimit: "0",
                      perCustomerLimit: "0",
                    },
                  ],
            )
          }
        />
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[680px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2 text-right">Giá bán</th>
                <th className="w-32 px-2 py-2 text-right">Giá flash</th>
                <th className="w-28 px-2 py-2 text-right">Tổng suất</th>
                <th className="w-28 px-2 py-2 text-right">Suất / khách</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Tìm và thêm sản phẩm ở ô phía trên
                  </td>
                </tr>
              )}
              {items.map((i) => {
                const pct = i.price > 0 ? Math.round((1 - toNum(i.flashPrice) / i.price) * 100) : 0;
                return (
                  <tr key={i.key}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.price)}</td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right`}
                        inputMode="numeric"
                        value={i.flashPrice}
                        onChange={(e) => update(i.key, "flashPrice", e.target.value)}
                        aria-label={`Giá flash ${i.name}`}
                      />
                      <div className="mt-0.5 text-right text-xs text-rose-600">
                        {pct > 0 ? `−${pct}%` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right`}
                        inputMode="numeric"
                        value={i.quantityLimit}
                        onChange={(e) => update(i.key, "quantityLimit", e.target.value)}
                        aria-label={`Tổng suất ${i.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${inputCls} text-right`}
                        inputMode="numeric"
                        value={i.perCustomerLimit}
                        onChange={(e) => update(i.key, "perCustomerLimit", e.target.value)}
                        aria-label={`Suất mỗi khách ${i.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))}
                        aria-label={`Xoá ${i.name}`}
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
        <p className="text-xs text-slate-500">
          Suất = 0 là không giới hạn. Vượt suất, phần còn lại tính giá thường.
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : sale ? "Lưu thay đổi" : "Tạo flash sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
