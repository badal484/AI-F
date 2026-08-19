import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aif/db", "@aif/shared", "@aif/ai", "@aif/booking", "@aif/queue", "@aif/whatsapp"],
};

export default nextConfig;
