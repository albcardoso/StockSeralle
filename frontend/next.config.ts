import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend API URL
  env: {
    API_URL: process.env.API_URL ?? "http://localhost:5000",
  },
  // Allow images from external domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "http2.mlstatic.com",
      },
    ],
  },
};

export default nextConfig;
