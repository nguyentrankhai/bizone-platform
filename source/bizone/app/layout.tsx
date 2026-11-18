import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BizOne",
  description: "Nền tảng quản lý bán hàng All-in-One đa kênh cho SME Việt Nam",
  applicationName: "BizOne",
  // P6.4: iOS "Thêm vào MH chính" — full-screen app with its own icon (manifest: app/manifest.ts)
  appleWebApp: { capable: true, title: "BizOne", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  // content runs under the iPhone notch / home bar; layouts pad with env(safe-area-inset-*)
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
