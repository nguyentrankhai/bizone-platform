import type { MetadataRoute } from "next";

/**
 * Web App Manifest (P6.4) — served at /manifest.webmanifest, Next adds the <link> itself.
 * The installed app opens on the mobile shell for store owners; the full web app stays reachable.
 * Icons: `node scripts/pwa-icons.mjs` (public/icons).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/mobile",
    name: "BizOne — Quản lý cửa hàng",
    short_name: "BizOne",
    description: "Doanh thu, đơn hàng, báo cáo và thông báo của cửa hàng trên điện thoại",
    lang: "vi",
    dir: "ltr",
    start_url: "/mobile/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Đơn hàng",
        url: "/mobile/orders",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Báo cáo",
        url: "/mobile/reports",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Thông báo",
        url: "/mobile/notifications",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
