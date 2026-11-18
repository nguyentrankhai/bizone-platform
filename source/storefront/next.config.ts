import type { NextConfig } from "next";

/**
 * BizOne storefront (P6.1) — `[store].bizone.vn`. Every page reads the cart / session cookies
 * and live stock from BizOne, so pages render per request (no `cacheComponents`).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
