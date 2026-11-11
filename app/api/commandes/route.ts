// app/api/commandes/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════ */
/*  IMPORTS DYNAMIQUES TOLÉRANTS                                   */
/* ═══════════════════════════════════════════════════════════════ */

let _getCurrentUser: any = null
let _createClient: any = null
let _rateLimit: any = null
let _applyRateLimitHeaders: any = null
let _logger: any = console

async function loadModules() {
  if (_getCurrentUser && _createClient) return

  try {
    const auth = await import('@/lib/auth')
    _getCurrentUser = auth.getCurrentUser
  } catch {
    _getCurrentUser = () => null
  }

  try {
    const sb = await import('@/lib/supabaseServer')
    _createClient = sb.createClient
  } catch {
    _createClient = () => null
  }

  try {
    const rl = await import('@/lib/rateLimit')
    _rateLimit = rl.rateLimit
    _applyRateLimitHeaders = rl.applyRateLimitHeaders
  } catch {
    _rateLimit = () => ({ allowed: true, headers: {} })
    _applyRateLimitHeaders = (res: any) => res
  }

  try {
    const log = await import('@/lib/logger')
    _logger = log.default || log
  } catch {
    // console
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function positiveNumber(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function nonNegativeNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function safeJsonStringify(value: any): string | null {
  if (value === null || value === undefined) return null

  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function parseMaybeJson(value: any): any {
  if (value === null || value === undefined) return null

  if (typeof value === 'object') return value

  const raw = String(value || '').trim()
  if (!raw) return null

  if (
    (raw.startsWith('{') && raw.endsWith('}')) ||
    (raw.startsWith('[') && raw.endsWith(']'))
  ) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  return raw
}

function parseVariantAttributes(item: any): Record<string, string> | null {
  const candidates = [
    item?.variant_key,
    item?.variant_attributes,
    item?.variante,
  ]

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const attributes =
        (parsed as any).attributes ??
        (parsed as any).attrs ??
        parsed

      if (attributes && typeof attributes === 'object') {
        const clean: Record<string, string> = {}

        for (const [key, value] of Object.entries(attributes)) {
          const cleanKey = String(key || '').trim()
          const cleanValue = String(value ?? '').trim()

          if (cleanKey && cleanValue) {
            clean[cleanKey] = cleanValue
          }
        }

        if (Object.keys(clean).length > 0) return clean
      }
    }
  }

  return null
}

function variantAttributesLabel(attributes: Record<string, string> | null): string | null {
  if (!attributes) return null

  const values = Object.values(attributes)
    .filter(Boolean)
    .map(String)

  return values.length > 0 ? values.join(' • ') : null
}

function normalizeDeliveryMode(value: any): 'domicile' | 'point_retrait' | 'express' {
  const raw = String(value || '').trim()

  if (raw === 'point_retrait' || raw === 'pickup' || raw === 'relais') {
    return 'point_retrait'
  }

  if (raw === 'express' || raw === 'same_day' || raw === 'jour_meme') {
    return 'express'
  }

  return 'domicile'
}

function coerceId(value: any): number | string | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)
  if (Number.isFinite(n) && String(value).trim() !== '') {
    return n
  }

  return String(value)
}

function removeUndefined(obj: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value
    }
  }

  return clean
}

function isMissingTableError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42P01' ||
    /relation .* does not exist|table .* does not exist|could not find the relationship/i.test(
      message
    )
  )
}

function isMissingColumnError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42703' ||
    code === '42701' ||
    /column .* does not exist|could not find the .* column|schema cache.*could not find/i.test(
      message
    )
  )
}

function generateCommandeNumero(): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0')

  return `CMD-${timestamp}-${random}`
}

