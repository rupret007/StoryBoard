import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.join(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  transpilePackages: ["@storyboard/shared", "@storyboard/ui"]
};

export default nextConfig;
