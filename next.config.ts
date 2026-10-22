import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Live demo only: `npm run demo` passes this laptop's own Wi-Fi addresses so
  // phones on the same network can load the development server's page scripts
  // (Next.js blocks other origins in development by default). Unset otherwise.
  allowedDevOrigins:
    process.env.CONTRACTOR_DESK_FIXTURES === "1" && process.env.CONTRACTOR_DESK_DEV_ORIGINS
      ? process.env.CONTRACTOR_DESK_DEV_ORIGINS.split(",").filter((h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h))
      : undefined,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(process.env.NODE_ENV !== "production"),
      },
    ];
  },
};

export default nextConfig;
