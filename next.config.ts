import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json exists in the parent home directory, which makes
  // Next infer the wrong workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
