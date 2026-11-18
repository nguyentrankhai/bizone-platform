"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addToCartAction, type FormState } from "@/app/actions";
import { Alert, btn, input } from "./ui";
import { fmtVnd } from "@/lib/format";

interface Variant {
  id: number;
  name: string;
  price: number;
  salePrice: number | null;
  stock: number | null;
}

export function AddToCart({
  productId,
  unit,
  stock,
  variants,
}: {
  productId: number;
  unit: string;
  stock: number | null;
  variants: Variant[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addToCartAction, {});
  const [variantId, setVariantId] = useState<number | null>(
    variants.length === 1 ? variants[0].id : null,
  );
  const v = variants.find((x) => x.id === variantId);
  const available = variants.length ? (v ? v.stock : null) : stock;
  const soldOut = available === 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Phân loại</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <label
                key={x.id}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${variantId === x.id ? "border-primary bg-primary/5 text-primary" : "border-slate-300 bg-white"} ${x.stock === 0 ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="variantId"
                  value={x.id}
                  className="sr-only"
                  checked={variantId === x.id}
                  onChange={() => setVariantId(x.id)}
                />
                {x.name} · {fmtVnd(x.salePrice ?? x.price)}
                {x.stock === 0 && " (hết)"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="text-sm text-slate-600" data-testid="stock">
        {variants.length > 0 && !v
          ? "Chọn phân loại để xem tồn kho"
          : available === null
            ? "Còn hàng"
            : available > 0
              ? `Còn ${available} ${unit}`
              : "Hết hàng"}
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="qty" className="text-sm font-medium">
          Số lượng
        </label>
        <input
          id="qty"
          name="quantity"
          type="number"
          min={1}
          max={available ?? 999}
          defaultValue={1}
          className={`${input} w-24`}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button className={btn} disabled={pending || soldOut || (variants.length > 0 && !v)}>
          {pending ? "Đang thêm…" : soldOut ? "Hết hàng" : "Thêm vào giỏ"}
        </button>
        {state.ok && (
          <Link
            href="/cart"
            className="inline-flex h-11 items-center text-sm font-medium text-primary hover:underline"
          >
            Xem giỏ hàng →
          </Link>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{state.ok}</Alert>}
    </form>
  );
}
