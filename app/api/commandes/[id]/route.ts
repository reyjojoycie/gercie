// app/api/commandes/[id]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  IMPORTS DYNAMIQUES TOLÉRANTS                                   */
/* ═══════════════════════════════════════════════════════════════ */

let _getCurrentUser: any = null
let _createClient: any = null
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
    _createClient = sb.createClient || sb.default || sb
  } catch {
    _createClient = () => null
  }

  try {
    const log = await import('@/lib/logger')
    _logger = log.default || log
  } catch {
    // console
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS NUMÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function positiveNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  return Number.isFinite(n) && n > 0 ? n : null
}

function optionalNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const n = Number(value)

  return Number.isFinite(n) ? n : undefined
}

function firstPositive(...values: any[]): number {
  for (const value of values) {
    const n = positiveNumber(value)

    if (n != null) return n
  }

  return 0
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round(value + Number.EPSILON)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
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

/* ═══════════════════════════════════════════════════════════════ */
/*  ERROR DETECTION SUPABASE / POSTGRES                            */
/* ═══════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════ */
/*  JSON / VARIANTE CANONIQUE                                      */
/* ═══════════════════════════════════════════════════════════════ */

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

function canonicalizeVariantAttributes(
  input: any
): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(input)) {
    const cleanKey = String(key || '').trim()

    if (!cleanKey) continue
    if (value === null || value === undefined) continue

    const cleanValue = String(value).trim()
    if (!cleanValue) continue

    clean[cleanKey] = cleanValue
  }

  const entries = Object.entries(clean)

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return Object.fromEntries(entries)
}

function stableVariantKeyFromAttributes(
  attributes: Record<string, string> | null
): string | null {
  const clean = canonicalizeVariantAttributes(attributes)

  if (!clean) return null

  return safeJsonStringify(clean)
}

function extractVariantAttributes(raw: any): Record<string, string> | null {
  const candidates = [
    raw?.variant_attributes,
    raw?.variante,
    raw?.variant_key,
    raw?.attributes,
    raw?.attrs,
  ]

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const attributes =
        (parsed as any).attributes ??
        (parsed as any).attrs ??
        parsed

      const clean = canonicalizeVariantAttributes(attributes)

      if (clean) return clean
    }
  }

  return null
}

function variantAttributesLabel(
  attributes: Record<string, string> | null
): string | null {
  const clean = canonicalizeVariantAttributes(attributes)

  if (!clean) return null

  const values = Object.values(clean)
    .filter(Boolean)
    .map(String)

  return values.length > 0 ? values.join(' • ') : null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LIVRAISON / STATUTS                                            */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeDeliveryMode(
  value: any
): 'domicile' | 'point_retrait' | 'express' {
  const raw = String(value || '').trim()

  if (raw === 'point_retrait' || raw === 'pickup' || raw === 'relais') {
    return 'point_retrait'
  }

  if (raw === 'express' || raw === 'same_day' || raw === 'jour_meme') {
    return 'express'
  }

  return 'domicile'
}

function normalizeArticleStatus(value: any): 'ok' | 'refuse' | 'pending' {
  const raw = String(value || '')
    .trim()
    .toLowerCase()

  if (
    raw === 'ok' ||
    raw === 'accepte' ||
    raw === 'accepté' ||
    raw === 'accepted' ||
    raw === 'validé' ||
    raw === 'valide'
  ) {
    return 'ok'
  }

  if (
    raw === 'refuse' ||
    raw === 'refusé' ||
    raw === 'rejected' ||
    raw === 'reject'
  ) {
    return 'refuse'
  }

  return 'pending'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  IMAGES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

function getFirstImage(...sources: any[]): string | null {
  for (const source of sources) {
    if (!source) continue

    if (typeof source === 'string' && source.trim()) {
      return source
    }

    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === 'string' && item.trim()) {
          return item
        }

        if (item && typeof item === 'object') {
          const url =
            item.url ||
            item.src ||
            item.path ||
            item.public_url ||
            item.image

          if (typeof url === 'string' && url.trim()) {
            return url
          }
        }
      }
    }

    if (typeof source === 'object') {
      const url =
        source.url ||
        source.src ||
        source.path ||
        source.public_url ||
        source.image

      if (typeof url === 'string' && url.trim()) {
        return url
      }
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number
}

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux si taux disponible.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas disponible.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux si taux disponible.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdSource > 0 ? round2(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    cdf = rateOk ? roundCdf(toCdf(usd, rateNum)) : cdf
  } else if (cdf > 0 && rateOk) {
    usd = round2(toUsd(cdf, rateNum))
  }

  return {
    usd: round2(usd),
    cdf: roundCdf(cdf),
  }
}

