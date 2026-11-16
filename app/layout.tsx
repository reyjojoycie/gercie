// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { getLocale, getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { Inter, Outfit, Plus_Jakarta_Sans } from 'next/font/google'

import './globals.css'
import Providers from './Providers'
import AppShell from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

/* ═══════════════════════════════════════════════════════════════ */
/*  POLICES                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  preload: true,
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
  preload: true,
})

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFIG                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const OG_IMAGE = '/og-image.jpg'
const SITE_NAME = 'Gercie Market Place'

const SITE_DESCRIPTION =
  'Marketplace premium en RDC : produits, commandes, livraison, paiement Mobile Money, carte bancaire, virement et paiement à la livraison. Prix affichés en USD avec conversion CDF.'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || ''
const isProduction = process.env.NODE_ENV === 'production'

const shouldLoadGoogleAnalytics =
  isProduction &&
  Boolean(GA_MEASUREMENT_ID) &&
  GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX'

const rawPreconnectUrls = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
]

const preconnectUrls = Array.from(
  new Set(
    rawPreconnectUrls.filter(
      (url): url is string => Boolean(url) && /^https?:\/\//.test(url)
    )
  )
)

/* ═══════════════════════════════════════════════════════════════ */
/*  MÉTADONNÉES                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: SITE_NAME,
    template: '%s | Gercie',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Gercie',
    'Gercie Market Place',
    'marketplace RDC',
    'e-commerce République Démocratique du Congo',
    'achat en ligne Kinshasa',
    'livraison RDC',
    'paiement Mobile Money',
    'Orange Money',
    'Airtel Money',
    'M-Pesa',
    'carte bancaire',
    'virement bancaire',
    'paiement à la livraison',
    'USD',
    'CDF',
    'taux de change USD CDF',
  ],
  authors: [
    {
      name: 'Gercie',
      url: APP_URL,
    },
  ],
  creator: 'Gercie',
  publisher: 'Gercie',
  category: 'shopping',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'fr_CD',
    url: APP_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
    creator: '@Gercie',
    site: '@Gercie',
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
  verification: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
    ? {
        google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
      }
    : undefined,
  manifest: '/site.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Gercie',
    'mobile-web-app-capable': 'yes',
    'application-name': SITE_NAME,
    referrer: 'strict-origin-when-cross-origin',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VIEWPORT                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  colorScheme: 'light dark',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STRUCTURED DATA                                                */
/* ═══════════════════════════════════════════════════════════════ */

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Gercie',
      url: APP_URL,
      logo: `${APP_URL}/apple-touch-icon.png`,
      description: SITE_DESCRIPTION,
      foundingDate: '2024',
      areaServed: {
        '@type': 'Country',
        name: 'Democratic Republic of the Congo',
      },
    },
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: APP_URL,
      inLanguage: 'fr-CD',
      description: SITE_DESCRIPTION,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${APP_URL}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LAYOUT RACINE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [messages, locale] = await Promise.all([
    getMessages(),
    getLocale(),
  ])

  return (
    <html
      lang={locale || 'fr'}
      dir="ltr"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${outfit.variable} ${inter.variable} ${jakarta.variable}`}
    >
      <head>
        {/* Preconnect / DNS prefetch */}
        {preconnectUrls.map((url) => (
          <link key={`preconnect-${url}`} rel="preconnect" href={url} />
        ))}

        {preconnectUrls.map((url) => (
          <link key={`dns-${url}`} rel="dns-prefetch" href={url} />
        ))}

        {/* Métadonnées Windows / mobile */}
        <meta name="msapplication-TileColor" content="#0f1b5c" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />

        {/* Google Analytics uniquement en production */}
        {shouldLoadGoogleAnalytics && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
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
                  gtag('config', '${GA_MEASUREMENT_ID}', {
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

      <body className="relative min-h-[100dvh] overflow-x-hidden bg-canvas text-fg antialiased">
        {/* Lueurs d'ambiance décoratives (derrière le contenu) */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-40 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
          <div className="absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
        </div>

        {/* Lien d'évitement (accessibilité) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-accent-contrast focus:shadow-raised focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-canvas"
        >
          Aller au contenu principal
        </a>

        <NextIntlClientProvider messages={messages}>
          <Providers>
            <ErrorBoundary>
              <div className="isolate flex min-h-[100dvh] flex-col">
                <AppShell>{children}</AppShell>
              </div>
            </ErrorBoundary>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
