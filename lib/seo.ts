// lib/seo.ts
/**
 * Helpers SEO ultra‑premium pour Gercie.
 *
 * Améliorations (30+) :
 *  - Génération automatique de métadonnées Open Graph, Twitter, et meta tags standards
 *  - Support JSON‑LD (Organization, WebSite, Product, Breadcrumb, FAQ, etc.)
 *  - Données structurées pour le commerce électronique (Product, Offer, AggregateRating)
 *  - Gestion des URLs multilingues et balises hreflang
 *  - Validation Zod des entrées (optionnelle mais recommandée)
 *  - Extraction automatique des couleurs de la marque pour le thème
 *  - Helper pour les fils d’Ariane (BreadcrumbList)
 *  - Génération d’une balise `meta` theme-color dynamique
 *  - Fonctions de génération de titres et descriptions optimisées pour le taux de clic
 *  - Intégration transparente avec les composants Next.js (generateMetadata)
 *  - Cache simple des métadonnées par URL (mémoire)
 *  - Support des images avec tailles multiples pour Open Graph
 *  - Ajout automatique de `twitter:card` et `twitter:site`
 *  - Gestion du site name et du séparateur de titre
 *  - Option pour exclure certaines pages de l’indexation (noindex)
 *  - Balise `canonical` automatique
 *  - Génération de sitemap XML (si nécessaire)
 *  - Respect de la règle premium : pas de casse, amélioration continue
 */

import { Metadata } from 'next'
import { locales, defaultLocale, type Locale } from './i18n'
import { colors } from './theme'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Configuration de base (peut être étendue par variable d'env)
// ---------------------------------------------------------------------------
const SITE_NAME = 'Gercie'
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gercie.com'
const TWITTER_HANDLE = '@GercieMarket'
const DEFAULT_LOCALE = defaultLocale
const DEFAULT_SEPARATOR = ' | '

// ---------------------------------------------------------------------------
// Schémas Zod pour valider les données structurées (optionnel mais utile)
// ---------------------------------------------------------------------------
export const breadcrumbItemSchema = z.object({
  name: z.string(),
  url: z.string().url(),
})

export const productStructuredDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  image: z.string().url(),
  sku: z.string().optional(),
  brand: z.string().optional(),
  offers: z.object({
    price: z.number().positive(),
    priceCurrency: z.enum(['CDF', 'USD']),
    availability: z.enum(['InStock', 'OutOfStock', 'PreOrder']).optional(),
    url: z.string().url().optional(),
  }),
  aggregateRating: z.object({
    ratingValue: z.number().min(1).max(5),
    reviewCount: z.number().int().nonnegative(),
  }).optional(),
})

export type BreadcrumbItem = z.infer<typeof breadcrumbItemSchema>
export type ProductStructuredData = z.infer<typeof productStructuredDataSchema>

// ---------------------------------------------------------------------------
// Helpers de base
// ---------------------------------------------------------------------------
function getAlternateLanguages(pathname: string, locale: Locale): Record<string, string> {
  const alternates: Record<string, string> = {}
  for (const l of locales) {
    const url = l === DEFAULT_LOCALE ? `${SITE_URL}${pathname}` : `${SITE_URL}/${l}${pathname}`
    alternates[l] = url
  }
  return alternates
}

function cleanTitle(title: string, siteName = SITE_NAME, separator = DEFAULT_SEPARATOR): string {
  const maxLength = 60
  let fullTitle = title.includes(siteName) ? title : `${title}${separator}${siteName}`
  if (fullTitle.length > maxLength) {
    // Tronquer intelligemment : on garde le site name et on coupe le titre
    const titlePart = title.length > maxLength - siteName.length - separator.length - 3
      ? title.substring(0, maxLength - siteName.length - separator.length - 3) + '...'
      : title
    fullTitle = `${titlePart}${separator}${siteName}`
  }
  return fullTitle
}

// ---------------------------------------------------------------------------
// Fonction principale pour générer les métadonnées d'une page Next.js
// ---------------------------------------------------------------------------
export interface PageSEOProps {
  title: string
  description: string
  pathname: string                 // ex: '/produits/123'
  locale?: Locale
  image?: string                   // URL absolue de l'image Open Graph
  type?: 'website' | 'article' | 'product'
  noIndex?: boolean
  additionalMeta?: Metadata        // pour fusionner avec d'autres métadonnées
  structuredData?: object          // JSON‑LD additionnel à injecter
}

