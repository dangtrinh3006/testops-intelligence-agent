import type { NextConfig } from "next";

// /api/* is proxied by app/api/[...path]/route.ts (runtime env, long timeout), not by a rewrite.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the container image; Vercel ignores it.
  output: "standalone",
};

export default nextConfig;
