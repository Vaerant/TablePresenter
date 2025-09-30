/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
        crypto: false,
      };
    }
    config.externals = config.externals || [];
    config.externals.push('better-sqlite3');
    return config;
  },
  // Enable network access in development
  ...(process.env.NODE_ENV === 'development' && {
    async rewrites() {
      return [];
    },
  }),
}

module.exports = nextConfig
