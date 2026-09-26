import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/projects/ai-recording-artist",
        destination: "/projects/ikoartist",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
