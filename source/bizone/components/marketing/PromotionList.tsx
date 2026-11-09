"use client";

import { useState } from "react";
import { Gift, Layers, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import {
  MarketingHeader,
  ProductPicker,
  StatusPill,
  fmtDT,
  localIn,
  toLocalInput,
  useCategoryOptions,
  type Outputs,
} from "./shared";

type Bxgy = Outputs["promotion"]["buyXGetY"]["list"][number];
type Combo = Outputs["promotion"]["combo"]["list"][number];

export function PromotionList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const bxgy = useLoad("bxgy", () => trpc.promotion.buyXGetY.list.query(undefined, ctx));
  const combos = useLoad("combos", () => trpc.promotion.combo.list.query(undefined, ctx));
  const [bxgyForm, setBxgyForm] = useState<Bxgy | "new" | null>(null);
  const [comboForm, setComboForm] = useState<Combo | "new" | null>(null);

  async function run(fn: () => Promise<unknown>, reload: () => void) {
    try {
      await fn();
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <MarketingHeader
        title="Mua X tặng Y & Combo"
        subtitle="Khuyến mãi tự động tại POS: đủ điều kiện là tự thêm quà / tự tính giá combo"
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Gift className="h-5 w-5 text-rose-500" /> Mua X tặng Y
          </h2>
          <button type="button" className={btnPrimary} onClick={() => setBxgyForm("new")}>
            <Plus className="h-4 w-4" /> Tạo chương trình
          </button>
        </div>
        <ErrorBox message={bxgy.error} />
        <div className="grid gap-3 md:grid-cols-2">
          {(bxgy.data ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400 md:col-span-2">
              {bxgy.loading ? "Đang tải…" : "Chưa có chương trình mua X tặng Y"}
            </p>
          )}
          {(bxgy.data ?? []).map((r) => (
            <article
              key={r.id}
              className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{r.name}</h3>
                <StatusPill tone={r.running ? "green" : r.isActive ? "blue" : "slate"}>
                  {r.running ? "Đang chạy" : r.isActive ? "Ngoài thời gian" : "Tạm ngừng"}
                </StatusPill>
              </div>
              <p className="text-sm text-slate-700">
                Mua <strong>{r.buyQuantity}</strong>{" "}
                {r.buyProduct?.name ?? `SP thuộc “${r.buyCategory?.name}”`} →{" "}
                {r.getDiscountPercent >= 100 ? "tặng" : `giảm ${r.getDiscountPercent}% cho`}{" "}
                <strong>{r.getQuantity}</strong>{" "}
                {r.getProduct?.name ?? `SP rẻ nhất thuộc “${r.getCategory?.name}”`}
              </p>
              <p className="text-xs text-slate-500">
                {fmtDT(r.startDate)} → {fmtDT(r.endDate)} · đã áp dụng {r.stats.uses} lần,{" "}
                {r.stats.quantity} SP, giảm {fmtMoney(r.stats.discount)}
              </p>
              <div className="flex gap-3 text-sm font-medium">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setBxgyForm(r)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="text-slate-700 hover:underline"
                  onClick={() =>
                    run(
                      () =>
                        trpc.promotion.buyXGetY.setActive.mutate(
                          { id: r.id, isActive: !r.isActive },
                          ctx,
                        ),
                      bxgy.reload,
                    )
                  }
                >
                  {r.isActive ? "Tạm ngừng" : "Bật lại"}
                </button>
                {r.stats.uses === 0 && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      confirm(`Xoá “${r.name}”?`) &&
                      run(
                        () => trpc.promotion.buyXGetY.delete.mutate({ id: r.id }, ctx),
                        bxgy.reload,
                      )
                    }
                  >
                    Xoá
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Layers className="h-5 w-5 text-blue-500" /> Combo khuyến mãi
          </h2>
          <button type="button" className={btnPrimary} onClick={() => setComboForm("new")}>
            <Plus className="h-4 w-4" /> Tạo combo
          </button>
        </div>
        <ErrorBox message={combos.error} />
        <div className="grid gap-3 md:grid-cols-2">
          {(combos.data ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400 md:col-span-2">
              {combos.loading ? "Đang tải…" : "Chưa có combo"}
            </p>
          )}
          {(combos.data ?? []).map((c) => (
            <article
              key={c.id}
              className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{c.name}</h3>
                <StatusPill tone={c.running ? "green" : c.isActive ? "blue" : "slate"}>
                  {c.running ? "Đang bán" : c.isActive ? "Ngoài thời gian / hết suất" : "Tạm ngừng"}
                </StatusPill>
              </div>
              <ul className="text-sm text-slate-700">
                {c.items.map((i) => (
                  <li key={i.productId}>
                    {i.quantity} × {i.name}{" "}
                    <span className="text-xs text-slate-500">({fmtMoney(i.price)})</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                <span className="text-slate-400 line-through">{fmtMoney(c.originalPrice)}</span>{" "}
                <strong className="text-rose-600">{fmtMoney(c.comboPrice)}</strong>{" "}
                <span className="text-xs text-slate-500">
                  · đã bán {c.soldCount}
                  {c.quantityLimit ? `/${c.quantityLimit}` : ""} bộ ·{" "}
                  {c.startDate || c.endDate
                    ? `${fmtDT(c.startDate)} → ${fmtDT(c.endDate)}`
                    : "không thời hạn"}
                </span>
              </p>
              <div className="flex gap-3 text-sm font-medium">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setComboForm(c)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="text-slate-700 hover:underline"
                  onClick={() =>
                    run(
                      () =>
                        trpc.promotion.combo.setActive.mutate(
                          { id: c.id, isActive: !c.isActive },
                          ctx,
                        ),
                      combos.reload,
                    )
                  }
                >
                  {c.isActive ? "Tạm ngừng" : "Bật lại"}
                </button>
                {c.soldCount === 0 && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      confirm(`Xoá “${c.name}”?`) &&
                      run(
                        () => trpc.promotion.combo.delete.mutate({ id: c.id }, ctx),
                        combos.reload,
                      )
                    }
                  >
                    Xoá
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {bxgyForm && (
        <BxgyForm
          auth={auth}
          rule={bxgyForm === "new" ? undefined : bxgyForm}
          onClose={() => setBxgyForm(null)}
          onSaved={() => {
            setBxgyForm(null);
            bxgy.reload();
          }}
        />
      )}
      {comboForm && (
        <ComboForm
          auth={auth}
          combo={comboForm === "new" ? undefined : comboForm}
          onClose={() => setComboForm(null)}
          onSaved={() => {
            setComboForm(null);
            combos.reload();
          }}
        />
      )}
    </div>
  );
}

type Target =
  { kind: "product"; id: number; name: string } | { kind: "category"; id: number } | null;

function TargetPicker({
  auth,
  label,
  value,
  onChange,
}: {
  auth: ApiAuth;
  label: string;
  value: Target;
  onChange: (t: Target) => void;
}) {
  const categories = useCategoryOptions(auth);
  const [kind, setKind] = useState<"product" | "category">(value?.kind ?? "product");
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex gap-4 text-sm">
        {(["product", "category"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={kind === k}
              onChange={() => {
                setKind(k);
                onChange(null);
              }}
            />
            {k === "product" ? "Một sản phẩm" : "Danh mục"}
          </label>
        ))}
      </div>
      {kind === "product" ? (
        value?.kind === "product" ? (
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
            {value.name}
            <button type="button" className="text-xs text-red-600" onClick={() => onChange(null)}>
              Đổi
            </button>
          </div>
        ) : (
          <ProductPicker
            auth={auth}
            withVariants={false}
            onPick={(p) => onChange({ kind: "product", id: p.productId, name: p.name })}
          />
        )
      ) : (
        <select
          className={inputCls}
          value={value?.kind === "category" ? value.id : ""}
          onChange={(e) =>
            onChange(e.target.value ? { kind: "category", id: Number(e.target.value) } : null)
          }
          aria-label={`${label} — danh mục`}
        >
          <option value="">— Chọn danh mục —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}

function BxgyForm({
  auth,
  rule,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  rule?: Bxgy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [buy, setBuy] = useState<Target>(
    rule?.buyProduct
      ? { kind: "product", id: rule.buyProduct.id, name: rule.buyProduct.name }
      : rule?.buyCategory
        ? { kind: "category", id: rule.buyCategory.id }
        : null,
  );
  const [get, setGet] = useState<Target>(
    rule?.getProduct
      ? { kind: "product", id: rule.getProduct.id, name: rule.getProduct.name }
      : rule?.getCategory
        ? { kind: "category", id: rule.getCategory.id }
        : null,
  );
  const [buyQty, setBuyQty] = useState(String(rule?.buyQuantity ?? 2));
  const [getQty, setGetQty] = useState(String(rule?.getQuantity ?? 1));
  const [pct, setPct] = useState(String(rule?.getDiscountPercent ?? 100));
  const [start, setStart] = useState(rule ? toLocalInput(rule.startDate) : localIn(0));
  const [end, setEnd] = useState(rule ? toLocalInput(rule.endDate) : localIn(60 * 24 * 30));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!buy || !get) return setError("Chọn sản phẩm / danh mục cần mua và được tặng");
    const data = {
      name,
      buyProductId: buy.kind === "product" ? buy.id : null,
      buyCategoryId: buy.kind === "category" ? buy.id : null,
      buyQuantity: Number(buyQty) || 0,
      getProductId: get.kind === "product" ? get.id : null,
      getCategoryId: get.kind === "category" ? get.id : null,
      getQuantity: Number(getQty) || 0,
      getDiscountPercent: Number(pct) || 0,
      startDate: start,
      endDate: end,
      isActive: rule?.isActive ?? true,
    };
    setSaving(true);
    setError("");
    try {
      if (rule)
        await trpc.promotion.buyXGetY.update.mutate({ id: rule.id, data }, apiContext(auth));
      else await trpc.promotion.buyXGetY.create.mutate(data, apiContext(auth));
      toast.success(rule ? "Đã cập nhật chương trình" : "Đã tạo chương trình mua X tặng Y");
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
      size="lg"
      title={rule ? `Sửa “${rule.name}”` : "Tạo chương trình mua X tặng Y"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <Field label="Tên chương trình *" htmlFor="bx-name">
          <input
            id="bx-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mua 2 tặng 1"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <TargetPicker auth={auth} label="Khách mua" value={buy} onChange={setBuy} />
          <Field label="Số lượng mua" htmlFor="bx-bq">
            <input
              id="bx-bq"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={buyQty}
              onChange={(e) => setBuyQty(e.target.value)}
            />
          </Field>
          <TargetPicker auth={auth} label="Được tặng / giảm" value={get} onChange={setGet} />
          <div className="space-y-3">
            <Field label="Số lượng tặng" htmlFor="bx-gq">
              <input
                id="bx-gq"
                className={`${inputCls} text-right`}
                inputMode="numeric"
                value={getQty}
                onChange={(e) => setGetQty(e.target.value)}
              />
            </Field>
            <Field label="Giảm (%)" htmlFor="bx-pct" hint="100 = tặng miễn phí">
              <input
                id="bx-pct"
                className={`${inputCls} text-right`}
                inputMode="numeric"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Tặng 1 sản phẩm: POS tự thêm dòng quà vào giỏ. Tặng theo danh mục: POS giảm cho sản phẩm
          rẻ nhất của danh mục đã có trong giỏ (cùng danh mục thì cần đủ “mua + tặng”).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bắt đầu *" htmlFor="bx-start">
            <input
              id="bx-start"
              type="datetime-local"
              className={inputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Kết thúc *" htmlFor="bx-end">
            <input
              id="bx-end"
              type="datetime-local"
              className={inputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : rule ? "Lưu thay đổi" : "Tạo chương trình"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ComboForm({
  auth,
  combo,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  combo?: Combo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(combo?.name ?? "");
  const [items, setItems] = useState(
    combo?.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      quantity: String(i.quantity),
    })) ?? ([] as { productId: number; name: string; price: number; quantity: string }[]),
  );
  const [price, setPrice] = useState(combo ? String(combo.comboPrice) : "");
  const [limit, setLimit] = useState(String(combo?.quantityLimit ?? 0));
  const [start, setStart] = useState(toLocalInput(combo?.startDate));
  const [end, setEnd] = useState(toLocalInput(combo?.endDate));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const original = items.reduce((s, i) => s + i.price * (Number(i.quantity) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name,
      comboPrice: Number(price.replace(/[^\d.]/g, "")) || 0,
      items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) || 0 })),
      quantityLimit: Number(limit) || 0,
      startDate: start || null,
      endDate: end || null,
      isActive: combo?.isActive ?? true,
    };
    setSaving(true);
    setError("");
    try {
      if (combo) await trpc.promotion.combo.update.mutate({ id: combo.id, data }, apiContext(auth));
      else await trpc.promotion.combo.create.mutate(data, apiContext(auth));
      toast.success(combo ? "Đã cập nhật combo" : "Đã tạo combo");
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
      size="lg"
      title={combo ? `Sửa combo “${combo.name}”` : "Tạo combo khuyến mãi"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <Field label="Tên combo *" htmlFor="cb-name">
          <input
            id="cb-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Combo sáng: cà phê + bánh mì"
          />
        </Field>
        <ProductPicker
          auth={auth}
          withVariants={false}
          placeholder="Thêm sản phẩm vào combo…"
          onPick={(p) =>
            setItems((xs) =>
              xs.some((x) => x.productId === p.productId)
                ? xs
                : [...xs, { productId: p.productId, name: p.name, price: p.price, quantity: "1" }],
            )
          }
        />
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.length === 0 && (
            <li className="p-3 text-center text-sm text-slate-400">Chưa có sản phẩm</li>
          )}
          {items.map((i) => (
            <li key={i.productId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">
                {i.name} <span className="text-xs text-slate-500">{fmtMoney(i.price)}</span>
              </span>
              <input
                className={`${inputCls} w-20 text-right`}
                inputMode="numeric"
                value={i.quantity}
                onChange={(e) =>
                  setItems((xs) =>
                    xs.map((x) =>
                      x.productId === i.productId ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
                aria-label={`Số lượng ${i.name}`}
              />
              <button
                type="button"
                className="rounded p-2 text-slate-400 hover:text-red-600"
                onClick={() => setItems((xs) => xs.filter((x) => x.productId !== i.productId))}
                aria-label={`Bỏ ${i.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Giá combo (₫) *" htmlFor="cb-price" hint={`Giá lẻ: ${fmtMoney(original)}`}>
            <input
              id="cb-price"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Số bộ tối đa" htmlFor="cb-limit" hint="0 = không giới hạn">
            <input
              id="cb-limit"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <Field label="Bắt đầu" htmlFor="cb-start">
            <input
              id="cb-start"
              type="datetime-local"
              className={inputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Kết thúc" htmlFor="cb-end">
            <input
              id="cb-end"
              type="datetime-local"
              className={inputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : combo ? "Lưu thay đổi" : "Tạo combo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
