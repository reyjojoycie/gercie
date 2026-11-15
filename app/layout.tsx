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

/* Couleurs de la barre du navigateur (thème clair / sombre) */
const THEME_COLOR_LIGHT = '#f8f8f5'
const THEME_COLOR_DARK = '#070a14'

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR_DARK },
  ],
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
/*  STYLES CRITIQUES (injectés avant tout rendu)                   */
/* ═══════════════════════════════════════════════════════════════ */

const CRITICAL_THEME_CSS = `
  :root {
    color-scheme: light;
  }

  html {
    background-color: ${THEME_COLOR_LIGHT};
    color: #151518;
    scroll-behavior: smooth;
    scroll-padding-top: 5rem;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    text-rendering: optimizeLegibility;
  }

  html.dark {
    color-scheme: dark;
    background-color: ${THEME_COLOR_DARK};
    color: #e8ebf2;
  }

  body {
    margin: 0;
    min-height: 100dvh;
    background-color: inherit;
    color: inherit;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background-color: rgba(212, 175, 55, 0.28);
    color: inherit;
  }

  html.dark ::selection {
    background-color: rgba(212, 175, 55, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }
  }

  html.reduced-motion *,
  html.reduced-motion *::before,
  html.reduced-motion *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
`

const FONT_BRIDGE_CSS = `
  html {
    font-family: var(--font-inter), var(--font-outfit), system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading), var(--font-outfit), system-ui, -apple-system, 'Segoe UI', sans-serif;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  .font-sans {
    font-family: var(--font-outfit), var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif !important;
  }

  .font-body {
    font-family: var(--font-inter), var(--font-outfit), system-ui, -apple-system, 'Segoe UI', sans-serif !important;
  }

  .font-heading {
    font-family: var(--font-heading), var(--font-outfit), system-ui, -apple-system, 'Segoe UI', sans-serif !important;
  }
`

const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var doc = document.documentElement;

      var keys = [
        'gercie-theme',
        'gercie-theme-choice',
        'theme',
        'gercie-admin-theme'
      ];

      var stored = null;

      for (var i = 0; i < keys.length; i += 1) {
        try {
          var value = localStorage.getItem(keys[i]);
          if (value) {
            stored = value;
            break;
          }
        } catch (error) {}
      }

      var systemDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;

      var isDark =
        stored === 'dark' ||
        (
          (stored === null || stored === '' || stored === 'system' || stored === 'auto') &&
          systemDark
        );

      doc.classList.toggle('dark', isDark);
      doc.dataset.theme = isDark ? 'dark' : 'light';
      doc.style.colorScheme = isDark ? 'dark' : 'light';

      var themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', isDark ? '${THEME_COLOR_DARK}' : '${THEME_COLOR_LIGHT}');
      }

      var appleMeta = document.querySelector(
        'meta[name="apple-mobile-web-app-status-bar-style"]'
      );

      if (appleMeta) {
        appleMeta.setAttribute(
          'content',
          isDark ? 'black-translucent' : 'default'
        );
      }

      var connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;

      if (connection) {
        var isSlow =
          connection.saveData ||
          connection.effectiveType === 'slow-2g' ||
          connection.effectiveType === '2g';

        if (isSlow) {
          doc.classList.add('low-bandwidth');
        }
      }

      if (
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        doc.classList.add('reduced-motion');
      }
    } catch (error) {}
  })();
`

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
        {/* Style critique anti-flash : fond clair/sombre posé avant l'hydratation */}
        <style
          id="critical-theme-style"
          dangerouslySetInnerHTML={{ __html: CRITICAL_THEME_CSS }}
        />

        {/* Pont typographique : applique les polices optimisées Next.js */}
        <style
          id="font-bridge-style"
          dangerouslySetInnerHTML={{ __html: FONT_BRIDGE_CSS }}
        />

        {/* Preconnect / DNS prefetch */}
        {preconnectUrls.map((url) => (
          <link key={`preconnect-${url}`} rel="preconnect" href={url} />
        ))}

        {preconnectUrls.map((url) => (
          <link key={`dns-${url}`} rel="dns-prefetch" href={url} />
        ))}

        {/*
          Initialisation du thème avant hydratation.
          Clé principale : gercie-theme
          Compatibilité ancienne : gercie-theme-choice, theme, gercie-admin-theme
        */}
        <script
          id="theme-initializer"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />

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
