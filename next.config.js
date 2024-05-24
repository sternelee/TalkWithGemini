/** @type {import('next').NextConfig} */
// import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

const mode = process.env.NEXT_PUBLIC_BUILD_MODE ?? 'standalone'

// if (process.env.NODE_ENV === 'development') {
//   await setupDevPlatform();
// }

const nextConfig = {
  transpilePackages: ['crypto-js'],
  images: {
    unoptimized: mode === 'export',
  },
}
if (mode === 'export') {
  nextConfig.output = 'export'
  // Only used for static deployment, the default deployment directory is the root directory
  nextConfig.basePath = ''
} else if (mode === 'standalone') {
  nextConfig.output = 'standalone'
}

if (mode !== 'export') {
  nextConfig.rewrites = async () => {
    return {
      beforeFiles: [
        {
          source: '/api/google/:path*',
          destination: `https://generativelanguage.googleapis.com/:path*`,
        },
      ],
    }
  }
}

module.exports = nextConfig
