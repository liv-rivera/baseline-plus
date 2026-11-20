import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth callback URLs contain single-use credentials.
  logging: { incomingRequests: false },
  reactCompiler: true,
};

export default nextConfig;
