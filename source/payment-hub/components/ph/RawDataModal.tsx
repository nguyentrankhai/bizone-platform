"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RawDataViewer } from "./RawDataViewer";
import {
  ACTION_LABELS,
  auditApi,
  fmtTime,
  type AuditKind,
  type SystemLogDetail,
  type TransactionLogDetail,
} from "./audit-api";

interface RawDataModalProps {
  kind: AuditKind;
  id: string;
  onClose: () => void;
}

/** Top-level keys whose value differs between old and new data (system audit). */
function changedKeys(oldData: unknown, newData: unknown): string[] {
  const after = (newData as { result?: unknown } | null)?.result ?? newData;
  if (!oldData || typeof oldData !== "object" || !after || typeof after !== "object") return [];
  // Decimal columns come back as strings ("0") on one side and numbers on the other
  const norm = (v: unknown) =>
    typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))
      ? String(Number(v))
      : JSON.stringify(v);
  const a = oldData as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  return Object.keys(a).filter(
    (k) =>
      k in b &&
      norm(a[k]) !== norm(typeof b[k] === "number" ? String(b[k]) : b[k]) &&
      k !== "updatedAt",
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-700">{children ?? "—"}</dd>
    </>
  );
}

function SystemDetail({ d }: { d: SystemLogDetail }) {
  const changed = changedKeys(d.oldData, d.newData);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Row label="Thời gian">{fmtTime(d.createdAt)}</Row>
        <Row label="Hành động">
          {ACTION_LABELS[d.action] ?? d.action}{" "}
          <code className="text-xs text-gray-400">{d.action}</code>
        </Row>
        <Row label="Kết quả">{d.result}</Row>
        <Row label="Người thực hiện">
          {d.username ?? "—"}
          {d.actorId && <span className="block text-xs text-gray-400">{d.actorId}</span>}
        </Row>
        <Row label="IP">{d.ipAddress}</Row>
        <Row label="Trình duyệt">{d.userAgent}</Row>
        <Row label="Yêu cầu">{d.httpMethod ? `${d.httpMethod} ${d.requestPath ?? ""}` : null}</Row>
        <Row label="Đối tượng">
          {d.entityType} {d.entityId ? `#${d.entityId}` : ""}
        </Row>
        <Row label="Mô tả">{d.description}</Row>
        {changed.length > 0 && <Row label="Trường thay đổi">{changed.join(", ")}</Row>}
      </dl>
      <div className="grid gap-3 lg:grid-cols-2">
        <RawDataViewer title="Dữ liệu cũ" data={d.oldData ?? null} defaultOpen />
        <RawDataViewer title="Dữ liệu mới / kết quả" data={d.newData ?? null} defaultOpen />
      </div>
      <p className="text-xs text-gray-400">
        Thông tin bí mật (secret, API key, mật khẩu, chữ ký) luôn được che khi ghi nhật ký.
      </p>
    </div>
  );
}

function TransactionDetail({ d }: { d: TransactionLogDetail }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Row label="Thời gian">{fmtTime(d.createdAt)}</Row>
        <Row label="Giao dịch">
          <Link
            href={`/transactions/${d.transactionId}`}
            className="font-medium text-blue-600 hover:underline"
          >
            {d.txnCode}
          </Link>{" "}
          · merchant #{d.merchantId}
        </Row>
        <Row label="Sự kiện">{d.event}</Row>
        <Row label="Trạng thái">
          {d.fromStatus || d.toStatus ? `${d.fromStatus ?? "—"} → ${d.toStatus ?? "—"}` : null}
        </Row>
        <Row label="Thực hiện bởi">{d.createdBy}</Row>
        <Row label="Mô tả">{d.description}</Row>
      </dl>
      {d.rawData !== null && d.rawData !== undefined && (
        <RawDataViewer title="Dữ liệu của sự kiện" data={d.rawData} defaultOpen />
      )}
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Request / response API của giao dịch ({d.exchanges.length})
        </p>
        <div className="space-y-2">
          {d.exchanges.map((x) => (
            <RawDataViewer
              key={x.id}
              title={`${fmtTime(x.createdAt)} · ${x.source} ${x.direction}${x.endpoint ? ` · ${x.endpoint}` : ""}${x.httpStatus ? ` · HTTP ${x.httpStatus}` : ""}`}
              data={{ headers: x.headers ?? undefined, body: x.body }}
            />
          ))}
          {d.exchanges.length === 0 && (
            <p className="text-xs text-gray-400">Không có dữ liệu thô.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Raw data of one audit entry (system: old / new data; transaction: event + API traffic). */
export function RawDataModal({ kind, id, onClose }: RawDataModalProps) {
  const [detail, setDetail] = useState<SystemLogDetail | TransactionLogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    auditApi.get<SystemLogDetail | TransactionLogDetail>(kind, id).then(
      (d) => live && setDetail(d),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Lỗi tải"),
    );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [kind, id, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết nhật ký"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-4xl sm:rounded-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="font-semibold text-gray-800">
            {kind === "system" ? "Nhật ký hệ thống" : "Nhật ký giao dịch"} #{id}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : !detail ? (
            <p className="text-sm text-gray-400">Đang tải…</p>
          ) : kind === "system" ? (
            <SystemDetail d={detail as SystemLogDetail} />
          ) : (
            <TransactionDetail d={detail as TransactionLogDetail} />
          )}
        </div>
      </div>
    </div>
  );
}
