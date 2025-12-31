/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during production builds to avoid blocking deploys in Workers.
  eslint: {
    ignoreDuringBuilds: true,
  },
  swcMinify: true,
};

export default nextConfig;
