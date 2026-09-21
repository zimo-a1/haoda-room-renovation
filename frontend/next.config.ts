import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const demo = process.env.DEMO_EXPORT === "1";
const nextConfig: NextConfig = {
  output: demo ? "export" : "standalone",
  ...(demo ? { images: { unoptimized: true } } : {}),
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async rewrites() {
    return demo ? [] : [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }];
  },
};
export default nextConfig;
