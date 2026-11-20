"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Link2,
  PackageCheck,
  Pause,
  Play,
  RefreshCw,
  ShoppingCart,
  Unplug,
  Upload,
} from "lucide-react";
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
  LISTING_STATUS_LABEL,
  type MarketplaceCode,
  type MarketplaceConfig,
} from "@/lib/omni/marketplace";
import { SyncHistory } from "@/components/omni/SyncHistory";
import { useApiAuth } from "@/components/auth/AuthProvider";

type Channel = RouterOutputs["omni"]["marketplace"];
type Tab = "products" | "categories" | "settings" | "logs";

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  connected: { label: "Đang kết nối", cls: "bg-green-50 text-green-700" },
  paused: { label: "Tạm ngừng đồng bộ", cls: "bg-slate-100 text-slate-600" },
  disconnected: { label: "Chưa kết nối", cls: "bg-slate-100 text-slate-600" },
  reconnect: { label: "Cần kết nối lại", cls: "bg-red-50 text-red-700" },
};

const DEFAULTS: MarketplaceConfig = {
  branchId: 0,
  priceMarkupPercent: 0,
  stockBuffer: 0,
  autoSyncStock: true,
  autoImportOrders: true,
  defaultWeightKg: 0.5,
  packageCm: { length: 20, width: 15, height: 10 },
  categoryMap: {},
};

/**
 * `/omni/{shopee|lazada|tiktok|facebook}` — connect a shop, settings, category map, listings,
 * sync log (P6.2; TikTok Shop + Facebook / Instagram catalog P6.3 — the Meta catalog has no
 * category map and no order import: buyers order on the website through the product link)
 */
