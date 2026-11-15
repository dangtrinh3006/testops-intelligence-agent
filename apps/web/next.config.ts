import type { NextConfig } from "next";

// /api/* is proxied by app/api/[...path]/route.ts (runtime env, long timeout), not by a rewrite.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
