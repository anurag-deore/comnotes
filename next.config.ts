import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'fonts.googleapis.com' }],
  },
};

export default nextConfig;
