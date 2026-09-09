const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the Docker image ship the compiled server on its own, without the
  // whole dependency tree.
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

module.exports = withPWA(nextConfig);
