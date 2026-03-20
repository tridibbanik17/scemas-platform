import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@scemas/db', '@scemas/types'],
  devIndicators: false,
}

export default nextConfig
