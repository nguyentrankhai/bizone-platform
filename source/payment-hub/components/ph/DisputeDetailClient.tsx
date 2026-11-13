"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DisputeDetail, DisputeSubmitOptions } from "@/lib/dispute";
import { DisputeCard } from "./DisputeHistory";

/** One dispute on its own page (/disputes/{id} — linked from the list and the result e-mail). */
export function DisputeDetailClient({
  dispute,
  submitOptions,
  authToken,
  canWrite,
}: {
  dispute: DisputeDetail;
  submitOptions: DisputeSubmitOptions;
  authToken: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-4">
      {notice && (
        <div
          role="status"
          className={
            notice.ok
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
        >
          {notice.text}
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <DisputeCard
          dispute={dispute}
          submitOptions={submitOptions}
          authToken={authToken}
          canWrite={canWrite}
          defaultOpen
          showTxnLink
          onChanged={(n) => {
            if (n) setNotice(n);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
