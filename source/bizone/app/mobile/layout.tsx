import type { Metadata } from "next";
import { MobileShell } from "@/components/mobile/MobileShell";

export const metadata: Metadata = {
  title: { template: "%s | BizOne", default: "BizOne" },
};

/** Store-owner PWA (P6.4) — own frame (header + bottom nav), no desktop sidebar */
export default function MobileLayout({ children }: LayoutProps<"/mobile">) {
  return <MobileShell>{children}</MobileShell>;
}
