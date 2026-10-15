import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IkoReadTube is a standalone static page in public/ikoreadtube/ (no site nav/chrome). Make the bare folder URLs serve its index.
  async rewrites() {
    return [
      { source: "/ikoreadtube", destination: "/ikoreadtube/index.html" },
      { source: "/ikoreadtube/", destination: "/ikoreadtube/index.html" },
    ];
  },
  async headers() {
    return [{ source: "/ikoreadtube/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
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
