import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Força xlsx a ser carregado diretamente do node_modules no servidor (não bundleado pelo Turbopack).
  // Necessário porque xlsx usa built-ins do Node.js (zlib, Buffer) que precisam da versão nativa.
  serverExternalPackages: ["xlsx"],

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
