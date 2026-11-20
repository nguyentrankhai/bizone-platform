"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  Power,
  PowerOff,
  Puzzle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorUpload } from "./ConnectorUpload";
import {
  ConnectorApiError,
  connectorApi,
  detailLines,
  fmtDateTime,
  type ConnectorDetail,
  type ConnectorView,
} from "./connector-api";

interface ConnectorsClientProps {
  initial: ConnectorView[];
  canWrite: boolean;
}

const HEALTH_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  Healthy: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Khoẻ" },
  Degraded: { dot: "bg-amber-500", text: "text-amber-700", label: "Chậm" },
  Unhealthy: { dot: "bg-red-500", text: "text-red-700", label: "Lỗi" },
};

function StatusBadge({ c }: { c: ConnectorView }) {
  const style =
    c.status === "Error"
      ? { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", label: "Lỗi tải" }
      : c.isActive
        ? {
            badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
            dot: "bg-emerald-500",
            label: "Đang hoạt động",
          }
        : {
            badge: "bg-gray-100 text-gray-600 border-gray-200",
            dot: "bg-gray-400",
            label: "Ngưng",
          };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        style.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

function HealthLine({ c }: { c: ConnectorView }) {
  const h = c.health;
  if (!h.status) return <p className="text-xs text-gray-400">Chưa kiểm tra sức khoẻ</p>;
  const s = HEALTH_STYLE[h.status]!;
  return (
    <p className="text-xs text-gray-600">
      <span className={cn("inline-flex items-center gap-1 font-semibold", s.text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
        {s.label}
      </span>
      {h.latencyMs !== null && ` · ${h.latencyMs} ms`} · {fmtDateTime(h.checkedAt)}
      {h.message && (
        <span className="block truncate text-gray-400" title={h.message}>
          {h.message}
        </span>
      )}
    </p>
  );
}

function Detail({ code }: { code: string }) {
  const [detail, setDetail] = useState<ConnectorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    connectorApi.get(code).then(
      (d) => live && setDetail(d),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Lỗi tải"),
    );
    return () => {
      live = false;
    };
  }, [code]);
  if (error) return <p className="mt-3 text-xs text-red-600">{error}</p>;
  if (!detail) return <p className="mt-3 text-xs text-gray-400">Đang tải chi tiết…</p>;
  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-gray-400">Nhà phát hành</dt>
        <dd className="break-words">
          {detail.publisher ?? "—"}
          {detail.publisherKey && (
            <span className="text-gray-400"> · khoá {detail.publisherKey}</span>
          )}
        </dd>
        {detail.coreCompatibility && (
          <>
            <dt className="text-gray-400">Tương thích core</dt>
            <dd>{detail.coreCompatibility}</dd>
          </>
        )}
        {detail.pspApiVersion && (
          <>
            <dt className="text-gray-400">API đối tác</dt>
            <dd>{detail.pspApiVersion}</dd>
          </>
        )}
        <dt className="text-gray-400">Giao thức</dt>
        <dd>{detail.protocols.join(", ")}</dd>
        <dt className="text-gray-400">Khả năng</dt>
        <dd>
          {[
            detail.capabilities.refund &&
              `hoàn tiền${detail.capabilities.partialRefund ? " (một phần)" : ""}`,
            detail.capabilities.statusSync && "tra cứu trạng thái",
            detail.capabilities.qr && "QR",
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </dd>
        {detail.source === "plugin" && (
          <>
            <dt className="text-gray-400">Được gọi tới</dt>
            <dd className="break-words">
              {detail.allowedHosts.length ? detail.allowedHosts.join(", ") : "—"} + endpoint của cấu
              hình đối tác
            </dd>
          </>
        )}
      </dl>
      {detail.changelog.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700">Changelog</p>
          <ul className="mt-1 space-y-1">
            {detail.changelog.slice(0, 5).map((c) => (
              <li key={c.version}>
                <span className="font-medium">
                  {c.version} · {c.date}
                </span>
                <ul className="list-disc pl-5">
                  {c.changes.map((ch) => (
                    <li key={ch}>{ch}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail.packages.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700">Phiên bản đã tải lên</p>
          <ul className="mt-1 space-y-0.5">
            {detail.packages.map((p) => (
              <li key={p.id} className="break-all">
                {p.version}
                {p.current && (
                  <span className="ml-1 font-semibold text-emerald-700">(đang dùng)</span>
                )}{" "}
                · {fmtDateTime(p.createdAt)} · {p.uploadedBy ?? "?"} · sha256{" "}
                {p.sha256.slice(0, 12)}…
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail.healthLogs.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700">Lịch sử kiểm tra sức khoẻ</p>
          <ul className="mt-1 space-y-0.5">
            {detail.healthLogs.slice(0, 8).map((l, i) => (
              <li key={i} className="truncate" title={l.message ?? undefined}>
                <span className={HEALTH_STYLE[l.status]?.text}>
                  {HEALTH_STYLE[l.status]?.label}
                </span>{" "}
                · {fmtDateTime(l.checkedAt)} · {l.latencyMs ?? "?"} ms · {l.checkedBy ?? ""}
                {l.message ? ` · ${l.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConnectorCard({
  c,
  canWrite,
  onChange,
  onRemoved,
}: {
  c: ConnectorView;
  canWrite: boolean;
  onChange: (c: ConnectorView) => void;
  onRemoved: (code: string) => void;
}) {
  const [busy, setBusy] = useState<null | "status" | "health" | "remove">(null);
  const [error, setError] = useState<{ text: string; lines: string[] } | null>(null);
  const [open, setOpen] = useState(false);

  async function run(kind: "status" | "health" | "remove", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({
        text: e instanceof Error ? e.message : "Thao tác thất bại",
        lines: e instanceof ConnectorApiError ? detailLines(e.details) : [],
      });
    } finally {
      setBusy(null);
    }
  }

  const toggle = () =>
    run("status", async () => {
      if (
        c.isActive &&
        !window.confirm(
          `Vô hiệu hoá connector "${c.name}"? Giao dịch mới sẽ không được định tuyến tới connector này (giao dịch đang chờ vẫn nhận kết quả).`,
        )
      ) {
        return;
      }
      onChange(await connectorApi.setActive(c.code, !c.isActive));
    });
  const check = () =>
    run("health", async () => {
      const h = await connectorApi.health(c.code);
      onChange({
        ...c,
        health: {
          status: h.status,
          latencyMs: h.latencyMs,
          message: h.message,
          checkedAt: new Date().toISOString(),
        },
      });
    });
  const remove = () =>
    run("remove", async () => {
      if (!window.confirm(`Gỡ connector "${c.name}" và mọi phiên bản đã tải lên?`)) return;
      await connectorApi.remove(c.code);
      onRemoved(c.code);
    });

  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-gray-800">{c.name}</h3>
          <p className="mt-0.5 text-xs break-words text-gray-500">
            {c.code}
            {c.connectorType && ` · ${c.connectorType}`} · v{c.version}
          </p>
        </div>
        <StatusBadge c={c} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
            c.source === "plugin" ? "bg-violet-50 text-violet-700" : "bg-indigo-50 text-indigo-700",
          )}
        >
          {c.source === "plugin" ? "Plugin" : "Tích hợp sẵn"}
        </span>
        {c.paymentMethods.map((m) => (
          <span
            key={m.method}
            title={m.label}
            className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
          >
            {m.method}
          </span>
        ))}
      </div>

      {c.loadError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs break-words text-red-700">
          {c.loadError}
        </p>
      )}

      <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
        <HealthLine c={c} />
        <p className="text-xs text-gray-500">
          <Link
            href={
              c.connectorType
                ? `/partners?type=${encodeURIComponent(c.connectorType)}`
                : "/partners"
            }
            className="hover:text-blue-600"
          >
            {c.partners.total} cấu hình đối tác ({c.partners.active} hoạt động)
          </Link>
        </p>
      </div>

      {error && (
        <div role="alert" className="mt-2 text-xs text-red-600">
          <p>{error.text}</p>
          {error.lines.length > 0 && (
            <ul className="list-disc pl-5">
              {error.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canWrite && (
          <>
            {c.isActive ? (
              <button
                type="button"
                onClick={toggle}
                disabled={!!busy}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 sm:h-9"
              >
                {busy === "status" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PowerOff className="h-4 w-4" />
                )}
                Vô hiệu hoá
              </button>
            ) : (
              <button
                type="button"
                onClick={toggle}
                disabled={!!busy || c.status === "Error"}
                title={c.status === "Error" ? "Plugin chưa tải được" : undefined}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
              >
                {busy === "status" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                Kích hoạt
              </button>
            )}
            {c.code !== "vietqr" && (
              <button
                type="button"
                onClick={check}
                disabled={!!busy}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 sm:h-9"
              >
                {busy === "health" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Kiểm tra
              </button>
            )}
            {c.source === "plugin" && !c.isActive && (
              <button
                type="button"
                onClick={remove}
                disabled={!!busy}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 sm:h-9"
              >
                {busy === "remove" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Gỡ
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ml-auto inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 hover:bg-gray-100 sm:h-9"
        >
          Chi tiết {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {open && <Detail key={`${c.code}@${c.version}`} code={c.code} />}
    </article>
  );
}

export function ConnectorsClient({ initial, canWrite }: ConnectorsClientProps) {
  const [connectors, setConnectors] = useState(initial);
  const active = connectors.filter((c) => c.isActive).length;
  const plugins = connectors.filter((c) => c.source === "plugin").length;

  function replace(updated: ConnectorView) {
    setConnectors((list) =>
      list.some((c) => c.code === updated.code)
        ? list.map((c) => (c.code === updated.code ? updated : c))
        : [...list, updated],
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <Puzzle className="h-5 w-5 text-blue-600" /> Connector
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {connectors.length} connector · {active} hoạt động · {plugins} plugin. Bật / tắt có hiệu
          lực ngay, không cần khởi động lại.
        </p>
      </div>

      {canWrite && <ConnectorUpload onInstalled={(r) => replace(r.connector)} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connectors.map((c) => (
          <ConnectorCard
            key={c.code}
            c={c}
            canWrite={canWrite}
            onChange={replace}
            onRemoved={(code) => setConnectors((list) => list.filter((x) => x.code !== code))}
          />
        ))}
      </div>
    </div>
  );
}
