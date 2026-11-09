"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import { RANKING_LABEL, toLocalInput, useCategoryOptions, type Outputs } from "./shared";

type Coupon = Outputs["coupon"]["list"]["items"][number];
type CouponType = "percent" | "fixed" | "free_shipping";
const CHANNELS = [
  ["pos", "Tại quầy (POS)"],
  ["online", "Đơn online"],
  ["website", "Website"],
  ["shopee", "Shopee"],
  ["lazada", "Lazada"],
  ["tiktok", "TikTok Shop"],
] as const;
type Channel = (typeof CHANNELS)[number][0];
type Ranking = "silver" | "gold" | "vip" | "diamond";

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d.]/g, "")));

export function CouponForm({
  auth,
  coupon,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  coupon?: Coupon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const categories = useCategoryOptions(auth);
  const [v, setV] = useState({
    code: coupon?.code ?? "",
    name: coupon?.name ?? "",
    type: (coupon?.type ?? "percent") as CouponType,
    value: coupon ? String(coupon.value) : "",
    minOrderAmount: coupon?.minOrderAmount != null ? String(coupon.minOrderAmount) : "",
    maxDiscount: coupon?.maxDiscount != null ? String(coupon.maxDiscount) : "",
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : "",
    usagePerCustomer: coupon?.usagePerCustomer != null ? String(coupon.usagePerCustomer) : "",
    startDate: toLocalInput(coupon?.startDate),
    endDate: toLocalInput(coupon?.endDate),
    channels: (coupon?.channels ?? []) as Channel[],
    isActive: coupon?.isActive ?? true,
    autoApply: coupon?.autoApply ?? false,
    rankings: (coupon?.rankings ?? []) as Ranking[],
    categoryIds: coupon?.categoryIds ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const data = {
      code: v.code,
      name: v.name,
      type: v.type,
      value: v.type === "free_shipping" ? 0 : (toNum(v.value) ?? 0),
      minOrderAmount: toNum(v.minOrderAmount),
      maxDiscount: v.type === "percent" ? toNum(v.maxDiscount) : null,
      usageLimit: toNum(v.usageLimit),
      usagePerCustomer: toNum(v.usagePerCustomer),
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      channels: v.channels,
      isActive: v.isActive,
      autoApply: v.autoApply,
      rankings: v.rankings,
      categoryIds: v.categoryIds,
    };
    setSaving(true);
    try {
      if (coupon) await trpc.coupon.update.mutate({ id: coupon.id, data }, apiContext(auth));
      else await trpc.coupon.create.mutate(data, apiContext(auth));
      toast.success(coupon ? "Đã cập nhật mã giảm giá" : `Đã tạo mã ${data.code.toUpperCase()}`);
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
      title={coupon ? `Sửa mã ${coupon.code}` : "Tạo mã giảm giá"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Mã *"
            htmlFor="cp-code"
            hint={coupon?.usedCount ? "Đã có lượt dùng — không đổi được" : "Chữ không dấu, số, - _"}
          >
            <input
              id="cp-code"
              className={`${inputCls} uppercase`}
              value={v.code}
              onChange={set("code")}
              disabled={!!coupon?.usedCount}
              placeholder="GIAM10"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tên chương trình *" htmlFor="cp-name">
              <input
                id="cp-name"
                className={inputCls}
                value={v.name}
                onChange={set("name")}
                placeholder="Giảm 10% cuối tuần"
              />
            </Field>
          </div>
          <Field label="Loại giảm" htmlFor="cp-type">
            <select id="cp-type" className={inputCls} value={v.type} onChange={set("type")}>
              <option value="percent">Phần trăm (%)</option>
              <option value="fixed">Số tiền cố định (₫)</option>
              <option value="free_shipping">Miễn phí vận chuyển</option>
            </select>
          </Field>
          {v.type !== "free_shipping" && (
            <Field label={v.type === "percent" ? "Giảm (%) *" : "Giảm (₫) *"} htmlFor="cp-value">
              <input
                id="cp-value"
                className={`${inputCls} text-right`}
                inputMode="decimal"
                value={v.value}
                onChange={set("value")}
              />
            </Field>
          )}
          {v.type === "percent" && (
            <Field label="Giảm tối đa (₫)" htmlFor="cp-max">
              <input
                id="cp-max"
                className={`${inputCls} text-right`}
                inputMode="numeric"
                value={v.maxDiscount}
                onChange={set("maxDiscount")}
                placeholder="Không giới hạn"
              />
            </Field>
          )}
          <Field label="Đơn tối thiểu (₫)" htmlFor="cp-min">
            <input
              id="cp-min"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={v.minOrderAmount}
              onChange={set("minOrderAmount")}
              placeholder="Không yêu cầu"
            />
          </Field>
          <Field label="Tổng lượt dùng" htmlFor="cp-limit">
            <input
              id="cp-limit"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={v.usageLimit}
              onChange={set("usageLimit")}
              placeholder="Không giới hạn"
            />
          </Field>
          <Field label="Lượt / khách" htmlFor="cp-per">
            <input
              id="cp-per"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={v.usagePerCustomer}
              onChange={set("usagePerCustomer")}
              placeholder="Không giới hạn"
            />
          </Field>
          <Field label="Bắt đầu" htmlFor="cp-start">
            <input
              id="cp-start"
              type="datetime-local"
              className={inputCls}
              value={v.startDate}
              onChange={set("startDate")}
            />
          </Field>
          <Field label="Kết thúc" htmlFor="cp-end">
            <input
              id="cp-end"
              type="datetime-local"
              className={inputCls}
              value={v.endDate}
              onChange={set("endDate")}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            Kênh áp dụng (bỏ trống = mọi kênh)
          </legend>
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={v.channels.includes(k)}
                  onChange={() => setV((s) => ({ ...s, channels: toggle(s.channels, k) }))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Điều kiện</legend>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span className="text-slate-500">Hạng khách:</span>
            {(Object.keys(RANKING_LABEL) as Ranking[]).map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={v.rankings.includes(r)}
                  onChange={() => setV((s) => ({ ...s, rankings: toggle(s.rankings, r) }))}
                />
                {RANKING_LABEL[r]}
              </label>
            ))}
            <span className="text-xs text-slate-400">(bỏ trống = mọi khách)</span>
          </div>
          <div className="text-sm text-slate-700">
            <span className="text-slate-500">Chỉ giảm cho danh mục (gồm danh mục con):</span>
            <div className="mt-1 flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {categories.length === 0 && (
                <span className="text-xs text-slate-400">Chưa có danh mục</span>
              )}
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={v.categoryIds.includes(c.id)}
                    onChange={() =>
                      setV((s) => ({ ...s, categoryIds: toggle(s.categoryIds, c.id) }))
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={v.autoApply}
              onChange={(e) => setV((s) => ({ ...s, autoApply: e.target.checked }))}
            />
            Tự áp dụng tại POS khi thu ngân không nhập mã (chọn mã giảm nhiều nhất)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={v.isActive}
              onChange={(e) => setV((s) => ({ ...s, isActive: e.target.checked }))}
            />
            Đang áp dụng
          </label>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : coupon ? "Lưu thay đổi" : "Tạo mã"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