function generateFallbackId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }

  return `fallback-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

async function createSupabaseClient(createClient: any): Promise<any> {
  if (!createClient) return null

  try {
    const raw = createClient(true)
    return raw instanceof Promise ? await raw : raw
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const articleSchema = z.object({
  produit_id: z.string().min(1, 'ID produit requis'),
  quantite: z.number().int().positive('Quantité doit être supérieure à 0'),

  // Legacy / client-side hints
  prix_unitaire: z.number().min(0).nullable().optional(),
  prix_unitaire_usd: z.number().min(0).nullable().optional(),

  specifications: z.string().max(500).nullable().optional(),
  variante: z.any().nullable().optional(),
  variant_key: z.string().nullable().optional(),
  variant_attributes: z.any().nullable().optional(),
})

const createOrderSchema = z
  .object({
    items: z.array(articleSchema).min(1, 'Au moins un article requis'),

    // Legacy fields
    total_articles: z.number().min(0).nullable().optional(),
    frais_livraison: z.number().min(0).nullable().optional(),
    reduction: z.number().min(0).nullable().optional(),

    // New intelligent delivery fields
    shipping_usd: z.number().min(0).nullable().optional(),
    shipping_cdf: z.number().min(0).nullable().optional(),
    shipping_method: z
      .enum(['domicile', 'point_retrait', 'express'])
      .nullable()
      .optional(),
    shipping_breakdown: z.any().nullable().optional(),
    shipping_delay_label: z.string().max(120).nullable().optional(),
    shipping_rate_used: z.number().positive().nullable().optional(),
    exchange_rate: z.number().positive().nullable().optional(),

    type_livraison: z
      .enum(['domicile', 'point_retrait', 'express'])
      .default('domicile'),

    adresse_livraison: z.string().max(500).nullable().optional(),
    commune_livraison_id: z
      .union([z.number(), z.string()])
      .nullable()
      .optional(),

    point_retrait_id: z
      .union([z.number(), z.string()])
      .nullable()
      .optional(),
    point_retrait_nom: z.string().max(200).nullable().optional(),
    point_retrait_adresse: z.string().max(500).nullable().optional(),
    point_retrait_telephone: z.string().max(50).nullable().optional(),

    express: z.boolean().default(false),
    message_cadeau: z.string().max(200).nullable().optional(),
    delivery_note: z.string().max(250).nullable().optional(),

    code_promo: z.string().max(30).nullable().optional(),
    remise_percent: z.number().min(0).max(100).nullable().optional(),
    remise_montant: z.number().min(0).nullable().optional(),

    currency: z.enum(['USD', 'CDF']).default('USD'),
    total_usd: z.number().min(0).nullable().optional(),
    total_cdf: z.number().min(0).nullable().optional(),
  })
  .passthrough()

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUITS                                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductsByIds(
  supabase: any,
  ids: string[],
  logger: any
): Promise<Record<string, any>> {
  if (!supabase || ids.length === 0) return {}

  const columnSets = [
    // Complet avec livraison intelligente
    'id, nom, slug, prix, prix_usd, prix_cdf, prix_comparatif, stock, est_actif, delivery_config, poids_kg, longueur_cm, largeur_cm, hauteur_cm, variantes, variant_attributes, variant_config, images, livraison_domicile, livraison_point_retrait, livraison_express, express_gratuit, delay_livraison',

    // Sans delivery_config
    'id, nom, slug, prix, prix_usd, prix_cdf, prix_comparatif, stock, est_actif, poids_kg, longueur_cm, largeur_cm, hauteur_cm, variantes, variant_attributes, variant_config, images, livraison_domicile, livraison_point_retrait, livraison_express, express_gratuit, delay_livraison',

    // Sans variant_config
    'id, nom, slug, prix, prix_usd, prix_cdf, prix_comparatif, stock, est_actif, delivery_config, poids_kg, variantes, variant_attributes, images',

    // Minimal
    'id, nom, prix, prix_usd, stock, est_actif, images, variantes, poids_kg',

    // Ultra minimal
    'id, nom, prix, stock, est_actif',
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from('produits')
        .select(columns)
        .in('id', ids)

      if (!error && Array.isArray(data)) {
        const map: Record<string, any> = {}

        for (const product of data) {
          if (product?.id) {
            map[String(product.id)] = product
          }
        }

        return map
      }

      if (isMissingTableError(error)) {
        logger.warn('Table produits indisponible, fallback client autorisé')
        return {}
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn('Erreur fetch produits', error)
    } catch (err) {
      logger.warn('Exception fetch produits', err)
    }
  }

  return {}
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROMO                                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function resolvePromoReduction(
  supabase: any,
  code: string | null | undefined,
  subtotalCdf: number,
  subtotalUsd: number,
  rate: number | null,
  logger: any
): Promise<{
  reductionCdf: number
  reductionUsd: number
  promo?: any
  error?: string
}> {
  if (!code) {
    return { reductionCdf: 0, reductionUsd: 0 }
  }

  const normalized = String(code).trim().toUpperCase()

  if (!normalized) {
    return { reductionCdf: 0, reductionUsd: 0 }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', normalized)
        .eq('actif', true)
        .maybeSingle()

      if (!error && data) {
        const expiresAt = data.expires_at || data.expiresAt || data.expiration_date
        if (expiresAt && new Date(expiresAt) < new Date()) {
          return { reductionCdf: 0, reductionUsd: 0, error: 'Ce code promo a expiré.' }
        }

        const minTotalCdf =
          positiveNumber(data.min_total ?? data.minTotal) ??
          (rate && positiveNumber(data.min_total_usd ?? data.minTotalUsd)
            ? roundCdf(positiveNumber(data.min_total_usd ?? data.minTotalUsd)! * rate)
            : 0) ??
          0

        if (minTotalCdf > 0 && subtotalCdf < minTotalCdf) {
          return {
            reductionCdf: 0,
            reductionUsd: 0,
            error: `Ce code promo nécessite un minimum de ${minTotalCdf.toLocaleString('fr-FR')} FC.`,
          }
        }

        const rawValue =
          positiveNumber(data.value ?? data.valeur ?? data.reduction_percent ?? data.discount) ??
          0

        const type = String(
          data.type ?? data.kind ?? data.discount_type ?? 'percent'
        ).toLowerCase()

        let reductionCdf = 0

        if (type.includes('fixed') || type.includes('montant') || type.includes('euro') || type.includes('dollar')) {
          const fixedCdf =
            positiveNumber(data.value_cdf ?? data.montant_cdf) ??
            (rate && positiveNumber(data.value_usd ?? data.montant_usd)
              ? roundCdf(positiveNumber(data.value_usd ?? data.montant_usd)! * rate)
              : rawValue)

          reductionCdf = Math.min(subtotalCdf, roundCdf(fixedCdf || 0))
        } else {
          const percent = Math.min(100, Math.max(0, rawValue))
          reductionCdf = roundCdf((subtotalCdf * percent) / 100)
        }

        const maxDiscountCdf =
          positiveNumber(data.max_discount ?? data.maxDiscount) ??
          (rate && positiveNumber(data.max_discount_usd ?? data.maxDiscountUsd)
            ? roundCdf(positiveNumber(data.max_discount_usd ?? data.maxDiscountUsd)! * rate)
            : null)

        if (maxDiscountCdf && maxDiscountCdf > 0 && reductionCdf > maxDiscountCdf) {
          reductionCdf = roundCdf(maxDiscountCdf)
        }

        reductionCdf = Math.min(reductionCdf, subtotalCdf)

        const reductionUsd =
          rate && rate > 0
            ? round2(reductionCdf / rate)
            : positiveNumber(data.value_usd ?? data.max_discount_usd)
            ? round2(positiveNumber(data.value_usd ?? data.max_discount_usd)!)
            : round2(subtotalUsd > 0 && subtotalCdf > 0 ? (subtotalUsd * reductionCdf) / subtotalCdf : 0)

        return {
          reductionCdf,
          reductionUsd,
          promo: data,
        }
      }

      if (error && !isMissingTableError(error) && !isMissingColumnError(error)) {
        logger.warn('Erreur promo_codes', error)
      }
    } catch (err) {
      logger.warn('Exception promo_codes', err)
    }
  }

  // Fallback legacy
  if (normalized === 'BIENVENUE10') {
    const reductionCdf = roundCdf(subtotalCdf * 0.1)
    const reductionUsd =
      rate && rate > 0
        ? round2(reductionCdf / rate)
        : round2(subtotalUsd * 0.1)

    return { reductionCdf, reductionUsd }
  }

  return { reductionCdf: 0, reductionUsd: 0, error: 'Code promo invalide.' }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LIVRAISON INTELLIGENTE                                         */
/* ═══════════════════════════════════════════════════════════════ */

async function calculateServerShipping(
  serverItems: any[],
  modeId: 'domicile' | 'point_retrait' | 'express',
  rate: number | null,
  subtotalUsd: number,
  clientFallback: any,
  logger: any
): Promise<{
  usd: number
  cdf: number
  breakdown: any
  delay_label: string
  warnings: string[]
  source: 'server' | 'client_fallback' | 'none'
  quote: any
  error?: string
}> {
  try {
    const shippingUtils = await import('@/lib/shipping-utils')

    if (typeof shippingUtils.calculateShippingQuote !== 'function') {
      throw new Error('calculateShippingQuote indisponible')
    }

    const shippingItems = serverItems.map((item) => ({
      id: item.produit_id,
      product_id: item.produit_id,
      nom: item.nom || 'Produit',
      quantity: item.quantite,
      unit_price_usd: item.unitUsd,
      prix_usd: item.unitUsd,
      prix: item.unitCdf,
      delivery_config: item.delivery_config ?? null,
      poids_kg: item.poids_kg ?? null,
      product: {
        id: item.produit_id,
        nom: item.nom || 'Produit',
        prix_usd: item.unitUsd,
        prix: item.unitCdf,
        poids_kg: item.poids_kg ?? null,
        delivery_config: item.delivery_config ?? null,
      },
      variante: item.variantAttrs
        ? {
            attributes: item.variantAttrs,
            poids_kg: item.poids_kg ?? null,
          }
        : null,
    }))

    if (typeof shippingUtils.getAvailableDeliveryModes === 'function') {
      const availability = shippingUtils.getAvailableDeliveryModes(
        shippingItems,
        rate
      )

      const current = availability?.[modeId]

      if (current && current.available === false) {
        return {
          usd: 0,
          cdf: 0,
          breakdown: null,
          delay_label: '',
          warnings: [],
          source: 'none',
          quote: null,
          error:
            current.reason ||
            `Le mode de livraison "${modeId}" n'est pas disponible pour cette commande.`,
        }
      }
    }

    const quote = shippingUtils.calculateShippingQuote({
      items: shippingItems,
      modeId,
      rate,
      subtotalUsd,
    })

    if (!quote) {
      throw new Error('Quote livraison vide')
    }

    if (quote.available === false) {
      return {
        usd: 0,
        cdf: 0,
        breakdown: quote.breakdown ?? null,
        delay_label: quote.delay_label ?? '',
        warnings: quote.warnings ?? [],
        source: 'none',
        quote,
        error: quote.reason || 'Mode de livraison indisponible.',
      }
    }

    const usd = round2(nonNegativeNumber(quote.total_usd))
    const cdf =
      positiveNumber(quote.total_cdf) !== null
        ? roundCdf(quote.total_cdf)
        : rate && rate > 0
        ? roundCdf(usd * rate)
        : 0

    return {
      usd,
      cdf,
      breakdown: quote.breakdown ?? null,
      delay_label: quote.delay_label ?? '',
      warnings: Array.isArray(quote.warnings) ? quote.warnings : [],
      source: 'server',
      quote,
    }
  } catch (err: any) {
    logger.warn('Livraison serveur indisponible, fallback client', err?.message || err)
  }

  // Fallback client / legacy
  const clientUsd =
    positiveNumber(clientFallback?.shipping_usd) ??
    (rate && positiveNumber(clientFallback?.frais_livraison)
      ? round2(positiveNumber(clientFallback?.frais_livraison)! / rate)
      : null)

  const clientCdf =
    positiveNumber(clientFallback?.shipping_cdf) ??
    positiveNumber(clientFallback?.frais_livraison) ??
    (clientUsd && rate ? roundCdf(clientUsd * rate) : 0)

  if (clientUsd !== null || clientCdf > 0) {
    return {
      usd: round2(clientUsd ?? 0),
      cdf: roundCdf(clientCdf ?? 0),
      breakdown: clientFallback?.shipping_breakdown ?? null,
      delay_label: clientFallback?.shipping_delay_label ?? '',
      warnings: [],
      source: 'client_fallback',
      quote: null,
    }
  }

  return {
    usd: 0,
    cdf: 0,
    breakdown: null,
    delay_label: '',
    warnings: [],
    source: 'none',
    quote: null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  INSERTIONS TOLÉRANTES                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function insertCommande(
  supabase: any,
  basePayload: Record<string, any>,
  extendedPayload: Record<string, any>,
  logger: any
): Promise<any> {
  if (!supabase) {
    return {
      id: generateFallbackId(),
      numero_commande: basePayload.numero_commande,
      _fallback: true,
    }
  }

  const attempts = [
    { name: 'extended', payload: extendedPayload },
    { name: 'base', payload: basePayload },
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('commandes')
        .insert(removeUndefined(attempt.payload))
        .select()
        .single()

      if (!error && data) return data

      if (isMissingTableError(error)) {
        logger.warn('Table commandes indisponible, commande simulée')
        return {
          id: generateFallbackId(),
          numero_commande: basePayload.numero_commande,
          _fallback: true,
        }
      }

      if (attempt.name === 'extended' && isMissingColumnError(error)) {
        logger.warn('Colonnes commande étendues indisponibles, fallback base')
        continue
      }

      logger.error('Échec insertion commande', error)
      throw new Error(error?.message || 'Erreur lors de la création de la commande')
    } catch (err: any) {
      if (attempt.name === 'extended' && isMissingColumnError(err)) {
        logger.warn('Exception colonnes commande étendues, fallback base')
        continue
      }

      if (isMissingTableError(err)) {
        logger.warn('Exception table commandes indisponible, commande simulée')
        return {
          id: generateFallbackId(),
          numero_commande: basePayload.numero_commande,
          _fallback: true,
        }
      }

      logger.error('Exception insertion commande', err)
      throw new Error(err?.message || 'Erreur lors de la création de la commande')
    }
  }

  throw new Error('Impossible d’insérer la commande')
}

