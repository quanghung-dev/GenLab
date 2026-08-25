import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@genflow/workflow-types'],
  poweredByHeader: false,
};

export default nextConfig;