function capPair(
  pair: MoneyPair,
  limit: MoneyPair,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = Math.min(pair.usd, limit.usd)
  let cdf =
    rateOk && usd > 0
      ? roundCdf(toCdf(usd, rateNum))
      : Math.min(pair.cdf, limit.cdf)

  if (usd <= 0 && cdf > 0 && rateOk) {
    usd = round2(toUsd(cdf, rateNum))
  }

  if (cdf <= 0 && usd > 0 && rateOk) {
    cdf = roundCdf(toCdf(usd, rateNum))
  }

  return {
    usd: round2(Math.max(0, usd)),
    cdf: roundCdf(Math.max(0, cdf)),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function createSupabaseClient(createClient: any): Promise<any> {
  if (!createClient) return null

  try {
    const raw = createClient(true)
    const instance = raw instanceof Promise ? await raw : raw

    return instance?.supabase || instance
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function resolveRateFromRow(row: any): number | null {
  return positiveNumber(
    row?.rate ??
      row?.usd_rate ??
      row?.taux ??
      row?.value ??
      row?.data?.rate ??
      row?.current?.rate
  )
}

async function getServerUsdRate(supabase: any): Promise<number | null> {
  if (!supabase) return null

  const attempts = [
    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('devise', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .limit(1)
        .maybeSingle(),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data
        const rate = resolveRateFromRow(row)

        if (rate) return round2(rate)
      }

      if (isMissingTableError(error)) {
        break
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err) {
      _logger.warn?.('Exception lecture exchange_rates', err)
    }
  }

  return null
}

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
    'id, nom, slug, prix, prix_usd, prix_cdf, prix_comparatif, stock, est_actif, delivery_config, poids_kg, longueur_cm, largeur_cm, hauteur_cm, variantes, variant_attributes, variant_config, images',

    'id, nom, slug, prix, prix_usd, prix_cdf, stock, est_actif, delivery_config, poids_kg, variantes, variant_attributes, images',

    'id, nom, prix, prix_usd, stock, est_actif, images, variantes, poids_kg',

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
        logger.warn?.('Table produits indisponible', error)
        return {}
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch produits', error)
    } catch (err) {
      logger.warn?.('Exception fetch produits', err)
    }
  }

  return {}
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ARTICLES COMMANDE                                              */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchOrderArticles(
  supabase: any,
  commandeId: string,
  logger: any
): Promise<any[]> {
  if (!supabase) return []

  const columnSets = [
    // Complet avec jointure produit
    'id, commande_id, produit_id, quantite, quantity, prix_unitaire, prix_unitaire_usd, prix_cdf, price_cdf, price, price_usd, unit_price_usd, specifications, variante, variant_attributes, variant_key, statut, status, statut_collecte, motif_refus, refusal_reason, code_acheteur, code_client, delivery_config_snapshot, poids_kg, produits (id, nom, slug, images, prix_usd, prix, prix_cdf, stock, est_actif, delivery_config, poids_kg)',

    // Sans delivery_config_snapshot / poids_kg
    'id, commande_id, produit_id, quantite, quantity, prix_unitaire, prix_unitaire_usd, prix_cdf, price_cdf, price, price_usd, unit_price_usd, specifications, variante, variant_attributes, variant_key, statut, status, statut_collecte, motif_refus, refusal_reason, code_acheteur, code_client, produits (id, nom, images, prix_usd, prix)',

    // Sans variant_key / statut article
    'id, commande_id, produit_id, quantite, prix_unitaire, prix_unitaire_usd, specifications, variante, variant_attributes, produits (nom, images)',

    // Legacy
    'id, commande_id, produit_id, quantite, prix_unitaire, specifications, variante, produits (nom, images)',

    // Ultra minimal sans jointure
    '*',
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from('commande_articles')
        .select(columns)
        .eq('commande_id', commandeId)

      if (!error && Array.isArray(data)) {
        return data
      }

      if (isMissingTableError(error)) {
        logger.warn?.('Table commande_articles indisponible', error)
        return []
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch commande_articles', error)
    } catch (err) {
      logger.warn?.('Exception fetch commande_articles', err)
    }
  }

  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TRANSACTIONS / PAIEMENT                                        */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchLatestPaymentTransaction(
  supabase: any,
  commandeId: string,
  logger: any
): Promise<any | null> {
  if (!supabase) return null

  const columnSets = [
    'id, status, method, provider, external_transaction_id, metadata, created_at, commande_id',
    '*',
  ]

  for (const columns of columnSets) {
    const attempts = [
      async () =>
        await supabase
          .from('transactions')
          .select(columns)
          .eq('commande_id', commandeId)
          .in('status', ['approved', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

      async () =>
        await supabase
          .from('transactions')
          .select(columns)
          .eq('commande_id', commandeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

      async () =>
        await supabase
          .from('transactions')
          .select(columns)
          .eq('commande_id', commandeId)
          .limit(1)
          .maybeSingle(),
    ]

    for (const attempt of attempts) {
      try {
        const { data, error } = await attempt()

        if (!error && data) {
          return data
        }

        if (isMissingTableError(error)) {
          return null
        }

        if (isMissingColumnError(error)) {
          continue
        }

        logger.warn?.('Erreur fetch transaction paiement', error)
      } catch (err) {
        logger.warn?.('Exception fetch transaction paiement', err)
      }
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const orderIdSchema = z
  .string()
  .min(1, 'Identifiant de commande requis')

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Détail commande                                          */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: any
) {
  await loadModules()

  const logger = _logger
  const getCurrentUser = _getCurrentUser
  const createClient = _createClient

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Params Next.js 14 / 15                                        */
    /* ------------------------------------------------------------ */

    const rawParams = context?.params
    const resolvedParams =
      rawParams instanceof Promise ? await rawParams : rawParams

    const rawId = resolvedParams?.id

    const parsedId = orderIdSchema.safeParse(rawId)

    if (!parsedId.success) {
      return NextResponse.json(
        {
          error: 'Identifiant de commande invalide',
          details: parsedId.error.flatten(),
        },
        { status: 400 }
      )
    }

    const commandeId = parsedId.data

    /* ------------------------------------------------------------ */
    /* Supabase                                                      */
    /* ------------------------------------------------------------ */

    const supabase = await createSupabaseClient(createClient)

    if (!supabase || typeof supabase.from !== 'function') {
      logger.error?.('Client Supabase invalide sur GET /api/commandes/[id]')

      return NextResponse.json(
        {
          error: 'Erreur de configuration interne',
          message:
            "Impossible de lier le client de base de données Supabase.",
        },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Commande principale                                           */
    /* ------------------------------------------------------------ */

    const { data: order, error: orderError } = await supabase
      .from('commandes')
      .select('*')
      .eq('id', commandeId)
      .eq('acheteur_id', user.id)
      .maybeSingle()

    if (orderError) {
      if (isMissingTableError(orderError)) {
        return NextResponse.json(
          { error: 'Commande introuvable' },
          { status: 404 }
        )
      }

      logger.error?.(
        'Erreur SQL lors du chargement de la commande',
        orderError
      )

      return NextResponse.json(
        {
          error: 'Erreur lors du chargement de la commande',
          details: orderError?.message,
        },
        { status: 500 }
      )
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Commande introuvable ou accès non autorisé' },
        { status: 404 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Taux serveur + taux commande                                  */
    /* ------------------------------------------------------------ */

    const serverRate = await getServerUsdRate(supabase)

    const storedRate =
      positiveNumber(order.exchange_rate) ??
      positiveNumber(order.shipping_rate_used) ??
      positiveNumber(order.rate) ??
      null

    const orderRate = serverRate ?? storedRate
    const rateNum = Number(orderRate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    /* ------------------------------------------------------------ */
    /* Articles                                                      */
    /* ------------------------------------------------------------ */

    const articleRows = await fetchOrderArticles(
      supabase,
      commandeId,
      logger
    )

    const productIds = [
      ...new Set(
        articleRows
          .map((row: any) => row?.produit_id)
          .filter(Boolean)
          .map((id: any) => String(id))
      ),
    ]

    const productsById = await fetchProductsByIds(
      supabase,
      productIds,
      logger
    )

    const articles = articleRows.map((row: any, index: number) => {
      const productId = row?.produit_id ? String(row.produit_id) : null

      const embeddedProduct =
        row?.produits || row?.products || row?.product || null

      const catalogProduct = productId
        ? productsById[productId] || null
        : null

      const product = embeddedProduct || catalogProduct

      const quantity = Math.max(
        1,
        Math.floor(Number(row?.quantite ?? row?.quantity ?? 1) || 1)
      )

      const usdSource = firstPositive(
        row?.prix_unitaire_usd,
        row?.unit_price_usd,
        row?.prix_usd,
        row?.price_usd,
        product?.prix_usd,
        product?.price_usd
      )

      const cdfSource = firstPositive(
        row?.prix_unitaire,
        row?.prix_cdf,
        row?.price_cdf,
        row?.price,
        product?.prix,
        product?.price,
        product?.prix_cdf
      )

      const unitPair = resolvePricePair(
        usdSource,
        cdfSource,
        orderRate
      )

      const linePair: MoneyPair = {
        usd: round2(unitPair.usd * quantity),
        cdf: roundCdf(unitPair.cdf * quantity),
      }

      const variantAttrs = extractVariantAttributes(row)
      const variantKey = stableVariantKeyFromAttributes(variantAttrs)

      const variantLabel =
        row?.specifications ||
        variantAttributesLabel(variantAttrs) ||
        (typeof row?.variante === 'string' ? row.variante : null)

      const image = getFirstImage(
        row?.image,
        row?.images,
        product?.images,
        product?.image
      )

      const status = normalizeArticleStatus(
        row?.statut_collecte ?? row?.status ?? row?.statut
      )

      return removeUndefined({
        id: String(row?.id || productId || `article-${index}`),
        produit_id: productId,

        nom: String(
          row?.nom ||
            product?.nom ||
            'Produit'
        ),

        quantite: quantity,
        quantity,

        prix_unitaire: unitPair.cdf,
        prix_cdf: unitPair.cdf,
        price_cdf: unitPair.cdf,

        prix_unitaire_usd: unitPair.usd,
        unit_price_usd: unitPair.usd,
        prix_usd: unitPair.usd,
        price_usd: unitPair.usd,

        line_total_usd: linePair.usd,
        line_total_cdf: linePair.cdf,

        specifications: variantLabel || null,
        variante: row?.variante ?? null,
        variant_attributes: variantAttrs || null,
        variant_key: variantKey || null,

        statut: status,
        status,
        statut_collecte:
          row?.statut_collecte ?? status,

        motif_refus:
          row?.motif_refus ||
          row?.refusal_reason ||
          null,
        refusal_reason:
          row?.refusal_reason ||
          row?.motif_refus ||
          null,

        code_acheteur:
          row?.code_acheteur ||
          row?.code_client ||
          null,
        code_client:
          row?.code_client ||
          row?.code_acheteur ||
          null,

        image,
        images: image ? [image] : [],

        delivery_config_snapshot:
          row?.delivery_config_snapshot ??
          product?.delivery_config ??
          null,

        poids_kg:
          row?.poids_kg ??
          product?.poids_kg ??
          null,
      })
    })

    const articlesSubtotalUsd = round2(
      articles.reduce((acc: number, article: any) => {
        return acc + Number(article.line_total_usd || 0)
      }, 0)
    )

    const articlesSubtotalCdfFallback = roundCdf(
      articles.reduce((acc: number, article: any) => {
        return acc + Number(article.line_total_cdf || 0)
      }, 0)
    )

    /* ------------------------------------------------------------ */
    /* Totaux serveur USD / CDF                                      */
    /* ------------------------------------------------------------ */

    const storedSubtotalUsd = firstPositive(
      order.subtotal_usd,
      order.subtotalUSD,
      order.sous_total_usd
    )

    const storedSubtotalCdf = firstPositive(
      order.subtotal_cdf,
      order.subtotalCDF,
      order.sous_total,
      order.subtotal
    )

    const subtotalPair = resolvePricePair(
      storedSubtotalUsd > 0
        ? storedSubtotalUsd
        : articlesSubtotalUsd,
      storedSubtotalCdf > 0
        ? storedSubtotalCdf
        : articlesSubtotalCdfFallback,
      orderRate
    )

    const discountRawPair = resolvePricePair(
      firstPositive(
        order.reduction_usd,
        order.remise_usd,
        order.discount_usd
      ),
      firstPositive(
        order.reduction_cdf,
        order.remise_cdf,
        order.reduction,
        order.discount
      ),
      orderRate
    )

    const discountPair = capPair(
      discountRawPair,
      subtotalPair,
      orderRate
    )

    const shippingPair = resolvePricePair(
      firstPositive(
        order.shipping_usd,
        order.frais_livraison_usd
      ),
      firstPositive(
        order.shipping_cdf,
        order.frais_livraison
      ),
      orderRate
    )

    const storedTotalUsd = firstPositive(
      order.total_usd,
      order.totalUSD
    )

    const storedTotalCdf = firstPositive(
      order.total_cdf,
      order.totalCDF,
      order.total_global,
      order.total
    )

    let totalPair: MoneyPair

    if (storedTotalUsd > 0) {
      totalPair = resolvePricePair(
        storedTotalUsd,
        storedTotalCdf,
        orderRate
      )
    } else if (
      subtotalPair.usd > 0 ||
      shippingPair.usd > 0 ||
      discountPair.usd > 0
    ) {
      const computedUsd = round2(
        Math.max(
          0,
          subtotalPair.usd - discountPair.usd + shippingPair.usd
        )
      )

      const computedCdf =
        rateOk && computedUsd > 0
          ? roundCdf(toCdf(computedUsd, rateNum))
          : roundCdf(
              Math.max(
                0,
                subtotalPair.cdf -
                  discountPair.cdf +
                  shippingPair.cdf
              )
            )

      totalPair = {
        usd: computedUsd,
        cdf: computedCdf,
      }
    } else if (storedTotalCdf > 0) {
      totalPair = resolvePricePair(
        0,
        storedTotalCdf,
        orderRate
      )
    } else {
      totalPair = {
        usd: 0,
        cdf: 0,
      }
    }

    if (rateOk && totalPair.usd > 0) {
      totalPair.cdf = roundCdf(toCdf(totalPair.usd, rateNum))
    } else if (
      rateOk &&
      totalPair.cdf > 0 &&
      totalPair.usd <= 0
    ) {
      totalPair.usd = round2(toUsd(totalPair.cdf, rateNum))
    }

    /* ------------------------------------------------------------ */
    /* Paiement / transaction                                        */
    /* ------------------------------------------------------------ */

    const paymentTx = await fetchLatestPaymentTransaction(
      supabase,
      commandeId,
      logger
    )

    const paymentMeta = parseMaybeJson(paymentTx?.metadata) || {}

    const paymentMethod =
      order.payment_method ||
      order.method ||
      paymentTx?.method ||
      paymentTx?.provider ||
      paymentMeta?.method ||
      paymentMeta?.provider ||
      null

    const paymentReference =
      order.payment_reference ||
      order.transaction_id ||
      order.external_transaction_id ||
      order.reference ||
      paymentTx?.external_transaction_id ||
      paymentTx?.id ||
      paymentMeta?.payment_reference ||
      paymentMeta?.externalId ||
      paymentMeta?.reference ||
      null

    const paymentStatus =
      paymentTx?.status ||
      paymentMeta?.status ||
      null

    /* ------------------------------------------------------------ */
    /* Livraison / points / codes                                    */
    /* ------------------------------------------------------------ */

    const typeLivraison = normalizeDeliveryMode(
      order.type_livraison || order.shipping_method
    )

    const pointRetraitNom =
      order.point_retrait_nom ||
      order.point_retrait?.nom ||
      null

    const pointRetraitAdresse =
      order.point_retrait_adresse ||
      order.point_retrait?.adresse ||
      null

    const pointRetrait =
      pointRetraitNom || pointRetraitAdresse
        ? {
            nom: String(pointRetraitNom || 'Point de retrait'),
            adresse: String(pointRetraitAdresse || ''),
          }
        : null

    const codeClient =
      order.code_client ||
      order.client_code ||
      order.code_livraison ||
      null

    const codeLivreur =
      order.code_livreur ||
      order.driver_code ||
      null

    const livreurRaw = parseMaybeJson(order.livreur)

    const livreur =
      livreurRaw && typeof livreurRaw === 'object'
        ? {
            nom: String(livreurRaw.nom || ''),
            prenom: String(livreurRaw.prenom || ''),
          }
        : order.livreur_nom || order.livreur_prenom
          ? {
              nom: String(order.livreur_nom || ''),
              prenom: String(order.livreur_prenom || ''),
            }
          : null

    const vendeurRaw = parseMaybeJson(order.vendeur)

    const vendeur =
      vendeurRaw && typeof vendeurRaw === 'object'
        ? {
            boutique_nom: String(
              vendeurRaw.boutique_nom ||
                vendeurRaw.nom ||
                ''
            ),
            telephone:
              vendeurRaw.telephone ||
              vendeurRaw.phone ||
              null,
          }
        : order.boutique_nom || order.boutique_telephone
          ? {
              boutique_nom: String(order.boutique_nom || ''),
              telephone: order.boutique_telephone || null,
            }
          : null

    /* ------------------------------------------------------------ */
    /* Réponse unifiée                                               */
    /* ------------------------------------------------------------ */

    const response = removeUndefined({
      id: String(order.id || commandeId),

      numero: String(
        order.numero_commande ||
          order.numero ||
          commandeId
      ),
      numero_commande: String(
        order.numero_commande ||
          order.numero ||
          commandeId
      ),

      statut: String(order.statut || order.status || 'en_attente'),
      status: String(order.statut || order.status || 'en_attente'),

      date: order.created_at || order.date || new Date().toISOString(),
      created_at: order.created_at || order.date || new Date().toISOString(),
      updated_at: order.updated_at || null,
      paid_at: order.paid_at || null,
      delivered_at: order.delivered_at || null,

      currency: order.currency || 'USD',

      type_livraison: typeLivraison,
      shipping_method: typeLivraison,

      adresse_livraison:
        order.adresse_livraison || order.address || null,
      address: order.adresse_livraison || order.address || null,

      commune_livraison_id: coerceId(order.commune_livraison_id),
      commune_livraison: order.commune_livraison || null,

      point_retrait_id: coerceId(order.point_retrait_id),
      point_retrait_nom: pointRetraitNom,
      point_retrait_adresse: pointRetraitAdresse,
      point_retrait_telephone: order.point_retrait_telephone || null,
      point_retrait: pointRetrait,

      delivery_note: order.delivery_note || null,
      message_cadeau:
        order.message_cadeau || order.gift_message || null,
      gift_message:
        order.message_cadeau || order.gift_message || null,

      express:
        Boolean(order.express) || typeLivraison === 'express',

      shipping_delay_label:
        order.shipping_delay_label || order.delay_label || null,
      delay_label:
        order.shipping_delay_label || order.delay_label || null,

      shipping_breakdown: parseMaybeJson(order.shipping_breakdown) || null,
      shipping_snapshot: parseMaybeJson(order.shipping_snapshot) || null,

      exchange_rate: orderRate,
      shipping_rate_used: orderRate,
      rate: orderRate,

      subtotal_usd: subtotalPair.usd,
      subtotal_cdf: subtotalPair.cdf,
      subtotalUSD: subtotalPair.usd,
      subtotalCDF: subtotalPair.cdf,
      subtotal: subtotalPair.cdf,
      sous_total: subtotalPair.cdf,
      sous_total_usd: subtotalPair.usd,

      reduction_usd: discountPair.usd,
      reduction_cdf: discountPair.cdf,
      remise_usd: discountPair.usd,
      remise_cdf: discountPair.cdf,
      discount_usd: discountPair.usd,
      discount_cdf: discountPair.cdf,
      reduction: discountPair.cdf,
      remise: discountPair.cdf,
      discount: discountPair.cdf,

      shipping_usd: shippingPair.usd,
      shipping_cdf: shippingPair.cdf,
      frais_livraison_usd: shippingPair.usd,
      frais_livraison: shippingPair.cdf,

      total_usd: totalPair.usd,
      total_cdf: totalPair.cdf,
      totalUSD: totalPair.usd,
      totalCDF: totalPair.cdf,
      total_global: totalPair.cdf,
      total: totalPair.cdf,

      payment_method: paymentMethod,
      method: paymentMethod,
      payment_reference: paymentReference,
      reference: paymentReference,
      transaction_id:
        order.transaction_id ||
        paymentTx?.id ||
        null,
      external_transaction_id:
        order.external_transaction_id ||
        paymentTx?.external_transaction_id ||
        null,
      payment_status: paymentStatus,

      code_client: codeClient,
      client_code: codeClient,
      code_livraison: codeClient,

      code_livreur: codeLivreur,
      driver_code: codeLivreur,

      mode_attribution: order.mode_attribution || null,
      livreur,
      vendeur,

      articles,
      commande_articles: articles,
    })

    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    logger.error?.('Crash GET /api/commandes/[id]', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}