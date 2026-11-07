"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls, useLoad } from "./shared";

export type RuleRow = RouterOutputs["staff"]["commission"]["rules"][number];
type CategoryNode = RouterOutputs["category"]["tree"][number];

export const RULE_TYPES = {
  percent_revenue: { label: "% doanh số", unit: "%" },
  percent_profit: { label: "% lợi nhuận", unit: "%" },
  fixed_per_product: { label: "Cố định / sản phẩm", unit: "₫/SP" },
} as const;

function flatten(nodes: CategoryNode[], depth = 0): { id: number; name: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: `${"— ".repeat(depth)}${n.name}` },
    ...flatten((n as CategoryNode & { children?: CategoryNode[] }).children ?? [], depth + 1),
  ]);
}

export function CommissionRuleForm({
  auth,
  rule,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  rule: RuleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ctx = apiContext(auth);
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    type: (rule?.type ?? "percent_revenue") as keyof typeof RULE_TYPES,
    value: rule ? String(rule.value) : "",
    scope: rule?.productId ? "product" : rule?.categoryId ? "category" : "all",
    categoryId: rule?.categoryId ?? null,
    product: rule?.product ? { id: rule.product.id, name: rule.product.name } : null,
    minRevenue: rule?.minRevenue ? String(rule.minRevenue) : "",
    isActive: rule?.isActive ?? true,
  });
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const cats = useLoad(JSON.stringify(["cats", auth]), () =>
    trpc.category.tree.query(undefined, ctx),
  );
  const products = useLoad(JSON.stringify(["p", q, auth]), () =>
    q.trim().length >= 2
      ? trpc.productSearch.search.query({ q: q.trim(), limit: 8 }, ctx)
      : Promise.resolve([] as Awaited<ReturnType<typeof trpc.productSearch.search.query>>),
  );

  async function save() {
    setBusy(true);
    setError("");
    const data = {
      name: form.name,
      type: form.type,
      value: Number(form.value),
      productId: form.scope === "product" ? (form.product?.id ?? null) : null,
      categoryId: form.scope === "category" ? form.categoryId : null,
      minRevenue: form.minRevenue ? Number(form.minRevenue) : null,
      isActive: form.isActive,
    };
    try {
      if (form.scope === "product" && !data.productId) throw new Error("Chọn sản phẩm áp dụng");
      if (form.scope === "category" && !data.categoryId) throw new Error("Chọn danh mục áp dụng");
      if (rule) await trpc.staff.commission.updateRule.mutate({ id: rule.id, ...data }, ctx);
      else await trpc.staff.commission.createRule.mutate(data, ctx);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? `Sửa quy tắc — ${rule.name}` : "Thêm quy tắc hoa hồng"}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button
            className={btnPrimary}
            disabled={busy || !form.name || !form.value}
            onClick={save}
          >
            Lưu
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        <Field label="Tên quy tắc *" htmlFor="cr-name">
          <input
            id="cr-name"
            className={inputCls}
            value={form.name}
            placeholder="Hoa hồng bán lẻ 2%"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cách tính" htmlFor="cr-type">
            <select
              id="cr-type"
              className={inputCls}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
            >
              {Object.entries(RULE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Giá trị (${RULE_TYPES[form.type].unit}) *`} htmlFor="cr-value">
            <input
              id="cr-value"
              type="number"
              inputMode="decimal"
              min={0}
              className={inputCls}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Áp dụng cho" htmlFor="cr-scope">
          <select
            id="cr-scope"
            className={inputCls}
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          >
            <option value="all">Mọi sản phẩm</option>
            <option value="category">Một danh mục (gồm danh mục con)</option>
            <option value="product">Một sản phẩm</option>
          </select>
        </Field>
        {form.scope === "category" && (
          <Field label="Danh mục" htmlFor="cr-cat">
            <select
              id="cr-cat"
              className={inputCls}
              value={form.categoryId ?? ""}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">— Chọn danh mục —</option>
              {flatten(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.scope === "product" && (
          <Field label="Sản phẩm" htmlFor="cr-prod">
            {form.product ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate rounded-md bg-slate-50 px-3 py-2 text-sm">
                  {form.product.name}
                </span>
                <button
                  className={btnSecondary}
                  onClick={() => setForm({ ...form, product: null })}
                >
                  Đổi
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="cr-prod"
                  className={inputCls}
                  placeholder="Gõ tên hoặc SKU (≥ 2 ký tự)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto">
                  {(products.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      className="block h-9 w-full truncate rounded px-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => setForm({ ...form, product: { id: p.id, name: p.name } })}
                    >
                      {p.name} <span className="text-xs text-slate-400">{p.sku}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        )}
        <Field
          label="Doanh số tháng tối thiểu (₫)"
          htmlFor="cr-min"
          hint="Chỉ tính hoa hồng khi doanh số cả tháng của nhân viên đạt mức này (để trống = không yêu cầu)"
        >
          <input
            id="cr-min"
            type="number"
            min={0}
            inputMode="numeric"
            className={inputCls}
            value={form.minRevenue}
            onChange={(e) => setForm({ ...form, minRevenue: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-600"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Đang áp dụng
        </label>
      </div>
    </Modal>
  );
}
