import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for pdf-parse and mammoth which use Node.js built-ins
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
