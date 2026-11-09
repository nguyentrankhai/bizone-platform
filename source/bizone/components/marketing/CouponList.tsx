"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputAutoCls,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import { Pager } from "@/components/suppliers/shared";
import { CouponForm } from "./CouponForm";
import { MarketingHeader, RANKING_LABEL, StatusPill, fmtDT, type Outputs } from "./shared";

type Coupon = Outputs["coupon"]["list"]["items"][number];
type Status = "" | "running" | "scheduled" | "expired" | "inactive";

export const COUPON_STATUS: Record<
  string,
  { label: string; tone: "green" | "amber" | "slate" | "red" | "blue" }
> = {
  running: { label: "Đang áp dụng", tone: "green" },
  scheduled: { label: "Sắp diễn ra", tone: "blue" },
  expired: { label: "Hết hạn", tone: "slate" },
  exhausted: { label: "Hết lượt", tone: "amber" },
  inactive: { label: "Tạm ngừng", tone: "red" },
};

export function couponValue(c: { type: string; value: number; maxDiscount?: number | null }) {
  if (c.type === "free_shipping") return "Miễn phí vận chuyển";
  if (c.type === "percent")
    return `−${c.value}%${c.maxDiscount ? ` (tối đa ${fmtMoney(c.maxDiscount)})` : ""}`;
  return `−${fmtMoney(c.value)}`;
}

