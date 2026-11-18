"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Globe, KeyRound } from "lucide-react";
import { SyncHistory } from "@/components/omni/SyncHistory";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import {
  PAYMENT_METHOD_LABEL,
  WEBSITE_PAYMENT_METHODS,
  type WebsiteConfig,
} from "@/lib/omni/website";

type Channel = RouterOutputs["omni"]["website"];

const DEFAULTS: WebsiteConfig = {
  storeName: "",
  slug: "",
  branchId: 0,
  hotline: "",
  shippingFee: 30_000,
  freeShippingFrom: null,
  paymentMethods: ["cod", "payhub"],
  paymentMinutes: 30,
  storefrontUrl: "http://localhost:3100",
};

/** Omni Channel → Website (P6.1): settings of the online store, store key, sync log */
export function WebsiteChannel({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const ch = useLoad("omni-website", () => trpc.omni.website.query(undefined, apiContext(auth)));
  const [newKey, setNewKey] = useState<string | null>(null);

  async function rotate() {
    if (
      ch.data?.connected &&
      ch.data.hasKey &&
      !confirm(
        "Tạo khoá mới? Website đang dùng khoá cũ sẽ ngừng kết nối cho tới khi cập nhật khoá.",
      )
    )
      return;
    try {
      const r = await trpc.omni.rotateKey.mutate(undefined, apiContext(auth));
      setNewKey(r.key);
      ch.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function toggle(isActive: boolean) {
    try {
      await trpc.omni.setActive.mutate({ isActive }, apiContext(auth));
      toast.success(isActive ? "Đã bật bán hàng trên website" : "Đã tạm ngừng website");
      ch.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const data = ch.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/omni" className="text-sm text-primary hover:underline">
            ← Omni Channel
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Website bán hàng</h1>
          <p className="text-sm text-slate-500">
            Cửa hàng online [tên].bizone.vn: sản phẩm, tồn kho, đơn hàng đồng bộ trực tiếp
          </p>
        </div>
      </div>
      <ErrorBox message={ch.error} />

      {data && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Globe className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold text-slate-900">Website bán hàng</div>
                <div className="text-xs text-slate-500">
                  {data.connected && data.config
                    ? `${data.config.slug}.bizone.vn · ${data.orders30d} đơn / 30 ngày · đồng bộ lần cuối ${data.lastSyncAt ? fmtDate(data.lastSyncAt, true) : "—"}`
                    : "Chưa kết nối"}
                </div>
              </div>
            </div>
            {data.connected && (
              <div className="flex flex-wrap items-center gap-2">
                {data.failed24h > 0 && (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                    {data.failed24h} lỗi đồng bộ / 24 giờ
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    data.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {data.isActive ? "Đang bán" : "Tạm ngừng"}
                </span>
                <button className={btnSecondary} onClick={() => toggle(!data.isActive)}>
                  {data.isActive ? "Tạm ngừng" : "Bật bán hàng"}
                </button>
                {data.config && (
                  <a
                    className={btnSecondary}
                    href={data.config.storefrontUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" /> Mở website
                  </a>
                )}
              </div>
            )}
          </div>

          <SettingsForm
            key={data.connected ? (data.config?.slug ?? "x") : "new"}
            auth={auth}
            channel={data}
            onSaved={ch.reload}
          />

          {data.connected && (
            <div className="space-y-2 border-t border-slate-100 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">Khoá kết nối (store key)</div>
                  <div className="text-xs text-slate-500">
                    Website dùng khoá này để đọc sản phẩm, tồn kho và gửi đơn về BizOne. Chỉ hiện
                    một lần khi tạo.
                  </div>
                </div>
                <button className={btnSecondary} onClick={rotate}>
                  <KeyRound className="h-4 w-4" /> {data.hasKey ? "Tạo khoá mới" : "Tạo khoá"}
                </button>
              </div>
              <code className="block rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {data.hasKey ? data.keyHint : "Chưa có khoá"}
              </code>
              {newKey && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div className="font-medium text-amber-800">
                    Khoá mới — sao chép ngay, sẽ không hiện lại:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 rounded bg-white px-2 py-1 text-xs break-all">
                      {newKey}
                    </code>
                    <button
                      className={btnSecondary}
                      onClick={() =>
                        navigator.clipboard
                          .writeText(newKey)
                          .then(() => toast.success("Đã sao chép"))
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs text-amber-800">
                    Đặt vào biến môi trường của website:{" "}
                    <code>
                      STORE_KEYS=&quot;{data.config?.slug}={"{khoá}"}&quot;
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data?.connected && <SyncHistory auth={auth} channel="website" />}
    </div>
  );
}

function SettingsForm({
  auth,
  channel,
  onSaved,
}: {
  auth: ApiAuth;
  channel: Channel;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initial: WebsiteConfig =
    channel.connected && channel.config
      ? channel.config
      : {
          ...DEFAULTS,
          branchId: channel.branches.find((b) => b.isDefault)?.id ?? channel.branches[0]?.id ?? 0,
        };
  const [f, setF] = useState<WebsiteConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof WebsiteConfig>(k: K, v: WebsiteConfig[K]) =>
    setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await trpc.omni.saveWebsite.mutate(f, apiContext(auth));
      toast.success(
        r.created ? "Đã tạo kênh website — tạo khoá kết nối bên dưới" : "Đã lưu cấu hình website",
      );
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 px-4 py-4 sm:grid-cols-2">
      <Field label="Tên cửa hàng" htmlFor="ws-name">
        <input
          id="ws-name"
          className={inputCls}
          value={f.storeName}
          onChange={(e) => set("storeName", e.target.value)}
        />
      </Field>
      <Field label="Tên miền" htmlFor="ws-slug" hint={`${f.slug || "ten-cua-hang"}.bizone.vn`}>
        <input
          id="ws-slug"
          className={inputCls}
          value={f.slug}
          onChange={(e) => set("slug", e.target.value)}
        />
      </Field>
      <Field label="Chi nhánh nhận đơn & xuất kho" htmlFor="ws-branch">
        <select
          id="ws-branch"
          className={inputCls}
          value={f.branchId}
          onChange={(e) => set("branchId", Number(e.target.value))}
        >
          {channel.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hotline" htmlFor="ws-hotline">
        <input
          id="ws-hotline"
          className={inputCls}
          value={f.hotline}
          onChange={(e) => set("hotline", e.target.value)}
        />
      </Field>
      <Field label="Phí giao hàng (₫)" htmlFor="ws-fee" hint={fmtMoney(f.shippingFee)}>
        <input
          id="ws-fee"
          type="number"
          min={0}
          className={inputCls}
          value={f.shippingFee}
          onChange={(e) => set("shippingFee", Number(e.target.value))}
        />
      </Field>
      <Field label="Miễn phí giao hàng từ (₫)" htmlFor="ws-free" hint="Để trống nếu không áp dụng">
        <input
          id="ws-free"
          type="number"
          min={0}
          className={inputCls}
          value={f.freeShippingFrom ?? ""}
          onChange={(e) =>
            set("freeShippingFrom", e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </Field>
      <Field label="Phương thức thanh toán">
        <div className="space-y-1.5 pt-1">
          {WEBSITE_PAYMENT_METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.paymentMethods.includes(m)}
                onChange={(e) =>
                  set(
                    "paymentMethods",
                    e.target.checked
                      ? [...f.paymentMethods, m]
                      : f.paymentMethods.filter((x) => x !== m),
                  )
                }
              />
              {PAYMENT_METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </Field>
      <Field
        label="Hạn thanh toán online (phút)"
        htmlFor="ws-minutes"
        hint="Quá hạn chưa thanh toán → đơn tự huỷ, trả lại tồn kho"
      >
        <input
          id="ws-minutes"
          type="number"
          min={5}
          max={1440}
          className={inputCls}
          value={f.paymentMinutes}
          onChange={(e) => set("paymentMinutes", Number(e.target.value))}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label="Địa chỉ website"
          htmlFor="ws-url"
          hint="Payment Hub chỉ đưa khách quay về địa chỉ này sau khi thanh toán"
        >
          <input
            id="ws-url"
            className={inputCls}
            value={f.storefrontUrl}
            onChange={(e) => set("storefrontUrl", e.target.value)}
          />
        </Field>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <ErrorBox message={error} />
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? "Đang lưu…" : channel.connected ? "Lưu cấu hình" : "Kết nối website"}
        </button>
      </div>
    </form>
  );
}