export function MarketplaceChannel({
  code,
  flash,
}: {
  code: MarketplaceCode;
  flash: { connected?: boolean; error?: string };
}) {
  const auth = useApiAuth();
  const toast = useToast();
  const ch = useLoad(`omni-mp-${code}`, () =>
    trpc.omni.marketplace.query({ code }, apiContext(auth)),
  );
  const [tab, setTab] = useState<Tab>("products");
  const [busy, setBusy] = useState(false);
  const d = ch.data;

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      ch.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const r = await trpc.omni.connect.mutate({ code }, apiContext(auth));
      // QA-5 #160: the OAuth callback only accepts the browser that started the connection
      const b = r.binding;
      document.cookie = `${b.cookie}=${b.value}; Path=/api/omni/oauth; Max-Age=${b.maxAge}; SameSite=Lax${
        window.location.protocol === "https:" ? "; Secure" : ""
      }`;
      window.location.href = r.url;
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  const state = d?.state ?? "disconnected";
  const connected = state === "connected" || state === "paused";
  const features = d?.features;
  const tabs = (
    [
      ["products", "Sản phẩm"],
      ["categories", "Danh mục"],
      ["settings", "Cài đặt"],
      ["logs", "Lịch sử đồng bộ"],
    ] as const
  ).filter(([k]) => k !== "categories" || features?.categories !== false);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/omni" className="text-sm text-primary hover:underline">
          ← Omni Channel
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{d?.name ?? code}</h1>
        <p className="text-sm text-slate-500">
          {features?.orders === false
            ? `Đưa sản phẩm vào catalog ${d?.name ?? ""} (shop Facebook Page, mua sắm trên Instagram), đồng bộ giá / tồn kho (≤ 30 giây) — khách bấm mua được đưa tới website của cửa hàng`
            : `Đăng sản phẩm, đồng bộ giá / tồn kho (≤ 30 giây) và nhận đơn ${d?.name ?? ""} về BizOne`}
        </p>
      </div>
      {features?.linksToWebsite && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Meta không còn cho đặt hàng trực tiếp trên Facebook / Instagram tại Việt Nam: mỗi sản phẩm
          trong catalog trỏ tới trang sản phẩm trên{" "}
          <Link href="/omni/website" className="font-medium underline">
            website
          </Link>{" "}
          (kèm <code className="text-xs">utm_source=facebook</code>). Đơn khách đặt từ đó là đơn
          Website, ghi nguồn &quot;Facebook&quot; / &quot;Instagram&quot; trong danh sách đơn.
        </div>
      )}
      {flash.connected && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {features?.orders === false
            ? "Đã kết nối catalog thành công. Chọn sản phẩm ở tab Sản phẩm để đưa lên catalog."
            : "Đã kết nối shop thành công. Đơn hàng mới (lần đầu: 24 giờ gần nhất) sẽ được nhận về trong ít phút."}
        </div>
      )}
      {flash.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Kết nối không thành công: {flash.error}
        </div>
      )}
      <ErrorBox message={ch.error} />

      {d && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {d.exists && d.shopId ? d.shopName : `Shop ${d.name}`}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    STATE_BADGE[state]?.cls,
                  )}
                >
                  {STATE_BADGE[state]?.label ?? state}
                </span>
                {d.exists && d.failed24h > 0 && (
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {d.failed24h} lỗi / 24 giờ
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {d.exists && d.shopId
                  ? features?.orders === false
                    ? `Catalog ID ${d.shopId} · ${d.listings.synced} SKU đã đồng bộ · ${d.orders30d} đơn website từ Facebook / Instagram / 30 ngày · token hết hạn ${d.tokenExpiresAt ? fmtDate(d.tokenExpiresAt, true) : "—"}`
                    : `Shop ID ${d.shopId} · ${d.listings.synced} SKU đã đồng bộ · ${d.orders30d} đơn / 30 ngày · nhận đơn lần cuối ${d.lastOrderSyncAt ? fmtDate(d.lastOrderSyncAt, true) : "—"}`
                  : "Lưu cài đặt rồi bấm Kết nối để chủ shop đăng nhập và cấp quyền cho BizOne"}
              </div>
              {d.exists && d.lastError && (
                <div className="mt-1 text-xs text-red-600">Lỗi gần nhất: {d.lastError}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(state === "disconnected" || state === "reconnect") && (
                <button
                  className={btnPrimary}
                  disabled={busy || !d.platformConfigured || !d.config}
                  onClick={connect}
                  title={!d.config ? "Lưu cài đặt trước" : undefined}
                >
                  <Link2 className="h-4 w-4" />{" "}
                  {state === "reconnect" ? "Kết nối lại" : `Kết nối ${d.name}`}
                </button>
              )}
              {state === "connected" && (
                <>
                  {features?.orders !== false && (
                    <button
                      className={btnSecondary}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            trpc.omni.syncNow.mutate({ code, what: "orders" }, apiContext(auth)),
                          "Đang nhận đơn mới — xem Lịch sử đồng bộ",
                        )
                      }
                    >
                      <ShoppingCart className="h-4 w-4" /> Đồng bộ đơn
                    </button>
                  )}
                  <button
                    className={btnSecondary}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => trpc.omni.syncNow.mutate({ code, what: "stock" }, apiContext(auth)),
                        "Đang đẩy giá / tồn kho lên sàn",
                      )
                    }
                  >
                    <RefreshCw className="h-4 w-4" /> Đồng bộ giá & tồn
                  </button>
                </>
              )}
              {connected && (
                <>
                  <button
                    className={btnSecondary}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          trpc.omni.setMarketplaceActive.mutate(
                            { code, isActive: state !== "connected" },
                            apiContext(auth),
                          ),
                        state === "connected" ? "Đã tạm ngừng đồng bộ" : "Đã bật lại đồng bộ",
                      )
                    }
                  >
                    {state === "connected" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {state === "connected" ? "Tạm ngừng" : "Bật lại"}
                  </button>
                  <button
                    className={btnSecondary}
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        `Ngắt kết nối ${d.name}? BizOne ngừng nhận đơn và cập nhật tồn kho cho shop này (sản phẩm trên sàn giữ nguyên).`,
                      ) &&
                      run(
                        () => trpc.omni.disconnect.mutate({ code }, apiContext(auth)),
                        "Đã ngắt kết nối",
                      )
                    }
                  >
                    <Unplug className="h-4 w-4" /> Ngắt kết nối
                  </button>
                </>
              )}
            </div>
          </div>
          {!d.platformConfigured && (
            <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              BizOne chưa có thông tin ứng dụng {d.name} ({d.platformEnv}, OMNI_TOKEN_KEY) — quản
              trị hệ thống cần đăng ký ứng dụng trên trang nhà phát triển của nền tảng.
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                  tab === k
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {d && tab === "settings" && <SettingsForm auth={auth} channel={d} onSaved={ch.reload} />}
      {d && tab === "categories" && <CategoryMap auth={auth} channel={d} onSaved={ch.reload} />}
      {d && tab === "products" && <Listings auth={auth} channel={d} onChanged={ch.reload} />}
      {d && tab === "logs" && <SyncHistory auth={auth} channel={code} />}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

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
  // Meta catalog: no shipping package, no order import
  const social = channel.features.orders === false;
  const [f, setF] = useState<MarketplaceConfig>(
    () =>
      channel.config ?? {
        ...DEFAULTS,
        branchId: channel.branches.find((b) => b.isDefault)?.id ?? 0,
      },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof MarketplaceConfig>(k: K, v: MarketplaceConfig[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const id = (k: string) => `${channel.code}-${k}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await trpc.omni.saveMarketplace.mutate({ code: channel.code, config: f }, apiContext(auth));
      toast.success("Đã lưu cài đặt");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <form
      onSubmit={save}
      className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <Field
        label={social ? "Chi nhánh lấy tồn kho" : "Chi nhánh nhận đơn"}
        htmlFor={id("branch")}
        hint="Tồn kho đẩy lên sàn = kho đầu tiên của chi nhánh"
      >
        <select
          id={id("branch")}
          className={inputCls}
          value={f.branchId || ""}
          onChange={(e) => set("branchId", Number(e.target.value))}
        >
          <option value="">— Chọn chi nhánh —</option>
          {channel.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Tăng giá trên sàn (%)"
        htmlFor={id("markup")}
        hint="Giá sàn = giá bán × (1 + %), làm tròn lên 100₫ (bù phí sàn)"
      >
        <input
          id={id("markup")}
          type="number"
          min={0}
          max={300}
          step="0.5"
          className={inputCls}
          value={f.priceMarkupPercent}
          onChange={(e) => set("priceMarkupPercent", num(e.target.value))}
        />
      </Field>
      <Field
        label="Giữ lại tồn kho (đơn vị)"
        htmlFor={id("buffer")}
        hint="Tồn trên sàn = tồn kho − số giữ lại (tránh bán vượt)"
      >
        <input
          id={id("buffer")}
          type="number"
          min={0}
          className={inputCls}
          value={f.stockBuffer}
          onChange={(e) => set("stockBuffer", num(e.target.value))}
        />
      </Field>
      {!social && (
        <>
          <Field
            label="Cân nặng mặc định (kg)"
            htmlFor={id("weight")}
            hint="Dùng khi sản phẩm chưa có cân nặng"
          >
            <input
              id={id("weight")}
              type="number"
              min={0.01}
              step="0.01"
              className={inputCls}
              value={f.defaultWeightKg}
              onChange={(e) => set("defaultWeightKg", num(e.target.value))}
            />
          </Field>
          <Field label="Kích thước kiện mặc định (cm: dài × rộng × cao)">
            <div className="flex gap-2">
              {(["length", "width", "height"] as const).map((k) => (
                <input
                  key={k}
                  type="number"
                  min={1}
                  aria-label={k}
                  className={inputCls}
                  value={f.packageCm[k]}
                  onChange={(e) => set("packageCm", { ...f.packageCm, [k]: num(e.target.value) })}
                />
              ))}
            </div>
          </Field>
        </>
      )}
      <Field label="Tự động">
        <div className="space-y-1.5 pt-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.autoSyncStock}
              onChange={(e) => set("autoSyncStock", e.target.checked)}
            />
            Tự đẩy giá / tồn kho khi thay đổi (≤ 30 giây)
          </label>
          {!social && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.autoImportOrders}
                onChange={(e) => set("autoImportOrders", e.target.checked)}
              />
              Tự nhận đơn mới (thông báo đẩy + quét 2 phút / lần)
            </label>
          )}
        </div>
      </Field>
      <div className="space-y-2 sm:col-span-2">
        <ErrorBox message={error} />
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu cài đặt"}
        </button>
      </div>
    </form>
  );
}

// ─── Category map ────────────────────────────────────────────────────────────

function CategoryMap({
  auth,
  channel,
  onSaved,
}: {
  auth: ApiAuth;
  channel: Channel;
  onSaved: () => void;
}) {
  const toast = useToast();
  const connected = channel.state === "connected" || channel.state === "paused";
  const [refresh, setRefresh] = useState(0);
  const cats = useLoad(`omni-cats-${channel.code}-${connected}-${refresh}`, () =>
    connected
      ? trpc.omni.categories.query({ code: channel.code, refresh: refresh > 0 }, apiContext(auth))
      : Promise.resolve([]),
  );
  const [map, setMap] = useState<Record<string, string>>(() => channel.config?.categoryMap ?? {});
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const pathOf = (id: string) => {
    const parts: string[] = [];
    let cur = byId.get(id);
    for (let i = 0; cur && i < 8; i++) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" › ") || `#${id}`;
  };
  const leaves = useMemo(() => (cats.data ?? []).filter((c) => c.leaf), [cats.data]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return leaves.slice(0, 30);
    return leaves.filter((c) => pathOf(c.id).toLowerCase().includes(term)).slice(0, 30);
  }, [q, leaves]); // eslint-disable-line react-hooks/exhaustive-deps -- pathOf reads byId (derived from cats)

  const depth = useMemo(() => {
    const parents = new Map(channel.categories.map((c) => [c.id, c.parentId]));
    const dep = (id: number) => {
      let n = 0;
      let p = parents.get(id);
      while (p && n < 6) {
        n++;
        p = parents.get(p);
      }
      return n;
    };
    // parents first, children right after
    const ordered: { id: number; name: string; parentId: number | null; level: number }[] = [];
    const walk = (parent: number | null) =>
      channel.categories
        .filter((c) => (c.parentId ?? null) === parent)
        .forEach((c) => {
          ordered.push({ ...c, level: dep(c.id) });
          walk(c.id);
        });
    walk(null);
    return ordered;
  }, [channel.categories]);

  const inherited = (id: number | null): string | null => {
    let cur = id;
    const parents = new Map(channel.categories.map((c) => [c.id, c.parentId]));
    for (let i = 0; cur && i < 8; i++) {
      if (map[String(cur)]) return map[String(cur)];
      cur = parents.get(cur) ?? null;
    }
    return null;
  };

  async function save() {
    if (!channel.config) return toast.error("Lưu cài đặt kênh trước");
    setSaving(true);
    try {
      await trpc.omni.saveMarketplace.mutate(
        { code: channel.code, config: { ...channel.config, categoryMap: map } },
        apiContext(auth),
      );
      toast.success("Đã lưu ghép danh mục");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!connected)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Kết nối shop để tải danh mục {channel.name}
      </div>
    );
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="font-semibold text-slate-900">Ghép danh mục BizOne ↔ {channel.name}</div>
          <div className="text-xs text-slate-500">
            Sàn yêu cầu danh mục cấp cuối. Danh mục con chưa ghép dùng danh mục của danh mục cha.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={btnSecondary}
            onClick={() => setRefresh((n) => n + 1)}
            disabled={cats.loading}
          >
            <RefreshCw className="h-4 w-4" /> Tải lại danh mục sàn
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu ghép danh mục"}
          </button>
        </div>
      </div>
      <ErrorBox message={cats.error} />
      {cats.loading && !cats.data && (
        <div className="px-4 py-6 text-sm text-slate-500">Đang tải danh mục…</div>
      )}
      <ul className="divide-y divide-slate-100">
        {depth.map((c) => {
          const own = map[String(c.id)];
          const eff = own ?? inherited(c.parentId);
          return (
            <li key={c.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0" style={{ paddingLeft: `${c.level * 16}px` }}>
                  <div className="text-sm font-medium text-slate-800">{c.name}</div>
                  <div className={cn("text-xs", eff ? "text-slate-500" : "text-amber-600")}>
                    {eff ? `${own ? "" : "Theo danh mục cha: "}${pathOf(eff)}` : "Chưa ghép"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {own && (
                    <button
                      className={btnSecondary}
                      onClick={() =>
                        setMap((m) => {
                          const next = { ...m };
                          delete next[String(c.id)];
                          return next;
                        })
                      }
                    >
                      Bỏ ghép
                    </button>
                  )}
                  <button
                    className={btnSecondary}
                    onClick={() => {
                      setOpen(open === c.id ? null : c.id);
                      setQ(c.name);
                    }}
                  >
                    {open === c.id ? "Đóng" : "Chọn"}
                  </button>
                </div>
              </div>
              {open === c.id && (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                  <input
                    className={inputCls}
                    autoFocus
                    placeholder={`Tìm danh mục ${channel.name}…`}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <div className="max-h-64 overflow-y-auto">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-white"
                        onClick={() => {
                          setMap((x) => ({ ...x, [String(c.id)]: m.id }));
                          setOpen(null);
                        }}
                      >
                        {pathOf(m.id)} <span className="text-xs text-slate-400">#{m.id}</span>
                      </button>
                    ))}
                    {matches.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-slate-500">
                        Không có danh mục phù hợp
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Listings ────────────────────────────────────────────────────────────────

const LISTING_CLS: Record<string, string> = {
  none: "bg-slate-100 text-slate-600",
  pending: "bg-blue-50 text-blue-700",
  synced: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
  paused: "bg-slate-100 text-slate-500",
};

function Listings({
  auth,
  channel,
  onChanged,
}: {
  auth: ApiAuth;
  channel: Channel;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"" | keyof typeof LISTING_STATUS_LABEL>("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const list = useLoad(`omni-list-${channel.code}-${term}-${status}-${page}`, () =>
    trpc.omni.listings.query(
      {
        code: channel.code,
        page,
        limit: 20,
        ...(term ? { search: term } : {}),
        ...(status ? { status } : {}),
      },
      apiContext(auth),
    ),
  );
  const connected = channel.state === "connected";
  const items = list.data?.items ?? [];

  async function push(ids: number[]) {
    setBusy(true);
    try {
      const r = await trpc.omni.pushProducts.mutate(
        { code: channel.code, productIds: ids },
        apiContext(auth),
      );
      toast.success(`Đã xếp ${r.queued} sản phẩm để đăng / cập nhật lên ${channel.name}`);
      setPicked(new Set());
      list.reload();
      onChanged();
      setTimeout(list.reload, 4000);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(productId: number, isActive: boolean) {
    try {
      await trpc.omni.setListingActive.mutate(
        { code: channel.code, productId, isActive },
        apiContext(auth),
      );
      toast.success(isActive ? "Đã bật lại đồng bộ sản phẩm" : "Đã ngừng đồng bộ sản phẩm này");
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search.trim());
            setPage(1);
          }}
        >
          <input
            className={cn(inputCls, "w-56")}
            placeholder="Tìm tên / SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={cn(inputCls, "w-auto")}
            value={status}
            aria-label="Trạng thái đồng bộ"
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(LISTING_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className={btnSecondary} type="submit">
            Lọc
          </button>
          <button className={btnSecondary} type="button" onClick={list.reload} aria-label="Tải lại">
            <RefreshCw className="h-4 w-4" />
          </button>
        </form>
        <button
          className={btnPrimary}
          disabled={!connected || picked.size === 0 || busy}
          onClick={() => push([...picked])}
        >
          <Upload className="h-4 w-4" /> Đăng / cập nhật lên {channel.name} ({picked.size})
        </button>
      </div>
      {!connected && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Kết nối shop (và bật đồng bộ) để đăng sản phẩm.
        </div>
      )}
      <ErrorBox message={list.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={items.length > 0 && items.every((i) => picked.has(i.id))}
                  onChange={(e) =>
                    setPicked((p) => {
                      const next = new Set(p);
                      for (const i of items) {
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th className="px-4 py-2">Sản phẩm</th>
              <th className="px-4 py-2 text-right">Giá BizOne → sàn</th>
              <th className="px-4 py-2 text-right">Tồn kho → sàn</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${p.name}`}
                    checked={picked.has(p.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.sku} · {p.category ?? "Chưa có danh mục"}
                    {p.variants > 0 && ` · ${p.variants} phân loại`}
                    {!p.hasImage && <span className="text-amber-600"> · chưa có ảnh</span>}
                    {p.itemId && ` · item ${p.itemId}`}
                  </div>
                  {p.error && <div className="mt-0.5 text-xs text-red-600">{p.error}</div>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {fmtMoney(p.price)}
                  {p.channelPrice !== null && p.channelPrice !== p.price && (
                    <div className="text-xs text-slate-500">→ {fmtMoney(p.channelPrice)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {p.onHand ?? "Không theo dõi"}
                  {p.listedStock !== null && (
                    <div className="text-xs text-slate-500">trên sàn: {p.listedStock}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                      LISTING_CLS[p.status],
                    )}
                  >
                    {LISTING_STATUS_LABEL[p.status as keyof typeof LISTING_STATUS_LABEL]}
                  </span>
                  {p.lastSyncAt && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      {fmtDate(p.lastSyncAt, true)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {p.status === "none" || p.status === "error" ? (
                    <button
                      className={btnSecondary}
                      disabled={!connected || busy}
                      onClick={() => push([p.id])}
                    >
                      <PackageCheck className="h-4 w-4" />{" "}
                      {p.status === "error" ? "Thử lại" : "Đăng"}
                    </button>
                  ) : p.status === "paused" ? (
                    <button className={btnSecondary} onClick={() => toggle(p.id, true)}>
                      <Play className="h-4 w-4" /> Bật lại
                    </button>
                  ) : (
                    <button className={btnSecondary} onClick={() => toggle(p.id, false)}>
                      <Pause className="h-4 w-4" /> Ngừng
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.data && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Không có sản phẩm
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list.data && list.data.total > list.data.limit && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-sm">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span>
            {page} / {Math.ceil(list.data.total / list.data.limit)}
          </span>
          <button
            className={btnSecondary}
            disabled={page * list.data.limit >= list.data.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
