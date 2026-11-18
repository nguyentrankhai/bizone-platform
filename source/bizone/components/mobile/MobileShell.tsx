"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Monitor, WifiOff } from "lucide-react";
import { ToastProvider } from "@/components/ui/Toast";
import { BranchSwitcher } from "@/components/branch/BranchSwitcher";
import type { ApiAuth } from "@/components/inventory/shared";
import { useOnline } from "@/hooks/useOnline";
import { registerServiceWorker } from "@/lib/pwa/register";
import { BottomNav } from "./BottomNav";

interface Props {
  auth: ApiAuth;
  /** Strip under the header (dev sign-in notice from the server layout) */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Frame of the store-owner PWA (P6.4): compact header with the branch switcher, offline strip,
 * content column, bottom navigation. Registers the service worker (offline cache + push).
 */
export function MobileShell({ auth, banner, children }: Props) {
  const online = useOnline();

  useEffect(() => {
    registerServiceWorker().catch(() => {
      /* no SW (old browser / blocked): the app still works online */
    });
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
            <Link
              href="/mobile/dashboard"
              className="text-xl font-black tracking-tight text-primary"
              aria-label="BizOne — Tổng quan"
            >
              Biz<span className="text-slate-800">One</span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <BranchSwitcher auth={auth} />
              <Link
                href="/dashboard"
                title="Mở bản đầy đủ"
                aria-label="Mở bản đầy đủ"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <Monitor className="h-5 w-5" />
              </Link>
            </div>
          </div>
          {!online && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800"
            >
              <WifiOff className="h-3.5 w-3.5" /> Đang ngoại tuyến — hiển thị dữ liệu đã lưu
            </div>
          )}
        </header>
        {banner}
        <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomNav auth={auth} />
      </div>
    </ToastProvider>
  );
}
