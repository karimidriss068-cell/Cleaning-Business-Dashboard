import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json exists in the parent home directory, which makes
  // Next infer the wrong workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
  // The lead form is meant to sit inside other websites. INTAKE_EMBED_ORIGINS (space-separated
  // origins) limits who may frame it; unset means any site.
  async headers() {
    const ancestors = process.env.INTAKE_EMBED_ORIGINS?.trim() || "*";
    return [
      { source: "/lead-form", headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${ancestors}` }] },
    ];
  },
};

export default nextConfig;
