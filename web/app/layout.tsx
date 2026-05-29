import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Do I Want To Know',
  description: 'Spotify Wrapped, but for your inbox.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
