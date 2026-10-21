import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev` write a generated AGENTS.md into the repo (specs/CNOTE-22.md)
  agentRules: false,
  // The service worker and its route rules (CNOTE-20): always revalidated so an update is picked up,
  // served as JavaScript, and allowed to load nothing but same-origin code
  async headers() {
    return ['/sw.js', '/sw-routes.js'].map((source) => ({
      source,
      headers: [
        { key: 'Cache-Control', value: 'no-cache, max-age=0' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Content-Security-Policy', value: "default-src 'self'" },
      ],
    }));
  },
};

export default nextConfig;
