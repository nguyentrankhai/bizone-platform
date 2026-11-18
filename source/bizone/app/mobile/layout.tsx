import { Suspense } from "react";
import type { Metadata } from "next";
import { MobileShell } from "@/components/mobile/MobileShell";
import { AuthNotice } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata: Metadata = {
  title: { template: "%s | BizOne", default: "BizOne" },
};

/** Store-owner PWA (P6.4) — own frame (header + bottom nav), no desktop sidebar */
export default function MobileLayout({ children }: LayoutProps<"/mobile">) {
  return (
    <MobileShell
      auth={getDevAuth()}
      banner={
        <Suspense fallback={null}>
          <AuthNotice />
        </Suspense>
      }
    >
      {children}
    </MobileShell>
  );
}
