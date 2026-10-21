import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev` write a generated AGENTS.md into the repo (specs/CNOTE-22.md)
  agentRules: false,
};

export default nextConfig;
