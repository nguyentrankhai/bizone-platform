import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mariadb", "ioredis", "bullmq", "exceljs", "pdfmake"],
  // P5.4: pdfmake reads its Roboto fonts from disk at runtime (reconciliation PDF export)
  outputFileTracingIncludes: {
    "/api/internal/reconciliation/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
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
