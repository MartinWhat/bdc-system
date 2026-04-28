import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 应用安全头到所有路由
        source: '/:path*',
        headers: [
          // Content-Security-Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js 需要 unsafe-eval，Ant Design 需要 unsafe-inline
              "style-src 'self' 'unsafe-inline'", // Ant Design 需要
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'", // 防止 iframe 嵌入
              "form-action 'self'",
            ].join('; '),
          },
          // 防止 MIME 类型嗅探
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // 防止点击劫持
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // XSS 保护
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // 严格传输安全（生产环境）
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ]
  },
}

export default nextConfig