async function insertCommandeArticles(
  supabase: any,
  commandeId: string,
  legacyArticles: Record<string, any>[],
  extendedArticles: Record<string, any>[],
  logger: any
): Promise<void> {
  if (!supabase || !commandeId) return

  const attempts = [
    { name: 'extended', payload: extendedArticles },
    { name: 'legacy', payload: legacyArticles },
    {
      name: 'minimal',
      payload: legacyArticles.map((article) => ({
        commande_id: article.commande_id,
        produit_id: article.produit_id,
        quantite: article.quantite,
        prix_unitaire: article.prix_unitaire,
      })),
    },
  ]

  for (const attempt of attempts) {
    try {
      const rows = attempt.payload.map(removeUndefined)

      const { error } = await supabase
        .from('commande_articles')
        .insert(rows)

      if (!error) return

      if (isMissingTableError(error)) {
        logger.warn('Table commande_articles indisponible')
        return
      }

      if (
        attempt.name !== 'minimal' &&
        isMissingColumnError(error)
      ) {
        logger.warn(
          `Colonnes commande_articles indisponibles pour ${attempt.name}, fallback`
        )
        continue
      }

      logger.error('Échec insertion commande_articles', error)
      throw new Error(
        error?.message || "Erreur lors de l'enregistrement des produits"
      )
    } catch (err: any) {
      if (
        attempt.name !== 'minimal' &&
        isMissingColumnError(err)
      ) {
        logger.warn(
          `Exception colonnes commande_articles pour ${attempt.name}, fallback`
        )
        continue
      }

      if (isMissingTableError(err)) {
        logger.warn('Exception table commande_articles indisponible')
        return
      }

      logger.error('Exception insertion commande_articles', err)
      throw new Error(
        err?.message || "Erreur lors de l'enregistrement des produits"
      )
    }
  }
}

