"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  DASHBOARD_PERIODS,
  DASHBOARD_WS_SUBSCRIBE,
  PERIOD_LABELS,
  type DashboardData,
  type DashboardPeriod,
  type DashboardStatsEvent,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { DashboardAlerts } from "./DashboardAlerts";
import { DashboardStats } from "./DashboardStats";
import { PaymentMethodPie, SuccessRatePie } from "./PaymentMethodPie";
import { RecentTransactions } from "./RecentTransactions";
import { RevenueChart } from "./RevenueChart";
import { TopMerchants } from "./TopMerchants";
import { fmtTime } from "./dashboard-format";

/** Re-fetch interval while the WebSocket is down (AC-PH-DASH-02: data ≤ 30 s old). */
const POLL_MS = 15_000;
const WS_PROTOCOL = "payhub-events";

type WsState = "connecting" | "live" | "offline";

interface Props {
  initial: DashboardData;
  authToken: string;
  wsUrl: string;
}

function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {action}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DashboardClient({ initial, authToken, wsUrl }: Props) {
  const [data, setData] = useState<DashboardData>(initial);
  const [period, setPeriod] = useState<DashboardPeriod>(initial.period);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WsState>(wsUrl && authToken ? "connecting" : "offline");
  const [flash, setFlash] = useState(false);
  const [newIds, setNewIds] = useState<ReadonlySet<number>>(new Set());
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));

  const periodRef = useRef(period);
  const dataRef = useRef(data);
  const inFlight = useRef<AbortController | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(
    async (p: DashboardPeriod) => {
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/internal/dashboard?period=${p}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          signal: ctrl.signal,
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: DashboardData;
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success || !json.data) {
          throw new Error(
            res.status === 401
              ? "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang"
              : res.status === 403
                ? "Bạn không có quyền xem dashboard (cần role payhub-admin/payhub-viewer)"
                : (json?.error?.message ?? `Lỗi HTTP ${res.status}`),
          );
        }
        if (p !== periodRef.current) return;
        const prevIds = new Set(dataRef.current.recentTransactions.map((t) => t.id));
        const fresh = json.data.recentTransactions
          .filter((t) => !prevIds.has(t.id))
          .map((t) => t.id);
        setData(json.data);
        setError(null);
        setNow(Date.now());
        if (fresh.length) {
          setNewIds(new Set(fresh));
          setTimeout(() => setNewIds(new Set()), 4000);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (inFlight.current === ctrl) {
          inFlight.current = null;
          setLoading(false);
        }
      }
    },
    [authToken],
  );

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void load(periodRef.current);
    }, 300);
  }, [load]);

  const changePeriod = (p: DashboardPeriod) => {
    if (p === period) return;
    setPeriod(p);
    periodRef.current = p;
    void load(p);
  };

  // Realtime: dashboard:stats patches the top bar instantly (period "today"), dashboard:refresh
  // re-fetches the whole dashboard. Reconnects with exponential backoff.
  useEffect(() => {
    if (!wsUrl || !authToken) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      setWs("connecting");
      try {
        socket = new WebSocket(wsUrl, [WS_PROTOCOL, authToken]);
      } catch {
        setWs("offline");
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        setWs("live");
        socket?.send(JSON.stringify(DASHBOARD_WS_SUBSCRIBE));
        // Catch up on anything missed while disconnected.
        scheduleRefresh();
      };
      socket.onmessage = (ev) => {
        let msg: { type?: string; data?: unknown };
        try {
          msg = JSON.parse(String(ev.data)) as typeof msg;
        } catch {
          return;
        }
        if (msg.type === "dashboard:stats" && periodRef.current === "today") {
          const s = msg.data as DashboardStatsEvent;
          setData((d) =>
            d.period !== "today"
              ? d
              : {
                  ...d,
                  summary: {
                    ...d.summary,
                    total: s.total_today,
                    paidAmount: s.amount_today,
                    paid: s.success_count,
                    failed: s.failed_count,
                    successRate: s.success_rate,
                  },
                },
          );
          setFlash(true);
          setTimeout(() => setFlash(false), 800);
        } else if (msg.type === "dashboard:refresh") {
          scheduleRefresh();
        }
      };
      socket.onclose = () => {
        socket = null;
        if (closed) return;
        setWs("offline");
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        retry = setTimeout(connect, delay);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [wsUrl, authToken, scheduleRefresh]);

  // Fallback polling while realtime is unavailable.
  useEffect(() => {
    if (ws === "live") return;
    const id = setInterval(() => void load(periodRef.current), POLL_MS);
    return () => clearInterval(id);
  }, [ws, load]);

  // Clock for "x phút trước" labels.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      inFlight.current?.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const chartTitle = `Giao dịch ${data.chart.length} ngày qua`;

  return (
    <div className="space-y-6" data-testid="dashboard" data-generated-at={data.generatedAt}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span
              data-testid="ws-status"
              data-state={ws}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                ws === "live"
                  ? "bg-emerald-50 text-emerald-700"
                  : ws === "connecting"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-600",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  ws === "live"
                    ? "animate-pulse bg-emerald-500"
                    : ws === "connecting"
                      ? "bg-amber-500"
                      : "bg-gray-400",
                )}
              />
              {ws === "live"
                ? "Real-time"
                : ws === "connecting"
                  ? "Đang kết nối…"
                  : `Ngoại tuyến — tự làm mới mỗi ${POLL_MS / 1000}s`}
            </span>
            <span>Cập nhật lúc {fmtTime(data.generatedAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5"
            role="group"
            aria-label="Khoảng thời gian"
          >
            {DASHBOARD_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changePeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "min-h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  period === p ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100",
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(period)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Làm mới"
            title="Làm mới"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className={cn("space-y-6 transition-opacity", loading && "opacity-70")}>
        <DashboardStats data={data} flash={flash} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel title={chartTitle} className="xl:col-span-2">
            <RevenueChart data={data.chart} />
          </Panel>
          <Panel title="Cảnh báo">
            <DashboardAlerts alerts={data.alerts} now={now} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title={`Phương thức thanh toán — ${PERIOD_LABELS[data.period].toLowerCase()}`}>
            <PaymentMethodPie slices={data.paymentMethods} />
          </Panel>
          <Panel
            title={`Tỷ lệ thành công / thất bại — ${PERIOD_LABELS[data.period].toLowerCase()}`}
          >
            <SuccessRatePie summary={data.summary} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Panel
            title="10 giao dịch gần nhất"
            className="xl:col-span-3"
            bodyClassName="p-0"
            action={
              <Link href="/transactions" className="text-xs text-blue-600 hover:underline">
                Xem tất cả →
              </Link>
            }
          >
            <RecentTransactions items={data.recentTransactions} highlight={newIds} />
          </Panel>
          <Panel title="Top merchant theo doanh thu" className="xl:col-span-2" bodyClassName="p-0">
            <TopMerchants items={data.topMerchants} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
