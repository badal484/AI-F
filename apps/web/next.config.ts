import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aif/db", "@aif/shared"],
};

export default nextConfig;
