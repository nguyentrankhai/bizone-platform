"use client";

import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { installSnoozed } from "@/lib/pwa/install";
import { useToast } from "@/components/ui/Toast";

const SNOOZE_KEY = "bizone:pwa:install-snoozed";

function readSnooze(): number | null {
  try {
    const v = Number(localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * "Cài BizOne lên điện thoại" card (P6.4). Chromium: button → the browser's install dialog.
 * iOS: Share → "Thêm vào MH chính" steps (required for push on iPhone). Hidden once installed.
 * `dismissible` cards can be snoozed for 7 days (dashboard); the notifications page always shows it.
 */
export function InstallPrompt({ dismissible = false }: { dismissible?: boolean }) {
  const { mode, install } = useInstallPrompt();
  const toast = useToast();
  const [snoozedAt, setSnoozedAt] = useState<number | null | undefined>(undefined);
  const snooze =
    snoozedAt === undefined ? (typeof window === "undefined" ? null : readSnooze()) : snoozedAt;

  if (mode === "installed" || mode === "unavailable") return null;
  if (dismissible && installSnoozed(snooze)) return null;

  function dismiss() {
    const now = Date.now();
    try {
      localStorage.setItem(SNOOZE_KEY, String(now));
    } catch {
      /* ignore */
    }
    setSnoozedAt(now);
  }

  return (
    <section
      aria-label="Cài đặt ứng dụng"
      className="relative mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4"
    >
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Để sau"
          className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-lg text-blue-400 hover:text-blue-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-3 pr-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static 192px app icon */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">Cài BizOne lên màn hình chính</h2>
          {mode === "prompt" ? (
            <p className="mt-0.5 text-sm text-slate-600">
              Mở nhanh như ứng dụng, xem số liệu khi mất mạng và nhận thông báo đẩy.
            </p>
          ) : (
            <ol className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-center gap-1.5">
                1. Bấm <Share className="h-4 w-4 text-primary" aria-label="Chia sẻ" /> ở thanh
                Safari
              </li>
              <li className="flex items-center gap-1.5">
                2. Chọn <SquarePlus className="h-4 w-4 text-primary" aria-hidden />
                <strong>Thêm vào MH chính</strong>
              </li>
              <li>3. Mở BizOne từ màn hình chính để bật thông báo đẩy.</li>
            </ol>
          )}
        </div>
      </div>
      {mode === "prompt" && (
        <button
          type="button"
          onClick={async () => {
            const outcome = await install();
            if (outcome === "accepted") toast.success("Đã cài BizOne lên thiết bị");
          }}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" /> Cài đặt ứng dụng
        </button>
      )}
    </section>
  );
}
