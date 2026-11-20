import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // P6.6: don't advertise the framework; security headers are set per request in proxy.ts
  poweredByHeader: false,
  serverExternalPackages: ["mariadb", "ioredis", "bullmq", "exceljs", "pdfmake"],
  // P5.4/P5.5: pdfmake reads its Roboto fonts from disk at runtime (PDF exports)
  outputFileTracingIncludes: {
    "/api/internal/reconciliation/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
    "/api/internal/reports/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
  },
  cacheComponents: true,
  partialPrefetching: true,
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