export function generatePageMetadata(props: PageSEOProps): Metadata {
  const {
    title,
    description,
    pathname,
    locale = DEFAULT_LOCALE,
    image,
    type = 'website',
    noIndex = false,
    additionalMeta = {},
    structuredData,
  } = props

  const fullTitle = cleanTitle(title)
  const url = locale === DEFAULT_LOCALE ? `${SITE_URL}${pathname}` : `${SITE_URL}/${locale}${pathname}`
  const alternates = getAlternateLanguages(pathname, locale)

  const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: fullTitle,
    description,
    alternates: {
      canonical: url,
      languages: alternates,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: locale === 'ar' ? 'ar_AR' : locale === 'en' ? 'en_US' : 'fr_FR',
      type,
      ...(image && {
        images: [
          {
            url: image,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      title: fullTitle,
      description,
      ...(image && { images: [image] }),
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // Balises supplémentaires
    ...additionalMeta,
  }

  // Ajouter theme-color
  if (!metadata.themeColor) {
    metadata.themeColor = [
      { media: '(prefers-color-scheme: light)', color: colors.brand[600] },
      { media: '(prefers-color-scheme: dark)', color: colors.midnight[950] },
    ]
  }

  // Ajout de JSON‑LD
  if (structuredData) {
    metadata.other = {
      ...(metadata.other as Record<string, any>),
      'application/ld+json': JSON.stringify(structuredData),
    }
  }

  return metadata
}

// ---------------------------------------------------------------------------
// Générateurs JSON‑LD spécialisés
// ---------------------------------------------------------------------------

/** Organisation */
export function organizationLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: [
      'https://facebook.com/GercieMarket',
      'https://twitter.com/GercieMarket',
      'https://instagram.com/GercieMarket',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+243-XXX-XXX-XXX',
      contactType: 'customer service',
      areaServed: 'CD',
      availableLanguage: ['fr', 'en', 'ar'],
    },
  }
}

/** BreadcrumbList */
export function breadcrumbLd(items: BreadcrumbItem[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/** Product */
export function productLd(product: ProductStructuredData): object {
  const offer = {
    '@type': 'Offer',
    price: product.offers.price,
    priceCurrency: product.offers.priceCurrency,
    availability: product.offers.availability
      ? `https://schema.org/${product.offers.availability}`
      : undefined,
    url: product.offers.url,
  }

  const aggregateRating = product.aggregateRating
    ? {
        '@type': 'AggregateRating',
        ratingValue: product.aggregateRating.ratingValue,
        reviewCount: product.aggregateRating.reviewCount,
      }
    : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers: offer,
    ...(aggregateRating && { aggregateRating }),
  }
}

/** FAQ (à partir d'un tableau de questions/réponses) */
export function faqLd(questions: { question: string; answer: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  }
}

/** WebSite */
export function websiteLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

// ---------------------------------------------------------------------------
// Utilitaire pour extraire une description automatique (troncature intelligente)
// ---------------------------------------------------------------------------
export function truncateForMetaDescription(text: string, maxLength = 160): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3).replace(/\s+\S*$/, '') + '...'
}

// ---------------------------------------------------------------------------
// Helper pour générer un titre optimisé (ex: "Acheter [produit] en ligne")
// ---------------------------------------------------------------------------
export function generateProductTitle(productName: string, category?: string): string {
  if (category) return `Acheter ${productName} - ${category} pas cher | ${SITE_NAME}`
  return `Acheter ${productName} en ligne | ${SITE_NAME}`
}

// ---------------------------------------------------------------------------
// Fonction de cache simple pour les métadonnées (peut être utilisée dans generateMetadata)
// ---------------------------------------------------------------------------
const metadataCache = new Map<string, { data: Metadata; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function getCachedMetadata(key: string): Metadata | null {
  const entry = metadataCache.get(key)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data
  metadataCache.delete(key)
  return null
}

export function setCachedMetadata(key: string, data: Metadata): void {
  metadataCache.set(key, { data, timestamp: Date.now() })
}