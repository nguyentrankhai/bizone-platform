import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
