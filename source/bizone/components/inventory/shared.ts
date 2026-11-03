import { TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** Auth props passed from server pages (session wiring comes later — see P2.2 notes) */
export interface ApiAuth {
  tenantId: string;
  authToken: string;
}

export function apiContext(auth: ApiAuth) {
  return {
    context: {
      headers: { Authorization: `Bearer ${auth.authToken}`, "X-Tenant-ID": auth.tenantId },
    },
  };
}

/** Human-readable message from a tRPC error (BizOne errors carry `bizoneMessage`) */
export function errorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) {
    const data = e.data as { bizoneMessage?: string } | undefined;
    return data?.bizoneMessage ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

const numberFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function fmtNumber(v: unknown): string {
  return numberFmt.format(Number(v ?? 0));
}

export function fmtMoney(v: unknown): string {
  return `${numberFmt.format(Math.round(Number(v ?? 0)))}₫`;
}

export function fmtDate(v: Date | string | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = new Date(v);
  return withTime
    ? d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
    : d.toLocaleDateString("vi-VN");
}

export const TX_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "Đang kiểm", className: "bg-blue-50 text-blue-700" },
  confirmed: { label: "Đã xác nhận", className: "bg-emerald-50 text-emerald-700" },
  completed: { label: "Hoàn thành", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Đã huỷ", className: "bg-red-50 text-red-600" },
};

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  // BOM so Excel opens UTF-8 Vietnamese text correctly
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
