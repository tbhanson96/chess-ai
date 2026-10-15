import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["test.timbhanson.com"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
