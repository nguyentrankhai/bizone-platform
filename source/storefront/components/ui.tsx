import Link from "next/link";
import type { ReactNode } from "react";
import { fmtVnd } from "@/lib/format";

export const btn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50";
export const btnOutline =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const input =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none";

export function Price({
  price,
  sale,
  className = "",
}: {
  price: number;
  sale?: number | null;
  className?: string;
}) {
  if (sale != null && sale < price)
    return (
      <span className={className}>
        <span className="font-semibold text-red-600">{fmtVnd(sale)}</span>{" "}
        <span className="text-sm text-slate-400 line-through">{fmtVnd(price)}</span>
      </span>
    );
  return <span className={`font-semibold text-slate-900 ${className}`}>{fmtVnd(price)}</span>;
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "ok" | "info";
  children: ReactNode;
}) {
  const cls =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : kind === "ok"
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${cls}`}
    >
      {children}
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- product images come from BizOne storage
    <img src={src} alt={alt} className={`object-cover ${className}`} loading="lazy" />
  ) : (
    <div
      className={`flex items-center justify-center bg-slate-100 text-3xl font-bold text-slate-300 ${className}`}
    >
      {alt.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    confirmed: "bg-blue-50 text-blue-700",
    preparing: "bg-blue-50 text-blue-700",
    shipping: "bg-indigo-50 text-indigo-700",
    delivered: "bg-green-50 text-green-700",
    completed: "bg-green-50 text-green-700",
    cancelled: "bg-slate-100 text-slate-600",
    returned: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status] ?? "bg-slate-100"}`}
    >
      {label}
    </span>
  );
}

export function PageTitle({
  children,
  back,
}: {
  children: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 space-y-1">
      {back && (
        <Link href={back.href} className="text-sm text-primary hover:underline">
          ← {back.label}
        </Link>
      )}
      <h1 className="text-xl font-bold sm:text-2xl">{children}</h1>
    </div>
  );
}
