// app/api/admin/commandes/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) && n > 0 ? n : null
}

function firstPositive(...values: unknown[]): number {
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

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux serveur.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas disponible.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
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
/*  SUPABASE ERROR HELPERS                                         */
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

function isMissingRelationError(error: any): boolean {
  const message = String(error?.message || '')

  return (
    /could not find the relationship|relationship .* does not exist|embedded resource .* not found/i.test(
      message
    )
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any> {
  const rawClient = await createClient(true)

  return rawClient?.supabase || rawClient
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROUTE PARAMS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

async function resolveRouteParams(context: any): Promise<{ id: string }> {
  const raw = context?.params
  const resolved = raw instanceof Promise ? await raw : raw

  return {
    id: String(resolved?.id || ''),
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
      logger.warn?.('Exception lecture exchange_rates admin détail', err)
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUS / DELIVERY                                              */
/* ═══════════════════════════════════════════════════════════════ */

const ADMIN_STATUTS = [
  'en_attente',
  'payee',
  'conditionnement_premium',
  'collecte',
  'en_livraison',
  'livree',
  'annulee',
  'refusee',
  'rembourse',
  'retour_demande',
] as const

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  payee: 'Payée',
  conditionnement_premium: 'Conditionnement Premium',
  collecte: 'Collecte',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
  refusee: 'Refusée',
  rembourse: 'Remboursée',
  retour_demande: 'Retour demandé',
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
/*  JSON / VARIANT HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

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

function cleanVariantAttributes(
  input: unknown
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

  return Object.keys(clean).length > 0 ? clean : null
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

      const clean = cleanVariantAttributes(attributes)

      if (clean) return clean
    }
  }

  return null
}

function variantLabelFromAttributes(
  attributes: Record<string, string> | null
): string | null {
  const clean = cleanVariantAttributes(attributes)

  if (!clean) return null

  const entries = Object.entries(clean)

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([key, value]) => `${key} : ${value}`).join(' · ')
}

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
/*  FETCH TOLÉRANT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchOrderArticles(
  supabase: any,
  commandeId: string
): Promise<any[]> {
  if (!supabase) return []

  const attempts = [
    '*, produit:produits(id, nom, slug, images, prix_usd, prix, prix_cdf, stock, est_actif, delivery_config, poids_kg)',
    '*, produits(id, nom, slug, images, prix_usd, prix, prix_cdf, stock, est_actif, delivery_config, poids_kg)',
    '*, product(id, nom, images, prix_usd, prix)',
    '*, produit:produits(nom, images)',
    '*, produits(nom, images)',
    '*',
  ]

  for (const select of attempts) {
    try {
      const { data, error } = await supabase
        .from('commande_articles')
        .select(select)
        .eq('commande_id', commandeId)

      if (!error && Array.isArray(data)) {
        return data
      }

      if (isMissingTableError(error)) {
        logger.warn?.('Table commande_articles indisponible', error)
        return []
      }

      if (isMissingColumnError(error) || isMissingRelationError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch commande_articles admin détail', error)
    } catch (err) {
      logger.warn?.('Exception fetch commande_articles admin détail', err)
    }
  }

  return []
}

async function fetchProfileById(
  supabase: any,
  profileId: string | null | undefined
): Promise<any | null> {
  if (!supabase || !profileId) return null

  const attempts = [
    'id, nom, prenom, email, telephone',
    'id, nom, prenom, email',
    '*',
  ]

  for (const select of attempts) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(select)
        .eq('id', profileId)
        .maybeSingle()

      if (!error && data) {
        return data
      }

      if (isMissingTableError(error)) {
        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch profile admin détail', error)
    } catch (err) {
      logger.warn?.('Exception fetch profile admin détail', err)
    }
  }

  return null
}

async function fetchTransactions(
  supabase: any,
  commande: any
): Promise<any[]> {
  if (!supabase || !commande?.id) return []

  const acheteurId = String(commande.acheteur_id || commande.client_id || '')

  const attempts: Array<() => Promise<any>> = [
    async () =>
      await supabase
        .from('transactions')
        .select('*')
        .eq('commande_id', commande.id)
        .order('created_at', { ascending: false })
        .limit(50),

    async () =>
      await supabase
        .from('transactions')
        .select('*')
        .filter('metadata->>commande_id', 'eq', commande.id)
        .order('created_at', { ascending: false })
        .limit(50),

    async () =>
      acheteurId
        ? await supabase
            .from('transactions')
            .select('*')
            .or(`from_user_id.eq.${acheteurId},to_user_id.eq.${acheteurId}`)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),

    async () =>
      await supabase
        .from('transactions')
        .select('*')
        .eq('commande_id', commande.id)
        .limit(50),
  ]

  for (const attempt of attempts) {
    try {
      const result = await attempt()
      const { data, error } = result || {}

      if (!error && Array.isArray(data)) {
        return data
      }

      if (isMissingTableError(error)) {
        return []
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch transactions admin détail', error)
    } catch (err) {
      logger.warn?.('Exception fetch transactions admin détail', err)
    }
  }

  return []
}

async function fetchStatusHistory(
  supabase: any,
  commandeId: string
): Promise<any[]> {
  if (!supabase) return []

  const tables = [
    'historique_statuts',
    'commande_statut_historique',
    'order_status_history',
  ]

  for (const table of tables) {
    const attempts = [
      async () =>
        await supabase
          .from(table)
          .select('*')
          .eq('commande_id', commandeId)
          .order('created_at', { ascending: false }),

      async () =>
        await supabase
          .from(table)
          .select('*')
          .eq('commande_id', commandeId),
    ]

    for (const attempt of attempts) {
      try {
        const { data, error } = await attempt()

        if (!error && Array.isArray(data)) {
          return data
        }

        if (isMissingTableError(error)) {
          break
        }

        if (isMissingColumnError(error)) {
          continue
        }

        logger.warn?.('Erreur fetch historique statut admin détail', error)
      } catch (err) {
        logger.warn?.('Exception fetch historique statut admin détail', err)
      }
    }
  }

  return []
}

async function fetchCommandMessages(
  supabase: any,
  commandeId: string
): Promise<any[]> {
  if (!supabase) return []

  const attempts = [
    'id, message, created_at, auteur:profiles!commande_messages_auteur_id_fkey(nom, prenom)',
    'id, message, created_at, auteur_id, profiles(nom, prenom)',
    'id, message, created_at, auteur(nom, prenom)',
    '*',
  ]

  for (const select of attempts) {
    try {
      const { data, error } = await supabase
        .from('commande_messages')
        .select(select)
        .eq('commande_id', commandeId)
        .order('created_at', { ascending: true })

      if (!error && Array.isArray(data)) {
        return data
      }

      if (isMissingTableError(error)) {
        return []
      }

      if (isMissingColumnError(error) || isMissingRelationError(error)) {
        continue
      }

      logger.warn?.('Erreur fetch messages commande admin détail', error)
    } catch (err) {
      logger.warn?.('Exception fetch messages commande admin détail', err)
    }
  }

  return []
}

async function fetchLivreur(
  supabase: any,
  commande: any
): Promise<any | null> {
  if (!commande) return null

  const livreurId = commande.livreur_id || commande.driver_id || null

  if (livreurId && supabase) {
    const attempts = [
      async () =>
        await supabase
          .from('livreurs')
          .select('id, nom, prenom, email')
          .eq('id', livreurId)
          .maybeSingle(),

      async () =>
        await supabase
          .from('livreurs')
          .select('id, nom, prenom')
          .eq('id', livreurId)
          .maybeSingle(),

      async () =>
        await supabase
          .from('profiles')
          .select('id, nom, prenom, email')
          .eq('id', livreurId)
          .maybeSingle(),
    ]

    for (const attempt of attempts) {
      try {
        const { data, error } = await attempt()

        if (!error && data) {
          return {
            id: String(data.id || livreurId),
            nom: String(data.nom || ''),
            prenom: String(data.prenom || ''),
            email: String(data.email || commande.livreur_email || ''),
          }
        }

        if (isMissingTableError(error)) {
          break
        }

        if (isMissingColumnError(error)) {
          continue
        }
      } catch (err) {
        logger.warn?.('Exception fetch livreur admin détail', err)
      }
    }
  }

  if (commande.livreur_nom || commande.livreur_prenom) {
    return {
      id: String(livreurId || ''),
      nom: String(commande.livreur_nom || ''),
      prenom: String(commande.livreur_prenom || ''),
      email: String(commande.livreur_email || ''),
    }
  }

  return null
}

async function fetchPointRetrait(
  supabase: any,
  commande: any
): Promise<any | null> {
  if (!commande) return null

  const pointId = commande.point_retrait_id || null

  if (pointId && supabase) {
    try {
      const { data, error } = await supabase
        .from('points_retrait')
        .select('*')
        .eq('id', pointId)
        .maybeSingle()

      if (!error && data) {
        return data
      }

      if (!isMissingTableError(error) && !isMissingColumnError(error)) {
        logger.warn?.('Erreur fetch point retrait admin détail', error)
      }
    } catch (err) {
      logger.warn?.('Exception fetch point retrait admin détail', err)
    }
  }

  const nom =
    commande.point_retrait_nom ||
    commande.point_retrait?.nom ||
    null

  const adresse =
    commande.point_retrait_adresse ||
    commande.point_retrait?.adresse ||
    null

  if (!nom && !adresse) return null

  return {
    id: pointId,
    nom: String(nom || 'Point de retrait'),
    adresse: String(adresse || ''),
    photo_url: commande.point_retrait_photo_url || null,
    telephone: commande.point_retrait_telephone || null,
    horaires: commande.point_retrait_horaires || null,
    points_de_repere: commande.point_retrait_points_de_repere || null,
    ville_nom: commande.point_retrait_ville_nom || null,
    province_nom: commande.point_retrait_province_nom || null,
    latitude: optionalNumber(commande.point_retrait_latitude) ?? null,
    longitude: optionalNumber(commande.point_retrait_longitude) ?? null,
    instructions_retrait: commande.point_retrait_instructions || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeArticle(raw: any, rate: number | null) {
  const product =
    raw?.produits || raw?.product || raw?.produit || null

  const quantity = Math.max(
    1,
    Math.floor(Number(raw?.quantite ?? raw?.quantity ?? 1) || 1)
  )

  const usdSource = firstPositive(
    raw?.prix_unitaire_usd,
    raw?.unit_price_usd,
    raw?.prix_usd,
    raw?.price_usd,
    product?.prix_usd,
    product?.price_usd
  )

  const cdfSource = firstPositive(
    raw?.prix_unitaire,
    raw?.prix_cdf,
    raw?.price_cdf,
    raw?.price,
    product?.prix,
    product?.price,
    product?.prix_cdf
  )

  const unitPair = resolvePricePair(usdSource, cdfSource, rate)

  const linePair: MoneyPair = {
    usd: round2(unitPair.usd * quantity),
    cdf: roundCdf(unitPair.cdf * quantity),
  }

  const attrs = extractVariantAttributes(raw)
  const variantLabel = variantLabelFromAttributes(attrs)

  const image = getFirstImage(
    raw?.image,
    raw?.images,
    product?.images,
    product?.image
  )

  return {
    id: String(raw?.id || raw?.produit_id || ''),
    produit_id: raw?.produit_id ? String(raw.produit_id) : null,

    nom: String(
      raw?.nom ||
        product?.nom ||
        raw?.produit?.nom ||
        raw?.products?.nom ||
        raw?.product?.nom ||
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

    specifications:
      raw?.specifications ||
      variantLabel ||
      (typeof raw?.variante === 'string' ? raw.variante : null) ||
      null,

    variante: raw?.variante ?? null,
    variant_attributes: attrs || null,
    variant_key: attrs ? JSON.stringify(attrs) : null,

    image,
    images: image ? [image] : [],

    statut: raw?.statut ?? raw?.status ?? null,
    statut_collecte: normalizeArticleStatus(
      raw?.statut_collecte ?? raw?.status ?? raw?.statut
    ),
    motif_refus: raw?.motif_refus || raw?.refusal_reason || null,

    code_acheteur: raw?.code_acheteur || raw?.code_client || null,
    code_vendeur: raw?.code_vendeur || raw?.vendeur_code || null,

    photo_preuve: raw?.photo_preuve || raw?.proof_image || null,
    vendeur_id: raw?.vendeur_id || raw?.seller_id || null,
  }
}

function normalizeTransaction(raw: any, rate: number | null) {
  const usdSource = optionalNumber(
    raw?.amount_usd ??
      raw?.montant_usd ??
      raw?.total_usd
  )

  const cdfSource = optionalNumber(
    raw?.montant ??
      raw?.amount_cdf ??
      raw?.amount
  )

  const rawAmount = optionalNumber(raw?.amount)

  const isNegative =
    (usdSource != null && usdSource < 0) ||
    (cdfSource != null && cdfSource < 0) ||
    (rawAmount != null && rawAmount < 0)

  const sign = isNegative ? -1 : 1

  const absUsd = Math.abs(usdSource ?? 0)
  const absCdf = Math.abs(cdfSource ?? rawAmount ?? 0)

  const pair = resolvePricePair(absUsd, absCdf, rate)

  const legacyCdf =
    cdfSource != null
      ? roundCdf(cdfSource)
      : pair.cdf > 0
        ? pair.cdf
        : 0

  return {
    id: raw?.id ? String(raw.id) : undefined,

    type: String(raw?.type || raw?.transaction_type || 'achat'),
    status: String(raw?.status || raw?.statut || '').toLowerCase() || null,
    method:
      raw?.method ||
      raw?.provider ||
      raw?.payment_method ||
      null,

    montant: legacyCdf * sign,
    montant_usd: pair.usd * sign,
    montant_cdf: pair.cdf * sign,
    amount_usd: pair.usd * sign,
    amount_cdf: pair.cdf * sign,

    description: String(raw?.description || raw?.label || ''),
    date: String(raw?.date || raw?.created_at || new Date().toISOString()),

    portefeuille_type: String(
      raw?.portefeuille_type || raw?.wallet_type || 'achat'
    ),

    utilisateur: String(
      raw?.utilisateur ||
        raw?.user?.nom ||
        raw?.user?.prenom ||
        raw?.username ||
        ''
    ),
  }
}

function normalizePointRetrait(raw: any): any | null {
  if (!raw) return null

  const nom = String(raw?.nom || raw?.point_retrait_nom || '').trim()
  const adresse = String(raw?.adresse || raw?.point_retrait_adresse || '').trim()

  if (!nom && !adresse) return null

  return {
    id: raw?.id ? String(raw.id) : null,
    nom: nom || 'Point de retrait',
    adresse,
    photo_url: raw?.photo_url ?? null,
    telephone: raw?.telephone ?? null,
    horaires: raw?.horaires ?? null,
    points_de_repere: raw?.points_de_repere ?? null,
    ville_nom: raw?.ville_nom ?? null,
    province_nom: raw?.province_nom ?? null,
    latitude: optionalNumber(raw?.latitude) ?? null,
    longitude: optionalNumber(raw?.longitude) ?? null,
    instructions_retrait: raw?.instructions_retrait ?? null,
  }
}

function normalizeMessage(raw: any): any {
  const auteur =
    raw?.auteur && !Array.isArray(raw.auteur)
      ? raw.auteur
      : Array.isArray(raw?.auteur)
        ? raw.auteur[0]
        : null

  const nom = String(
    auteur?.nom ||
      raw?.auteur_nom ||
      raw?.nom ||
      ''
  ).trim()

  const prenom = String(
    auteur?.prenom ||
      raw?.auteur_prenom ||
      raw?.prenom ||
      ''
  ).trim()

  return {
    id: String(raw?.id || ''),
    auteur: {
      nom: nom || 'Système',
      prenom,
    },
    message: String(raw?.message || ''),
    created_at: String(
      raw?.created_at || raw?.date || new Date().toISOString()
    ),
  }
}

function normalizeHistorique(raw: any): any {
  return {
    id: String(raw?.id || ''),
    ancien_statut: String(raw?.ancien_statut || raw?.old_status || ''),
    nouveau_statut: String(raw?.nouveau_statut || raw?.new_status || ''),
    commentaire: raw?.commentaire ?? raw?.comment ?? null,
    modified_by: String(raw?.modified_by || raw?.by || ''),
    created_at: String(
      raw?.created_at || raw?.date || new Date().toISOString()
    ),
  }
}

function computeStoredTotalPair(cmd: any, rate: number | null): MoneyPair {
  const usd = firstPositive(cmd?.total_usd, cmd?.totalUSD)
  const cdf = firstPositive(
    cmd?.total_cdf,
    cmd?.totalCDF,
    cmd?.total_global,
    cmd?.total
  )

  return resolvePricePair(usd, cdf, rate)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Détail commande admin                                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: any
) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-detail:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin détail commande.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const parsedId = z.string().min(1, 'ID requis').safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID commande invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const commandeId = parsedId.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select('*')
      .eq('id', commandeId)
      .maybeSingle()

    if (cmdError) {
      if (isMissingTableError(cmdError)) {
        return NextResponse.json(
          { error: 'Commande introuvable' },
          { status: 404 }
        )
      }

      logger.error?.('Erreur fetch commande admin détail', cmdError)

      return NextResponse.json(
        {
          error: 'Erreur lors du chargement de la commande',
          details: cmdError?.message,
        },
        { status: 500 }
      )
    }

    if (!commande) {
      return NextResponse.json(
        { error: 'Commande introuvable' },
        { status: 404 }
      )
    }

    const serverRate = await getServerUsdRate(supabase)

    const storedRate = positiveNumber(
      commande.exchange_rate ??
        commande.shipping_rate_used ??
        commande.rate
    )

    const rate = serverRate ?? storedRate ?? null
    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    const [
      articlesRaw,
      acheteurRaw,
      transactionsRaw,
      historiqueRaw,
      messagesRaw,
      livreurRaw,
      pointRetraitRaw,
    ] = await Promise.all([
      fetchOrderArticles(supabase, commandeId),
      fetchProfileById(
        supabase,
        commande.acheteur_id || commande.client_id || null
      ),
      fetchTransactions(supabase, commande),
      fetchStatusHistory(supabase, commandeId),
      fetchCommandMessages(supabase, commandeId),
      fetchLivreur(supabase, commande),
      fetchPointRetrait(supabase, commande),
    ])

    const articles = (articlesRaw || []).map((article: any) =>
      normalizeArticle(article, rate)
    )

    const articleQuantity = articles.reduce(
      (acc: number, article: any) => acc + Number(article.quantity || 1),
      0
    )

    const computedSubtotalUsd = round2(
      articles.reduce(
        (acc: number, article: any) => acc + Number(article.line_total_usd || 0),
        0
      )
    )

    const computedSubtotalCdfFallback = roundCdf(
      articles.reduce(
        (acc: number, article: any) => acc + Number(article.line_total_cdf || 0),
        0
      )
    )

    const storedSubtotalUsd = firstPositive(
      commande.subtotal_usd,
      commande.subtotalUSD,
      commande.sous_total_usd
    )

    const storedSubtotalCdf = firstPositive(
      commande.subtotal_cdf,
      commande.subtotalCDF,
      commande.sous_total,
      commande.subtotal
    )

    const subtotalPair = resolvePricePair(
      storedSubtotalUsd > 0 ? storedSubtotalUsd : computedSubtotalUsd,
      storedSubtotalCdf > 0 ? storedSubtotalCdf : computedSubtotalCdfFallback,
      rate
    )

    const discountRawPair = resolvePricePair(
      firstPositive(
        commande.reduction_usd,
        commande.remise_usd,
        commande.discount_usd
      ),
      firstPositive(
        commande.reduction_cdf,
        commande.remise_cdf,
        commande.remise,
        commande.discount
      ),
      rate
    )

    const discountPair = capPair(discountRawPair, subtotalPair, rate)

    const shippingPair = resolvePricePair(
      firstPositive(
        commande.shipping_usd,
        commande.frais_livraison_usd
      ),
      firstPositive(
        commande.shipping_cdf,
        commande.frais_livraison
      ),
      rate
    )

    let totalPair = computeStoredTotalPair(commande, rate)

    if (totalPair.usd <= 0 && totalPair.cdf <= 0) {
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

    const transactions = (transactionsRaw || []).map((tx: any) =>
      normalizeTransaction(tx, rate)
    )

    const latestTx = transactions[0] || null

    const historique_statuts = (historiqueRaw || []).map(normalizeHistorique)

    const messages = (messagesRaw || []).map(normalizeMessage)

    const point_retrait = normalizePointRetrait(pointRetraitRaw)

    const acheteur = acheteurRaw
      ? {
          id: String(acheteurRaw.id || commande.acheteur_id || ''),
          nom: String(acheteurRaw.nom || commande.acheteur_nom || ''),
          prenom: String(acheteurRaw.prenom || commande.acheteur_prenom || ''),
          email: String(acheteurRaw.email || commande.acheteur_email || ''),
          telephone:
            acheteurRaw.telephone ||
            commande.acheteur_telephone ||
            null,
        }
      : {
          id: String(commande.acheteur_id || commande.client_id || ''),
          nom: String(commande.acheteur_nom || ''),
          prenom: String(commande.acheteur_prenom || ''),
          email: String(commande.acheteur_email || ''),
          telephone: commande.acheteur_telephone || null,
        }

    const attributionRaw = String(commande.mode_attribution || '').toUpperCase()

    const modeAttribution =
      attributionRaw === 'ASSIGNE' || attributionRaw === 'LIBRE'
        ? attributionRaw
        : commande.livreur_id || livreurRaw
          ? 'ASSIGNE'
          : null

    const detail = {
      id: String(commande.id || commandeId),

      numero: String(
        commande.numero ||
          commande.numero_commande ||
          String(commande.id || commandeId).slice(0, 8)
      ),
      numero_commande: String(
        commande.numero ||
          commande.numero_commande ||
          String(commande.id || commandeId).slice(0, 8)
      ),

      statut: String(
        commande.statut || commande.status || 'en_attente'
      ).toLowerCase(),
      status: String(
        commande.statut || commande.status || 'en_attente'
      ).toLowerCase(),

      date:
        commande.date ||
        commande.created_at ||
        new Date().toISOString(),
      created_at:
        commande.date ||
        commande.created_at ||
        new Date().toISOString(),
      updated_at: commande.updated_at || null,
      paid_at: commande.paid_at || null,
      delivered_at: commande.delivered_at || null,

      type_livraison: normalizeDeliveryMode(
        commande.type_livraison || commande.shipping_method
      ),
      shipping_method: normalizeDeliveryMode(
        commande.type_livraison || commande.shipping_method
      ),

      adresse_livraison:
        commande.adresse_livraison || commande.address || null,
      address: commande.adresse_livraison || commande.address || null,

      point_retrait,

      code_client:
        commande.code_client ||
        commande.client_code ||
        commande.code_livraison ||
        null,
      client_code:
        commande.code_client ||
        commande.client_code ||
        commande.code_livraison ||
        null,
      code_livraison:
        commande.code_livraison ||
        commande.code_client ||
        commande.client_code ||
        null,

      code_livreur:
        commande.code_livreur ||
        commande.driver_code ||
        null,
      driver_code:
        commande.code_livreur ||
        commande.driver_code ||
        null,

      code_pin:
        commande.code_pin ||
        commande.pin_code ||
        null,

      numero_suivi:
        commande.numero_suivi ||
        commande.tracking_number ||
        null,

      note_interne:
        commande.note_interne ||
        commande.internal_note ||
        null,

      mode_attribution: modeAttribution,

      code_promo:
        commande.code_promo ||
        commande.promo_code ||
        null,
      promo_code:
        commande.promo_code ||
        commande.code_promo ||
        null,

      mode_paiement:
        commande.mode_paiement ||
        commande.payment_method ||
        commande.method ||
        latestTx?.method ||
        null,
      payment_method:
        commande.payment_method ||
        commande.mode_paiement ||
        commande.method ||
        latestTx?.method ||
        null,

      payment_reference:
        commande.payment_reference ||
        commande.transaction_id ||
        commande.external_transaction_id ||
        commande.reference ||
        latestTx?.id ||
        null,
      reference:
        commande.reference ||
        commande.payment_reference ||
        latestTx?.id ||
        null,

      payment_status:
        commande.payment_status ||
        latestTx?.status ||
        null,

      transaction_id:
        commande.transaction_id ||
        latestTx?.id ||
        null,
      external_transaction_id:
        commande.external_transaction_id ||
        null,

      exchange_rate: rate,
      shipping_rate_used: rate,
      rate,

      currency: 'USD',

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

      articles,
      commande_articles: articles,
      article_quantity: articleQuantity,

      acheteur,
      livreur: livreurRaw,
      transactions,
      historique_statuts,
      messages,
    }

    return NextResponse.json(detail)
  } catch (error: any) {
    logger.error?.(`Crash GET admin/commandes/${commandeId}`, error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin détail commande',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT – Changement de statut admin                               */
/* ═══════════════════════════════════════════════════════════════ */

const bulkStatusSchema = z.object({
  statut: z.enum(ADMIN_STATUTS),
  commentaire: z.string().max(500).optional(),
})

export async function PUT(
  request: Request,
  context: any
) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin mise à jour statut.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const parsedId = z.string().min(1, 'ID requis').safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID commande invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const commandeId = parsedId.data

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corps JSON invalide' },
      { status: 400 }
    )
  }

  const parsedBody = bulkStatusSchema.safeParse(body)

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'Données invalides',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { statut, commentaire } = parsedBody.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const oldAttempts = [
      'id, statut, acheteur_id, numero_commande, numero',
      'id, statut, acheteur_id, numero_commande',
      'id, statut, acheteur_id',
      '*',
    ]

    let oldCommand: any = null
    let lastFetchError: any = null

    for (const select of oldAttempts) {
      try {
        const { data, error } = await supabase
          .from('commandes')
          .select(select)
          .eq('id', commandeId)
          .maybeSingle()

        if (!error && data) {
          oldCommand = data
          break
        }

        lastFetchError = error

        if (isMissingTableError(error)) {
          return NextResponse.json(
            { error: 'Commande introuvable' },
            { status: 404 }
          )
        }

        if (isMissingColumnError(error)) {
          continue
        }

        logger.error?.('Erreur fetch ancienne commande admin PUT', error)
        break
      } catch (err) {
        lastFetchError = err
        logger.warn?.('Exception fetch ancienne commande admin PUT', err)
      }
    }

    if (!oldCommand) {
      return NextResponse.json(
        {
          error: 'Commande introuvable',
          details: lastFetchError?.message,
        },
        { status: 404 }
      )
    }

    const oldStatut = String(
      oldCommand.statut || oldCommand.status || ''
    ).toLowerCase()

    if (oldStatut === statut) {
      return NextResponse.json({
        success: true,
        updated: 0,
        statut,
        message: 'Statut inchangé',
      })
    }

    const now = new Date().toISOString()

    const updateAttempts = [
      {
        name: 'full',
        data: {
          statut,
          updated_at: now,
          commentaire_statut: commentaire || null,
        },
      },
      {
        name: 'no_comment',
        data: {
          statut,
          updated_at: now,
        },
      },
      {
        name: 'minimal',
        data: {
          statut,
        },
      },
    ]

    let updatedCommand: any = null
    let lastUpdateError: any = null

    for (const attempt of updateAttempts) {
      try {
        let query = supabase
          .from('commandes')
          .update(attempt.data)
          .eq('id', commandeId)

        if (oldStatut) {
          query = query.eq('statut', oldStatut)
        }

        const { data, error } = await query
          .select('id, statut')
          .maybeSingle()

        if (!error && data) {
          updatedCommand = data
          break
        }

        lastUpdateError = error

        if (isMissingColumnError(error)) {
          continue
        }

        if (!error && !data) {
          const { data: current } = await supabase
            .from('commandes')
            .select('statut, status')
            .eq('id', commandeId)
            .maybeSingle()

          const currentStatut = String(
            current?.statut || current?.status || ''
          ).toLowerCase()

          if (currentStatut === statut) {
            return NextResponse.json({
              success: true,
              updated: 0,
              statut,
              message: 'Statut déjà appliqué',
            })
          }

          return NextResponse.json(
            {
              error: 'Conflit de mise à jour du statut',
              details: 'La commande a probablement été modifiée entre temps.',
            },
            { status: 409 }
          )
        }

        logger.error?.(
          { error, attempt: attempt.name },
          'Échec mise à jour statut admin détail'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du statut',
            details: error?.message,
          },
          { status: 500 }
        )
      } catch (err: any) {
        lastUpdateError = err

        if (isMissingColumnError(err)) {
          continue
        }

        logger.error?.(
          { err, attempt: attempt.name },
          'Exception mise à jour statut admin détail'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du statut',
            details: err?.message,
          },
          { status: 500 }
        )
      }
    }

    if (!updatedCommand) {
      return NextResponse.json(
        {
          error: 'Aucune commande mise à jour',
          details: lastUpdateError?.message,
        },
        { status: 500 }
      )
    }

    const historyTables = [
      'historique_statuts',
      'commande_statut_historique',
      'order_status_history',
    ]

    const historyAttempts = [
      {
        commande_id: commandeId,
        ancien_statut: oldStatut,
        nouveau_statut: statut,
        commentaire: commentaire || 'Modification manuelle admin',
        modified_by: adminUser?.id || null,
        created_at: now,
      },
      {
        commande_id: commandeId,
        ancien_statut: oldStatut,
        nouveau_statut: statut,
        commentaire: commentaire || 'Modification manuelle admin',
        modified_by: adminUser?.id || null,
      },
      {
        commande_id: commandeId,
        ancien_statut: oldStatut,
        nouveau_statut: statut,
        commentaire: commentaire || 'Modification manuelle admin',
      },
      {
        commande_id: commandeId,
        ancien_statut: oldStatut,
        nouveau_statut: statut,
      },
    ]

    for (const table of historyTables) {
      let inserted = false

      for (const row of historyAttempts) {
        try {
          const { error } = await supabase
            .from(table)
            .insert(row)

          if (!error) {
            inserted = true
            break
          }

          if (isMissingColumnError(error)) {
            continue
          }

          if (isMissingTableError(error)) {
            break
          }

          logger.warn?.(
            { error, table },
            'Échec insertion historique statut admin détail'
          )
          break
        } catch (err) {
          logger.warn?.(
            { err, table },
            'Exception insertion historique statut admin détail'
          )
          break
        }
      }

      if (inserted) break
    }

    logger.info?.(
      {
        commandeId,
        ancien_statut: oldStatut,
        nouveau_statut: statut,
        admin_id: adminUser?.id || null,
      },
      'Statut commande admin modifié'
    )

    return NextResponse.json({
      success: true,
      updated: 1,
      statut,
      ancien_statut: oldStatut,
      label: STATUS_LABELS[statut] || statut,
    })
  } catch (error: any) {
    logger.error?.(`Crash PUT admin/commandes/${commandeId}`, error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin mise à jour statut',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}