import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IkoReadTube is a standalone static page in public/ikoreadtube/ (no site nav/chrome). Make the bare folder URLs serve its index.
  async rewrites() {
    return [
      { source: "/ikoreadtube", destination: "/ikoreadtube/index.html" },
      { source: "/ikoreadtube/", destination: "/ikoreadtube/index.html" },
      { source: "/ikoreadtube/privacy", destination: "/ikoreadtube/privacy.html" },
      // IkoLearn: standalone static app in public/ikolearn/ (unlisted, single-user testing).
      { source: "/ikolearn", destination: "/ikolearn/index.html" },
      { source: "/ikolearn/", destination: "/ikolearn/index.html" },
      { source: "/ikolearn/privacy", destination: "/ikolearn/privacy.html" },
      { source: "/ikolearn/family", destination: "/ikolearn/family.html" },
      { source: "/ikolearn/learners", destination: "/ikolearn/learners.html" },
    ];
  },
  async headers() {
    return [
      { source: "/ikoreadtube/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/ikolearn", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/ikolearn/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
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
      // Ikosagon Learn (early homeschool concept) → IkoLearn, which supersedes it
      {
        source: "/projects/ikosagon-learn",
        destination: "/projects/ikolearn",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
