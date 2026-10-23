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
  // "Raise a request" lives at /builder only in the local data mode (lib/fixtures.ts
  // has the same check). Everywhere else, including Vercel, /builder sends people
  // to the request form, keeping the home page search's trade, area and date.
  async redirects() {
    const local =
      process.env.CONTRACTOR_DESK_FIXTURES === "1" &&
      process.env.NODE_ENV === "development" &&
      !process.env.VERCEL &&
      process.env.REGISTRATION_RECORD_TYPE !== "REAL";
    return local ? [] : [{ source: "/builder", destination: "/request", permanent: false }];
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