async function decrementStock(
  supabase: any,
  items: any[],
  logger: any
): Promise<void> {
  if (!supabase) return

  for (const item of items) {
    try {
      const { error } = await supabase.rpc('decrement_stock', {
        p_produit_id: item.produit_id,
        p_quantite: item.quantite,
      })

      if (!error) continue

      if (
        error.code === '42883' ||
        /function .* does not exist|could not find the function/i.test(
          String(error.message || '')
        )
      ) {
        // Fallback direct prudent
        try {
          const { data: product } = await supabase
            .from('produits')
            .select('stock')
            .eq('id', item.produit_id)
            .single()

          if (product && product.stock !== null && product.stock !== undefined) {
            const newStock = Math.max(
              0,
              Number(product.stock) - Number(item.quantite)
            )

            await supabase
              .from('produits')
              .update({
                stock: newStock,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.produit_id)
          }
        } catch (fallbackErr) {
          logger.warn('Fallback decrement stock impossible', fallbackErr)
        }
      } else {
        logger.warn('RPC decrement_stock erreur', error)
      }
    } catch (err) {
      logger.warn('Exception decrement_stock', err)
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Création de commande                                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  await loadModules()

  const logger = _logger
  const getCurrentUser = _getCurrentUser
  const createClient = _createClient
  const rateLimit = _rateLimit
  const applyRateLimitHeaders = _applyRateLimitHeaders

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `commande:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Patientez une minute.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsed = createOrderSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const data = parsed.data

    const rate =
      positiveNumber(data.shipping_rate_used) ??
      positiveNumber(data.exchange_rate) ??
      null

    const modeId = normalizeDeliveryMode(
      data.shipping_method ||
        data.type_livraison ||
        (data.express ? 'express' : 'domicile')
    )

    const supabase = await createSupabaseClient(createClient)

    const produitIds = [...new Set(data.items.map((item) => item.produit_id))]

    const productsById = await fetchProductsByIds(
      supabase,
      produitIds,
      logger
    )

    const hasProductsCatalog =
      supabase && Object.keys(productsById).length > 0

    /* ------------------------------------------------------------ */
    /* Construction des articles serveur                             */
    /* ------------------------------------------------------------ */

    const serverItems: any[] = []

    for (const item of data.items) {
      const product = productsById[item.produit_id]

      if (hasProductsCatalog && !product) {
        return NextResponse.json(
          {
            error: `Produit introuvable : ${item.produit_id}`,
          },
          { status: 400 }
        )
      }

      if (product && product.est_actif === false) {
        return NextResponse.json(
          {
            error: `Le produit "${product.nom || item.produit_id}" n'est plus disponible.`,
          },
          { status: 400 }
        )
      }

      if (
        product &&
        product.stock !== null &&
        product.stock !== undefined &&
        Number(product.stock) < item.quantite
      ) {
        return NextResponse.json(
          {
            error: `Stock insuffisant pour "${product.nom || item.produit_id}".`,
          },
          { status: 400 }
        )
      }

      const variantAttrs = parseVariantAttributes(item)

      let variant: any = null

      if (
        product &&
        Array.isArray(product.variantes) &&
        variantAttrs
      ) {
        const targetKey = safeJsonStringify(variantAttrs)

        variant =
          product.variantes.find((v: any) => {
            const vKey = safeJsonStringify(v?.attributes || {})
            return vKey === targetKey
          }) || null
      }

      const baseUsd =
        positiveNumber(product?.prix_usd) ??
        positiveNumber(product?.price_usd)

      const baseCdf =
        positiveNumber(product?.prix) ??
        positiveNumber(product?.price) ??
        positiveNumber(product?.prix_cdf)

      const variantUsd =
        positiveNumber(variant?.prix_specifique_usd) ??
        positiveNumber(variant?.price_specifique_usd)

      const variantCdf =
        positiveNumber(variant?.prix_specifique_cdf) ??
        positiveNumber(variant?.prix_specifique) ??
        positiveNumber(variant?.price_specifique)

      let unitUsd =
        variantUsd ??
        baseUsd ??
        positiveNumber(item.prix_unitaire_usd)

      let unitCdf =
        variantCdf ??
        baseCdf ??
        positiveNumber(item.prix_unitaire)

      if (!unitUsd && unitCdf && rate) {
        unitUsd = round2(unitCdf / rate)
      }

      if (!unitCdf && unitUsd && rate) {
        unitCdf = roundCdf(unitUsd * rate)
      }

      if (!unitUsd || unitUsd <= 0) {
        return NextResponse.json(
          {
            error: `Prix USD indisponible pour "${product?.nom || item.produit_id}".`,
          },
          { status: 400 }
        )
      }

      if (!unitCdf || unitCdf <= 0) {
        if (rate && rate > 0) {
          unitCdf = roundCdf(unitUsd * rate)
        } else {
          return NextResponse.json(
            {
              error: `Prix CDF indisponible pour "${product?.nom || item.produit_id}". Taux de change manquant.`,
            },
            { status: 400 }
          )
        }
      }

      const variantLabel =
        item.specifications ||
        variantAttributesLabel(variantAttrs) ||
        (typeof item.variante === 'string' ? item.variante : null)

      serverItems.push({
        produit_id: item.produit_id,
        nom: product?.nom || 'Produit',
        quantite: item.quantite,
        unitUsd: round2(unitUsd),
        unitCdf: roundCdf(unitCdf),
        variantLabel,
        variantAttrs,
        variantId: variant?.id || null,
        product: product || null,
        delivery_config: product?.delivery_config ?? null,
        poids_kg:
          variant?.poids_kg ??
          product?.poids_kg ??
          null,
      })
    }

    /* ------------------------------------------------------------ */
    /* Sous-total serveur                                            */
    /* ------------------------------------------------------------ */

    const subtotalUsd = round2(
      serverItems.reduce(
        (acc, item) => acc + item.unitUsd * item.quantite,
        0
      )
    )

    const subtotalCdf = roundCdf(
      serverItems.reduce(
        (acc, item) => acc + item.unitCdf * item.quantite,
        0
      )
    )

    if (subtotalUsd <= 0 || subtotalCdf <= 0) {
      return NextResponse.json(
        { error: 'Le total de la commande est invalide.' },
        { status: 400 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Promo                                                         */
    /* ------------------------------------------------------------ */

    const promoResult = await resolvePromoReduction(
      supabase,
      data.code_promo,
      subtotalCdf,
      subtotalUsd,
      rate,
      logger
    )

    if (promoResult.error) {
      return NextResponse.json(
        { error: promoResult.error },
        { status: 400 }
      )
    }

    const reductionCdf = roundCdf(promoResult.reductionCdf || 0)
    const reductionUsd = round2(promoResult.reductionUsd || 0)

    /* ------------------------------------------------------------ */
    /* Livraison intelligente serveur                                */
    /* ------------------------------------------------------------ */

    const shipping = await calculateServerShipping(
      serverItems,
      modeId,
      rate,
      subtotalUsd,
      {
        shipping_usd: data.shipping_usd,
        shipping_cdf: data.shipping_cdf,
        frais_livraison: data.frais_livraison,
        shipping_breakdown: data.shipping_breakdown,
        shipping_delay_label: data.shipping_delay_label,
      },
      logger
    )

    if (shipping.error) {
      return NextResponse.json(
        { error: shipping.error },
        { status: 400 }
      )
    }

    const shippingUsd = round2(shipping.usd)
    const shippingCdf = roundCdf(shipping.cdf)

    /* ------------------------------------------------------------ */
    /* Totaux finaux                                                 */
    /* ------------------------------------------------------------ */

    const totalUsd = Math.max(
      0,
      round2(subtotalUsd + shippingUsd - reductionUsd)
    )

    const totalCdf = Math.max(
      0,
      roundCdf(subtotalCdf + shippingCdf - reductionCdf)
    )

    if (totalCdf <= 0) {
      return NextResponse.json(
        { error: 'Le total final de la commande est invalide.' },
        { status: 400 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Insertion commande                                            */
    /* ------------------------------------------------------------ */

    const numero_commande = generateCommandeNumero()

    const basePayload = {
      acheteur_id: user.id,
      numero_commande,
      statut: 'en_attente',
      total_articles: subtotalCdf,
      frais_livraison: shippingCdf,
      total_global: totalCdf,
      adresse_livraison: data.adresse_livraison || null,
      commune_livraison_id: coerceId(data.commune_livraison_id),
      type_livraison: modeId,
      point_retrait_id: coerceId(data.point_retrait_id),
      express: modeId === 'express' || Boolean(data.express),
      message_cadeau: data.message_cadeau || null,
      reduction: reductionCdf,
      code_promo_utilise: data.code_promo || null,
    }

    const extendedPayload = {
      ...basePayload,
      currency: data.currency || 'USD',
      total_usd: totalUsd,
      total_cdf: totalCdf,
      shipping_usd: shippingUsd,
      shipping_cdf: shippingCdf,
      shipping_method: modeId,
      shipping_rate_used: rate,
      shipping_breakdown: shipping.breakdown ?? null,
      shipping_delay_label: shipping.delay_label || null,
      delivery_note: data.delivery_note || null,
      point_retrait_nom: data.point_retrait_nom || null,
      point_retrait_adresse: data.point_retrait_adresse || null,
      point_retrait_telephone: data.point_retrait_telephone || null,
      shipping_snapshot: {
        mode: modeId,
        source: shipping.source,
        rate_used: rate,
        subtotal_usd: subtotalUsd,
        subtotal_cdf: subtotalCdf,
        reduction_usd: reductionUsd,
        reduction_cdf: reductionCdf,
        total_usd: totalUsd,
        total_cdf: totalCdf,
        shipping_usd: shippingUsd,
        shipping_cdf: shippingCdf,
        delay_label: shipping.delay_label || null,
        warnings: shipping.warnings || [],
        breakdown: shipping.breakdown ?? null,
        quote: shipping.quote ?? null,
        generated_at: new Date().toISOString(),
      },
    }

    const commande = await insertCommande(
      supabase,
      basePayload,
      extendedPayload,
      logger
    )

    /* ------------------------------------------------------------ */
    /* Insertion articles                                            */
    /* ------------------------------------------------------------ */

    const legacyArticles = serverItems.map((item) => ({
      commande_id: commande.id,
      produit_id: item.produit_id,
      quantite: item.quantite,
      prix_unitaire: item.unitCdf,
      specifications: item.variantLabel || null,
      variante:
        item.variantLabel ||
        (item.variantAttrs ? safeJsonStringify(item.variantAttrs) : null),
    }))

    const extendedArticles = serverItems.map((item, index) => ({
      ...legacyArticles[index],
      prix_unitaire_usd: item.unitUsd,
      variant_attributes: item.variantAttrs || null,
      delivery_config_snapshot: item.delivery_config || null,
      poids_kg: item.poids_kg || null,
    }))

    await insertCommandeArticles(
      supabase,
      commande.id,
      legacyArticles,
      extendedArticles,
      logger
    )

    /* ------------------------------------------------------------ */
    /* Stock                                                         */
    /* ------------------------------------------------------------ */

    await decrementStock(supabase, serverItems, logger)

    /* ------------------------------------------------------------ */
    /* Notifications                                                 */
    /* ------------------------------------------------------------ */

    try {
      const notif = await import('@/lib/notifications').catch(() => ({}))

      const profile = await getCurrentUser()

      if (profile?.email && notif.sendEmail) {
        notif.sendEmail(
          profile.email,
          `Commande #${numero_commande} confirmée`,
          `Bonjour, votre commande a été enregistrée.`
        )
      }

      if (profile?.telephone && notif.sendSMS) {
        notif.sendSMS(
          profile.telephone,
          `Gercie: Commande #${numero_commande} confirmée pour ${totalCdf.toLocaleString('fr-FR')} FC.`
        )
      }

      if (notif.createNotification) {
        notif.createNotification(
          user.id,
          'commande',
          'Commande confirmée',
          `Commande #${numero_commande} enregistrée.`,
          { commande_id: commande.id }
        )
      }
    } catch (notifError) {
      logger.warn('Notifications indisponibles', notifError)
    }

    return NextResponse.json(
      {
        id: commande.id,
        numero: commande.numero_commande,
        status: commande.statut || 'en_attente',
        currency: data.currency || 'USD',
        total_usd: totalUsd,
        total_cdf: totalCdf,
        shipping_usd: shippingUsd,
        shipping_cdf: shippingCdf,
        shipping_method: modeId,
        shipping_delay_label: shipping.delay_label || null,
        shipping_source: shipping.source,
        reduction_usd: reductionUsd,
        reduction_cdf: reductionCdf,
      },
      { status: 201 }
    )
  } catch (error: any) {
    logger.error('Crash POST /api/commandes', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Historique des commandes                                 */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  await loadModules()

  const logger = _logger
  const createClient = _createClient
  const getCurrentUser = _getCurrentUser

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createSupabaseClient(createClient)

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json(
        {
          error: 'Client Supabase invalide',
          details:
            "L'initialisation de supabaseServer n'a pas renvoyé un client valide doté de la méthode .from()",
        },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)

    const statut = searchParams.get('statut') || undefined
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '10', 10))
    )

    const selectCandidates = [
      '*, commande_articles (*, produits (nom, images))',
      '*, commande_articles (quantite, prix_unitaire, prix_unitaire_usd, specifications, variante, produits (nom, images))',
      '*, commande_articles (quantite, prix_unitaire, specifications, variante, produits (nom, images))',
      '*',
    ]

    let commandes: any[] | null = null
    let lastError: any = null

    for (const columns of selectCandidates) {
      try {
        let query = supabase
          .from('commandes')
          .select(columns)
          .eq('acheteur_id', user.id)
          .order(sortBy, { ascending: sortOrder === 'asc' })

        if (statut) query = query.eq('statut', statut)
        if (search) query = query.ilike('numero_commande', `%${search}%`)

        const from = (page - 1) * limit
        const to = from + limit - 1

        query = query.range(from, to)

        const { data, error } = await query

        if (!error) {
          commandes = data || []
          break
        }

        lastError = error

        if (isMissingTableError(error)) {
          return NextResponse.json([])
        }

        if (isMissingColumnError(error)) {
          continue
        }

        logger.error('Erreur récupération commandes', error)
        break
      } catch (err) {
        lastError = err
        logger.warn('Exception récupération commandes', err)
      }
    }

    if (!commandes) {
      if (lastError && isMissingTableError(lastError)) {
        return NextResponse.json([])
      }

      return NextResponse.json(
        {
          error: 'Erreur lors de la requête de base de données Supabase',
          details: lastError,
        },
        { status: 500 }
      )
    }

    const formatted = (commandes || []).map((cmd: any) => ({
      id: cmd.id,
      numero: cmd.numero_commande,
      statut: cmd.statut,
      date: cmd.created_at,

      type_livraison: cmd.type_livraison || cmd.shipping_method || null,
      shipping_method: cmd.shipping_method || cmd.type_livraison || null,
      shipping_delay_label: cmd.shipping_delay_label || null,
      shipping_breakdown: cmd.shipping_breakdown || null,
      shipping_snapshot: cmd.shipping_snapshot || null,

      currency: cmd.currency || 'CDF',

      total: cmd.total_global ?? cmd.total_cdf ?? null,
      total_global: cmd.total_global ?? null,
      total_cdf: cmd.total_cdf ?? cmd.total_global ?? null,
      total_usd: cmd.total_usd ?? null,

      frais_livraison: cmd.frais_livraison ?? cmd.shipping_cdf ?? null,
      shipping_cdf: cmd.shipping_cdf ?? cmd.frais_livraison ?? null,
      shipping_usd: cmd.shipping_usd ?? null,

      reduction: cmd.reduction ?? null,
      code_promo_utilise: cmd.code_promo_utilise ?? null,

      adresse_livraison: cmd.adresse_livraison || null,
      commune_livraison_id: cmd.commune_livraison_id || null,
      point_retrait_id: cmd.point_retrait_id || null,
      point_retrait_nom: cmd.point_retrait_nom || null,
      point_retrait_adresse: cmd.point_retrait_adresse || null,
      point_retrait_telephone: cmd.point_retrait_telephone || null,
      delivery_note: cmd.delivery_note || null,

      articles: (cmd.commande_articles || []).map((a: any) => ({
        nom: a.produits?.nom || 'Produit inconnu',
        quantite: a.quantite,
        prix_unitaire: a.prix_unitaire,
        prix_unitaire_usd: a.prix_unitaire_usd ?? null,
        specifications: a.specifications || null,
        variante: a.variante || null,
        variant_attributes: a.variant_attributes || null,
        image: Array.isArray(a.produits?.images)
          ? a.produits.images[0]
          : a.produits?.images || null,
      })),
    }))

    return NextResponse.json(formatted)
  } catch (error: any) {
    logger.error('Crash global critique sur GET /api/commandes', error)

    return NextResponse.json(
      {
        error: "Crash de l'API lors du traitement des données",
        message: error?.message,
        stack: error?.stack,
      },
      { status: 500 }
    )
  }
}