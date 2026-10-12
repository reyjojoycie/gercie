// app/sitemap.ts
import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabaseServer'
import { locales, defaultLocale } from '@/lib/i18n'
import logger from '@/lib/logger'

/**
 * Génération du sitemap dynamique pour Gercie.
 */

// --------------------------------------------------------------------------
// Configuration de base
// --------------------------------------------------------------------------
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gercie.com'

// Priorités par type de page
const PRIORITIES = {
  home: 1,
  category: 0.8,
  product: 0.9,
  static: 0.5,
  seller: 0.7,
  legal: 0.3,
}

// Fréquences de crawl
const FREQUENCIES: Record<string, MetadataRoute.Sitemap[number]['changeFrequency']> = {
  home: 'daily',
  category: 'daily',
  product: 'weekly',
  static: 'monthly',
  seller: 'weekly',
  legal: 'yearly',
}

// --------------------------------------------------------------------------
// Fonction principale
// --------------------------------------------------------------------------
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = []

  // --- Pages statiques multilingues ---
  const staticPaths = [
    '',
    '/categories',
    '/search',
    '/faq',
    '/a-propos',
    '/confidentialite',
    '/conditions',
    '/contact',
    '/support',
    '/mobile',
    '/aide/livraison',
    '/aide/retours',
    '/aide/garantie',
  ]

  for (const path of staticPaths) {
    for (const locale of locales) {
      const urlLocale = locale === defaultLocale ? '' : `/${locale}`
      entries.push({
        url: `${BASE_URL}${urlLocale}${path}`,
        lastModified: new Date(),
        changeFrequency: FREQUENCIES.static,
        priority: path === '' ? PRIORITIES.home : PRIORITIES.static,
        alternates: {
          languages: Object.fromEntries(
            locales.map(l => [l, `${BASE_URL}${l === defaultLocale ? '' : `/${l}`}${path}`])
          ),
        },
      })
    }
  }

  // --- Catégories dynamiques ---
  try {
    const supabase = await createClient(false) // anon key suffit pour la lecture publique
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('slug, updated_at')
      .order('slug')

    if (catError) {
      logger.error(catError, 'Erreur chargement catégories pour sitemap')
    } else if (categories) {
      for (const cat of categories) {
        const path = `/categories/${cat.slug}`
        const lastMod = cat.updated_at ? new Date(cat.updated_at) : new Date()
        for (const locale of locales) {
          const urlLocale = locale === defaultLocale ? '' : `/${locale}`
          entries.push({
            url: `${BASE_URL}${urlLocale}${path}`,
            lastModified: lastMod,
            changeFrequency: FREQUENCIES.category,
            priority: PRIORITIES.category,
            alternates: {
              languages: Object.fromEntries(
                locales.map(l => [l, `${BASE_URL}${l === defaultLocale ? '' : `/${l}`}${path}`])
              ),
            },
          })
        }
      }
    }
  } catch (err) {
    logger.error(err, 'Sitemap: impossible de charger les catégories')
  }

  // --- Produits (limités aux 2000 derniers pour performance) ---
  try {
    const supabase = await createClient(false)
    const { data: products, error: prodError } = await supabase
      .from('produits')
      .select('id, slug, updated_at')
      .eq('est_actif', true)
      .eq('visible', true)
      .order('updated_at', { ascending: false })
      .limit(2000)

    if (prodError) {
      logger.error(prodError, 'Erreur chargement produits pour sitemap')
    } else if (products) {
      for (const prod of products) {
        const path = `/produits/${prod.slug || prod.id}`
        const lastMod = prod.updated_at ? new Date(prod.updated_at) : new Date()
        for (const locale of locales) {
          const urlLocale = locale === defaultLocale ? '' : `/${locale}`
          entries.push({
            url: `${BASE_URL}${urlLocale}${path}`,
            lastModified: lastMod,
            changeFrequency: FREQUENCIES.product,
            priority: PRIORITIES.product,
            alternates: {
              languages: Object.fromEntries(
                locales.map(l => [l, `${BASE_URL}${l === defaultLocale ? '' : `/${l}`}${path}`])
              ),
            },
          })
        }
      }
    }
  } catch (err) {
    logger.error(err, 'Sitemap: impossible de charger les produits')
  }

  return entries
}

// Revalidation du sitemap toutes les heures (ISR)
export const revalidate = 3600