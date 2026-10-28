/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Development and production builds must never write to the same directory.
  // Sharing `.next` lets `next build` replace chunks used by a running
  // `next dev` process, causing transient "Cannot find module ./<chunk>.js" errors.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['pdf-parse', 'mammoth', '@xmldom/xmldom'],
  outputFileTracingIncludes: {
    '/api/datasets/*/documents': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
    '/api/datasets/*/sources': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
    '/api/knowledge/upload': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
    '/api/upload': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
    '/api/crawl': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
    '/api/crawl/client': ['./src/lib/knowledge/document-parser.cjs', './node_modules/pdf-parse/**/*', './node_modules/@xmldom/xmldom/**/*'],
  },
  // Allow pdf-parse to work in API routes & optimize large barrel dependencies
  experimental: {
    // Bound compiler retention on large route graphs. Turbopack is used for
    // local development; these settings also keep fallback Webpack/build
    // workers from growing until macOS pushes gigabytes into swap.
    webpackMemoryOptimizations: true,
    memoryBasedWorkersCount: true,
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 10,
    serverComponentsHmrCache: false,
    optimizePackageImports: [
      'lucide-react',
      'react-icons',
      'recharts',
      'date-fns',
      '@radix-ui/react-icons',
    ],
  },
  async headers() {
    const common = [
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ]
    const noFrame = [
      ...common,
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ]
    return [
      { source: '/:path*', headers: common },
      { source: '/api/:path*', headers: noFrame },
      { source: '/admin/:path*', headers: noFrame },
      { source: '/master-admin/:path*', headers: noFrame },
      { source: '/overview/:path*', headers: noFrame },
      { source: '/settings/:path*', headers: noFrame },
      ...['auth','bots','features','campaigns','contacts','inbox','knowledge','databases','tickets','analytics','templates','webhooks','api-keys','notepad','waitlist','suspended'].map(route => ({ source: `/${route}/:path*`, headers: noFrame })),
      {
        source: '/widget.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        source: '/widget',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'production' ? 'frame-ancestors https:' : "frame-ancestors 'self' http: https:",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
