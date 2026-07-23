import { ImageResponse } from 'next/og'

// iOS ignores SVG apple-touch-icons (it'd fall back to an ugly page screenshot),
// so generate a real PNG home-screen icon at build time.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6c63ff, #8e7bff)',
        }}
      >
        <svg width="108" height="108" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
