//app/layout.tsx
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { Inter, Outfit } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import Providers from './Providers'
import Navbar from '@/components/navbar/Navbar'
import Footer from '@/components/layout/Footer'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Optimisation des polices avec next/font
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  preload: true,
})

// URLs pour preconnect (optimisation performance)
const PRECONNECT_URLS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
].filter(Boolean)

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'Gercie Market Place',
    template: '%s | Gercie',
  },
  description: 'Gercie Market Place',
  keywords: ['Gercie', 'Market Place', 'e-commerce'],
  authors: [{ name: 'Gercie', url: 'https://gercie.com' }],
  creator: 'Gercie',
  publisher: 'Gercie',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://gercie.com',
    siteName: 'Gercie Market Place',
    title: 'Gercie Market Place',
    description: 'Gercie Market Place',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Gercie Market Place',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gercie Market Place',
    description: 'Gercie Market Place',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: '/',
    languages: {
      'fr-CD': '/',
      'en-US': '/en',
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || '',
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Gercie',
    'mobile-web-app-capable': 'yes',
    'application-name': 'Gercie Market Place',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#040715' },
  ],
  colorScheme: 'light dark',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Utilisation de next-intl pour la locale
  const messages = await getMessages()
  
  // Mode production pour scripts analytics
  const isProduction = process.env.NODE_ENV === 'production'
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX'

  return (
    <html
      lang="fr"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${outfit.variable} ${inter.variable}`}
    >
      <head>
        {/* Preconnect pour optimiser les connexions aux domaines tiers */}
        {PRECONNECT_URLS.map((url) => (
          <link key={url} rel="preconnect" href={url} crossOrigin="anonymous" />
        ))}
        
        {/* DNS prefetch pour résolution rapide */}
        {PRECONNECT_URLS.map((url) => (
          <link key={`dns-${url}`} rel="dns-prefetch" href={url} />
        ))}

        {/* Theme initializer - script critique avant hydratation */}
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var isDark = theme === 'dark' || (!theme && systemDark);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  }
                  // Détection connexion lente
                  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                  if (conn) {
                    var isSlow = conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
                    if (isSlow) {
                      document.documentElement.classList.add('low-bandwidth');
                    }
                  }
                } catch(e) {}
              })();
            `,
          }}
        />

        {/* Métadonnées pour applications mobiles */}
        <meta name="msapplication-TileColor" content="#0f1b5c" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#040715" media="(prefers-color-scheme: dark)" />

        {/* Google Analytics - uniquement en production */}
        {isProduction && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaMeasurementId}', {
                    page_path: window.location.pathname,
                    anonymize_ip: true,
                    cookie_flags: 'SameSite=None;Secure'
                  });
                `,
              }}
            />
          </>
        )}
      </head>
      <body
        className="relative antialiased bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-body"
      >
        {/* Skip link pour accessibilité */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-md focus:shadow-lg"
        >
          Aller au contenu principal
        </a>

        <NextIntlClientProvider messages={messages}>
          <Providers>
            <ErrorBoundary>
              <Navbar />
              <Suspense fallback={<LoadingScreen />}>
                <main 
                  id="main-content"
                  className="relative w-full min-h-[calc(100dvh-4rem)] flex flex-col isolation-isolate"
                  tabIndex={-1}
                >
                  {children}
                </main>
              </Suspense>
              <Footer />
            </ErrorBoundary>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}