export function CouponList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [usageOf, setUsageOf] = useState<Coupon | null>(null);
  const [issueFor, setIssueFor] = useState<Coupon | null>(null);

  const input = {
    page,
    pageSize: 20,
    ...(query ? { search: query } : {}),
    ...(status ? { status } : {}),
  };
  const list = useLoad(JSON.stringify(input), () => trpc.coupon.list.query(input, ctx));
  const rows = list.data?.items ?? [];

  async function toggle(c: Coupon) {
    try {
      await trpc.coupon.setActive.mutate({ id: c.id, isActive: !c.isActive }, ctx);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove(c: Coupon) {
    if (!confirm(`Xoá mã ${c.code}?`)) return;
    try {
      await trpc.coupon.delete.mutate({ id: c.id }, ctx);
      toast.success("Đã xoá mã");
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <MarketingHeader
        title="Marketing & Khuyến mãi"
        subtitle="Mã giảm giá, voucher, flash sale, mua X tặng Y, combo — áp dụng tự động tại POS"
        actions={
          <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Tạo mã giảm giá
          </button>
        }
      />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Mã hoặc tên chương trình (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm mã giảm giá"
          />
        </div>
        <select
          className={inputAutoCls}
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as Status);
          }}
          aria-label="Trạng thái"
        >
          <option value="">Mọi trạng thái</option>
          <option value="running">Đang áp dụng</option>
          <option value="scheduled">Sắp diễn ra</option>
          <option value="expired">Hết hạn</option>
          <option value="inactive">Tạm ngừng</option>
        </select>
      </form>
      <ErrorBox message={list.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3">Giảm</th>
                <th className="px-4 py-3">Điều kiện</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3 text-right">Đã dùng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {list.loading ? "Đang tải…" : "Chưa có mã giảm giá"}
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const st = COUPON_STATUS[c.status];
                const conds = [
                  c.minOrderAmount ? `Đơn từ ${fmtMoney(c.minOrderAmount)}` : null,
                  c.rankings.length
                    ? `Hạng ${c.rankings.map((r) => RANKING_LABEL[r] ?? r).join(", ")}`
                    : null,
                  c.categoryIds.length ? `${c.categoryIds.length} danh mục` : null,
                  c.autoApply ? "Tự áp dụng" : null,
                  c.channels.length ? c.channels.join(", ") : null,
                ].filter(Boolean);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-slate-800">{c.code}</div>
                      <div className="text-xs text-slate-500">{c.name}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{couponValue(c)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {conds.length ? conds.join(" · ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                      {c.startDate || c.endDate ? (
                        <>
                          {fmtDT(c.startDate)} →<br />
                          {fmtDT(c.endDate)}
                        </>
                      ) : (
                        "Không thời hạn"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setUsageOf(c)}
                      >
                        {c.usedCount}
                        {c.usageLimit ? `/${c.usageLimit}` : ""}
                      </button>
                      {c.totalDiscount > 0 && (
                        <div className="text-xs text-slate-500">−{fmtMoney(c.totalDiscount)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-3 text-sm font-medium">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setEditing(c)}
                        >
                          Sửa
                        </button>
                        {c.type !== "free_shipping" && (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setIssueFor(c)}
                          >
                            Phát voucher
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-slate-600 hover:underline"
                          onClick={() => toggle(c)}
                        >
                          {c.isActive ? "Tạm ngừng" : "Bật lại"}
                        </button>
                        {c.usedCount === 0 && (
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() => remove(c)}
                          >
                            Xoá
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.data && (
          <Pager
            page={list.data.meta.page}
            totalPages={list.data.meta.totalPages}
            total={list.data.meta.total}
            onPage={setPage}
          />
        )}
      </div>

      {editing && (
        <CouponForm
          auth={auth}
          coupon={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {usageOf && <UsageModal auth={auth} coupon={usageOf} onClose={() => setUsageOf(null)} />}
      {issueFor && (
        <IssueVouchersModal
          auth={auth}
          coupon={issueFor}
          onClose={() => setIssueFor(null)}
          onDone={() => {
            setIssueFor(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function UsageModal({
  auth,
  coupon,
  onClose,
}: {
  auth: ApiAuth;
  coupon: Coupon;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const input = { couponId: coupon.id, page, pageSize: 15 };
  const u = useLoad(JSON.stringify(input), () => trpc.coupon.usage.query(input, apiContext(auth)));
  const rows = u.data?.items ?? [];
  return (
    <Modal open onClose={onClose} size="lg" title={`Lịch sử sử dụng — ${coupon.code}`}>
      <ErrorBox message={u.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="py-2">Thời gian</th>
              <th className="py-2">Hoá đơn</th>
              <th className="py-2">Khách hàng</th>
              <th className="py-2 text-right">Giảm</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  {u.loading ? "Đang tải…" : "Chưa có lượt sử dụng"}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-slate-600">{fmtDT(r.usedAt)}</td>
                <td className="py-2">
                  {r.invoice?.code ?? "—"}
                  {r.voucherCode && (
                    <div className="text-xs text-slate-500">voucher {r.voucherCode}</div>
                  )}
                </td>
                <td className="py-2">
                  {r.customer ? `${r.customer.fullName} · ${r.customer.phone}` : "Khách lẻ"}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">
                  −{fmtMoney(r.discount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {u.data && u.data.meta.total > 15 && (
        <Pager
          page={u.data.meta.page}
          totalPages={u.data.meta.totalPages}
          total={u.data.meta.total}
          onPage={setPage}
        />
      )}
    </Modal>
  );
}

function IssueVouchersModal({
  auth,
  coupon,
  onClose,
  onDone,
}: {
  auth: ApiAuth;
  coupon: Coupon;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [rankings, setRankings] = useState<("silver" | "gold" | "vip" | "diamond")[]>([
    "gold",
    "vip",
    "diamond",
  ]);
  const [count, setCount] = useState("0");
  const [prefix, setPrefix] = useState("VC");
  const [expiredAt, setExpiredAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await trpc.coupon.issueVouchers.mutate(
        {
          couponId: coupon.id,
          rankings,
          count: Number(count) || 0,
          prefix,
          expiredAt: expiredAt || null,
        },
        apiContext(auth),
      );
      toast.success(
        `Đã phát hành ${res.issued} voucher (vd. ${res.sample.slice(0, 2).join(", ")})`,
      );
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Phát hành voucher — ${coupon.code}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Mỗi voucher có mã riêng, dùng 1 lần, mức giảm theo mã {coupon.code} ({couponValue(coupon)}
          ). Voucher gắn khách chỉ khách đó dùng được tại POS.
        </p>
        <ErrorBox message={error} />
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Khách hàng thân thiết theo hạng
          </legend>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            {(["silver", "gold", "vip", "diamond"] as const).map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={rankings.includes(r)}
                  onChange={() =>
                    setRankings((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]))
                  }
                />
                {RANKING_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="+ Voucher không gắn khách" htmlFor="vc-count">
            <input
              id="vc-count"
              className={`${inputCls} text-right`}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
          <Field label="Tiền tố mã" htmlFor="vc-prefix">
            <input
              id="vc-prefix"
              className={`${inputCls} uppercase`}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </Field>
          <Field label="Hết hạn" htmlFor="vc-exp" hint="Trống = theo mã gốc">
            <input
              id="vc-exp"
              type="datetime-local"
              className={inputCls}
              value={expiredAt}
              onChange={(e) => setExpiredAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang phát hành…" : "Phát hành"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
