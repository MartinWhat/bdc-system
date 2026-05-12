import type { Metadata, Viewport } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import ThemeProvider from './theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: '不动产证书管理系统',
  description: '宅基地信息综合管理平台',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AntdRegistry>
          <ThemeProvider>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
