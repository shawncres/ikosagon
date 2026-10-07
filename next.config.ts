import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/projects/ai-recording-artist",
        destination: "/projects/ikoartist",
        permanent: true,
      },
      // IkoLine → IkoAgent (call-flow demo)
      {
        source: "/projects/ikoline",
        destination: "/projects/ikoagent",
        permanent: true,
      },
      {
        source: "/projects/ikoline/:path*",
        destination: "/projects/ikoagent/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
