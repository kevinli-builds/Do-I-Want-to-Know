import type { Metadata, Viewport } from 'next'
import './globals.css'
import { RegisterSW } from './components/RegisterSW'

export const metadata: Metadata = {
  title: 'Do I Want To Know',
  description: 'Spotify Wrapped, but for your inbox.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'DIWTK' },
}

export const viewport: Viewport = {
  themeColor: '#6c63ff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
