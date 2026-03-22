import type { NextConfig } from 'next'

const corsHeaders = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Expose-Headers', value: 'WWW-Authenticate' },
]

const nextConfig: NextConfig = {
  transpilePackages: ['@scemas/db', '@scemas/types'],
  devIndicators: false,
  headers: async () => [
    { source: '/.well-known/:path*', headers: corsHeaders },
    { source: '/oauth/:path*', headers: corsHeaders },
    { source: '/mcp', headers: corsHeaders },
  ],
}

export default nextConfig
