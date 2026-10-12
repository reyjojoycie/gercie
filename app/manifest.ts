// app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gercie.com'

  return {
    name: 'Gercie Market Place',
    short_name: 'Gercie',
    description: 'Gercie Market Place',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#d4af37',
    id: 'com.gercie.marketplace',
    dir: 'ltr',
    lang: 'fr',
    categories: ['shopping', 'lifestyle', 'business'],
    prefer_related_applications: false,
    
    // Icônes
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    
    // Screenshots
    screenshots: [
      {
        src: '/screenshots/home-mobile.png',
        sizes: '1080x2340',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Gercie',
      },
      {
        src: '/screenshots/home-desktop.png',
        sizes: '1440x900',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Gercie',
      },
    ],
    
    // Shortcuts
    shortcuts: [],
  }
}