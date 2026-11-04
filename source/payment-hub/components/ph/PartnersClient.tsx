"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PARTNER_STATUS_LABEL, type PartnerView } from "@/lib/partner-types";
import { PartnerCard } from "./PartnerCard";

interface PartnersClientProps {
  initial: PartnerView[];
  authToken: string;
  canWrite: boolean;
}

const selectCls =
  "h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";

export function PartnersClient({ initial, authToken, canWrite }: PartnersClientProps) {
  const [partners, setPartners] = useState(initial);
  const [status, setStatus] = useState("");
  const [env, setEnv] = useState("");

  const visible = useMemo(
    () =>
      partners.filter((p) => (!status || p.status === status) && (!env || p.environment === env)),
    [partners, status, env],
  );

  const counts = useMemo(
    () => ({
      Active: partners.filter((p) => p.status === "Active").length,
      Error: partners.filter((p) => p.status === "Error").length,
    }),
    [partners],
  );

  function replace(updated: PartnerView) {
    setPartners((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Đối tác thanh toán</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {partners.length} cấu hình · {counts.Active} hoạt động
            {counts.Error > 0 && (
              <span className="text-red-600"> · {counts.Error} lỗi kết nối</span>
            )}
          </p>
        </div>
        {canWrite && (
          <Link
            href="/partners/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Thêm đối tác
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Lọc trạng thái"
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(PARTNER_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc môi trường"
          className={selectCls}
          value={env}
          onChange={(e) => setEnv(e.target.value)}
        >
          <option value="">Tất cả môi trường</option>
          <option value="Sandbox">Sandbox</option>
          <option value="Production">Production</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          {partners.length === 0
            ? "Chưa có đối tác nào. Thêm đối tác đầu tiên để bắt đầu nhận thanh toán."
            : "Không có đối tác khớp bộ lọc."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <PartnerCard
              key={p.id}
              partner={p}
              authToken={authToken}
              canWrite={canWrite}
              onChange={replace}
            />
          ))}
        </div>
      )}
    </div>
  );
}
