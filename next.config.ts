import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "app/api/download/route": ["./bin/**"],
    "app/api/info/route": ["./bin/**"],
  },
};

export default nextConfig;
