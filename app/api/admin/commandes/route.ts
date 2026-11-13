// app/api/admin/commandes/route.ts
/**
 * API admin commandes
 * USD = source principale, CDF recalculé serveur
 * Filtrage, tri, pagination, stats, CSV, bulk status
 */
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"

import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"
import {
  sendEmail,
  sendSMS,
  createNotification,
} from "@/lib/notifications"

export const dynamic = "force-dynamic"

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Json = Record<string, any>

interface MoneyPair {
  usd: number
  cdf: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined

  const raw =
    typeof value === "string"
      ? value.replace(",", ".").trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  const raw =
    typeof value === "string"
      ? value.replace(",", ".").trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) && n > 0 ? n : null
}

function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  const raw =
    typeof value === "string"
      ? value.replace(",", ".").trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) && n >= 0 ? n : null
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
  const message = String(error?.message || "")

  return (
    code === "42P01" ||
    /relation .* does not exist|table .* does not exist|could not find the relationship/i.test(
      message
    )
  )
}

function isMissingColumnError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || "")

  return (
    code === "42703" ||
    code === "42701" ||
    /column .* does not exist|could not find the .* column|schema cache.*could not find/i.test(
      message
    )
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLIENT SUPABASE                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any> {
  const rawClient = await createClient(true)

  return rawClient?.supabase || rawClient
}

async function columnExists(
  supabase: any,
  table: string,
  column: string
): Promise<boolean> {
  if (!supabase) return false

  try {
    const { error } = await supabase
      .from(table)
      .select(column, { head: true, count: "exact" })
      .limit(1)

    if (!error) return true

    if (isMissingColumnError(error) || isMissingTableError(error)) {
      return false
    }

    return false
  } catch {
    return false
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
        .from("exchange_rates")
        .select("*")
        .eq("currency", "USD")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from("exchange_rates")
        .select("*")
        .eq("devise", "USD")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from("exchange_rates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from("exchange_rates")
        .select("*")
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
      logger.warn?.("Exception lecture exchange_rates admin commandes", err)
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUS / DELIVERY                                              */
/* ═══════════════════════════════════════════════════════════════ */

const STATUS_LABELS: Record<string, string> = {
  en_attente: "En attente",
  payee: "Payée",
  conditionnement_premium: "Conditionnement Premium",
  collecte: "Collecte",
  en_livraison: "En livraison",
  livree: "Livrée",
  annulee: "Annulée",
  refusee: "Refusée",
  rembourse: "Remboursée",
  retour_demande: "Retour demandé",
}

function normalizeDeliveryMode(value: any): string {
  const raw = String(value || "").trim()

  if (raw === "point_retrait" || raw === "pickup" || raw === "relais") {
    return "point_retrait"
  }

  if (raw === "express" || raw === "same_day" || raw === "jour_meme") {
    return "express"
  }

  return "domicile"
}

function normalizeSortKey(value: unknown): string {
  const raw = String(value || "created_at").trim().toLowerCase()

  if (["created_at", "date", "createdat"].includes(raw)) return "created_at"
  if (
    [
      "total",
      "total_usd",
      "total_cdf",
      "total_global",
      "montant",
      "amount",
    ].includes(raw)
  ) {
    return "total"
  }
  if (["statut", "status"].includes(raw)) return "statut"
  if (["numero", "numero_commande", "number", "n°"].includes(raw)) {
    return "numero_commande"
  }

  return raw || "created_at"
}

/* ═══════════════════════════════════════════════════════════════ */
/*  JSON / VARIANT HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function parseMaybeJson(value: any): any {
  if (value === null || value === undefined) return null

  if (typeof value === "object") return value

  const raw = String(value || "").trim()
  if (!raw) return null

  if (
    (raw.startsWith("{") && raw.endsWith("}")) ||
    (raw.startsWith("[") && raw.endsWith("]"))
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
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null
  }

  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(input)) {
    const cleanKey = String(key || "").trim()

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

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
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

  return entries.map(([key, value]) => `${key} : ${value}`).join(" · ")
}

function getFirstImage(...sources: any[]): string | null {
  for (const source of sources) {
    if (!source) continue

    if (typeof source === "string" && source.trim()) {
      return source
    }

    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === "string" && item.trim()) {
          return item
        }

        if (item && typeof item === "object") {
          const url =
            item.url ||
            item.src ||
            item.path ||
            item.public_url ||
            item.image

          if (typeof url === "string" && url.trim()) {
            return url
          }
        }
      }
    }

    if (typeof source === "object") {
      const url =
        source.url ||
        source.src ||
        source.path ||
        source.public_url ||
        source.image

      if (typeof url === "string" && url.trim()) {
        return url
      }
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ARTICLES / PROFILS                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchArticlesForCommands(
  supabase: any,
  commandIds: string[]
): Promise<Record<string, any[]>> {
  if (!supabase || commandIds.length === 0) return {}

  const columnSets = [
    "id, commande_id, produit_id, quantite, quantity, prix_unitaire, prix_unitaire_usd, prix_cdf, price_cdf, price, price_usd, unit_price_usd, specifications, variante, variant_attributes, variant_key, statut, status, statut_collecte, motif_refus, refusal_reason, code_acheteur, code_client, produits (id, nom, slug, images, prix_usd, prix, prix_cdf, stock, est_actif, delivery_config, poids_kg)",

    "id, commande_id, produit_id, quantite, quantity, prix_unitaire, prix_unitaire_usd, specifications, variante, variant_attributes, produits (id, nom, images, prix_usd, prix)",

    "id, commande_id, produit_id, quantite, prix_unitaire, prix_unitaire_usd, specifications, variante, produits (nom, images)",

    "id, commande_id, produit_id, quantite, prix_unitaire, produits (nom)",

    "*",
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from("commande_articles")
        .select(columns)
        .in("commande_id", commandIds)

      if (!error && Array.isArray(data)) {
        const map: Record<string, any[]> = {}

        for (const article of data) {
          const cmdId = String(article?.commande_id || "")
          if (!cmdId) continue

          if (!map[cmdId]) map[cmdId] = []
          map[cmdId].push(article)
        }

        return map
      }

      if (isMissingTableError(error)) {
        logger.warn?.("Table commande_articles indisponible", error)
        return {}
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.("Erreur fetch commande_articles admin", error)
    } catch (err) {
      logger.warn?.("Exception fetch commande_articles admin", err)
    }
  }

  return {}
}

async function fetchProfilesByIds(
  supabase: any,
  ids: string[]
): Promise<Record<string, any>> {
  if (!supabase || ids.length === 0) return {}

  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))]

  const columnSets = [
    "id, nom, prenom, email, telephone",
    "id, nom, prenom, email",
    "*",
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(columns)
        .in("id", uniqueIds)

      if (!error && Array.isArray(data)) {
        const map: Record<string, any> = {}

        for (const profile of data) {
          if (profile?.id) {
            map[String(profile.id)] = profile
          }
        }

        return map
      }

      if (isMissingTableError(error)) {
        logger.warn?.("Table profiles indisponible", error)
        return {}
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.("Erreur fetch profiles admin", error)
    } catch (err) {
      logger.warn?.("Exception fetch profiles admin", err)
    }
  }

  return {}
}

async function searchProfileIds(
  supabase: any,
  term: string
): Promise<string[]> {
  if (!supabase || !term.trim()) return []

  const encoded = encodeURIComponent(`%${term.trim()}%`)

  const columnSets = [
    "id",
    "id, email, nom, prenom",
    "*",
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(columns)
        .or(
          `email.ilike.${encoded},nom.ilike.${encoded},prenom.ilike.${encoded}`
        )
        .limit(100)

      if (!error && Array.isArray(data)) {
        return data
          .map((p: any) => String(p?.id || ""))
          .filter(Boolean)
      }

      if (isMissingTableError(error)) {
        return []
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn?.("Erreur recherche profils admin", error)
    } catch (err) {
      logger.warn?.("Exception recherche profils admin", err)
    }
  }

  return []
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
    id: String(raw?.id || raw?.produit_id || ""),
    produit_id: raw?.produit_id ? String(raw.produit_id) : null,

    nom: String(
      raw?.nom ||
        product?.nom ||
        raw?.produit?.nom ||
        raw?.products?.nom ||
        raw?.product?.nom ||
        "Produit"
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
      (typeof raw?.variante === "string" ? raw.variante : null) ||
      null,

    variante: raw?.variante ?? null,
    variant_attributes: attrs || null,
    variant_key: attrs ? JSON.stringify(attrs) : null,

    image,
    images: image ? [image] : [],

    statut: raw?.statut ?? raw?.status ?? null,
    statut_collecte: raw?.statut_collecte ?? null,
    motif_refus: raw?.motif_refus || raw?.refusal_reason || null,

    code_acheteur: raw?.code_acheteur || raw?.code_client || null,
    code_vendeur: raw?.code_vendeur || raw?.vendeur_code || null,
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

function normalizeAdminCommand(
  cmd: any,
  articlesRaw: any[],
  acheteur: any,
  serverRate: number | null
) {
  const storedRate = positiveNumber(
    cmd?.exchange_rate ?? cmd?.shipping_rate_used ?? cmd?.rate
  )

  const rate = serverRate ?? storedRate ?? null
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const articles = (articlesRaw || []).map((a) => normalizeArticle(a, rate))

  const articleQuantity = articles.reduce(
    (acc, a) => acc + Number(a.quantity || 1),
    0
  )

  const computedSubtotalUsd = round2(
    articles.reduce((acc, a) => acc + Number(a.line_total_usd || 0), 0)
  )

  const computedSubtotalCdfFallback = roundCdf(
    articles.reduce((acc, a) => acc + Number(a.line_total_cdf || 0), 0)
  )

  const storedSubtotalUsd = firstPositive(
    cmd?.subtotal_usd,
    cmd?.subtotalUSD,
    cmd?.sous_total_usd
  )

  const storedSubtotalCdf = firstPositive(
    cmd?.subtotal_cdf,
    cmd?.subtotalCDF,
    cmd?.sous_total,
    cmd?.subtotal
  )

  const subtotalPair = resolvePricePair(
    storedSubtotalUsd > 0 ? storedSubtotalUsd : computedSubtotalUsd,
    storedSubtotalCdf > 0 ? storedSubtotalCdf : computedSubtotalCdfFallback,
    rate
  )

  const discountRawPair = resolvePricePair(
    firstPositive(
      cmd?.reduction_usd,
      cmd?.remise_usd,
      cmd?.discount_usd
    ),
    firstPositive(
      cmd?.reduction_cdf,
      cmd?.remise_cdf,
      cmd?.remise,
      cmd?.discount
    ),
    rate
  )

  const discountPair = capPair(discountRawPair, subtotalPair, rate)

  const shippingPair = resolvePricePair(
    firstPositive(cmd?.shipping_usd, cmd?.frais_livraison_usd),
    firstPositive(cmd?.shipping_cdf, cmd?.frais_livraison),
    rate
  )

  let totalPair = computeStoredTotalPair(cmd, rate)

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
              subtotalPair.cdf - discountPair.cdf + shippingPair.cdf
            )
          )

    totalPair = {
      usd: computedUsd,
      cdf: computedCdf,
    }
  }

  if (rateOk && totalPair.usd > 0) {
    totalPair.cdf = roundCdf(toCdf(totalPair.usd, rateNum))
  } else if (rateOk && totalPair.cdf > 0 && totalPair.usd <= 0) {
    totalPair.usd = round2(toUsd(totalPair.cdf, rateNum))
  }

  const acheteurObj = acheteur || cmd?.acheteur || {}

  const livreurRaw =
    cmd?.livreur ||
    (cmd?.livreur_id
      ? {
          id: cmd.livreur_id,
          nom: cmd?.livreur_nom || "",
          prenom: cmd?.livreur_prenom || "",
          email: cmd?.livreur_email || "",
        }
      : null)

  const livreur =
    livreurRaw && (livreurRaw.id || livreurRaw.nom || livreurRaw.prenom)
      ? {
          id: String(livreurRaw.id || ""),
          nom: String(livreurRaw.nom || ""),
          prenom: String(livreurRaw.prenom || ""),
          email: String(livreurRaw.email || ""),
        }
      : null

  const attributionRaw = String(cmd?.mode_attribution || "").toUpperCase()

  return {
    id: String(cmd?.id || ""),

    numero: String(
      cmd?.numero ||
        cmd?.numero_commande ||
        String(cmd?.id || "").slice(0, 8)
    ),
    numero_commande: String(
      cmd?.numero ||
        cmd?.numero_commande ||
        String(cmd?.id || "").slice(0, 8)
    ),

    statut: String(cmd?.statut || cmd?.status || "en_attente").toLowerCase(),
    status: String(cmd?.statut || cmd?.status || "en_attente").toLowerCase(),

    date: cmd?.date || cmd?.created_at || new Date().toISOString(),
    created_at: cmd?.date || cmd?.created_at || new Date().toISOString(),

    type_livraison: normalizeDeliveryMode(
      cmd?.type_livraison || cmd?.shipping_method
    ),
    shipping_method: normalizeDeliveryMode(
      cmd?.type_livraison || cmd?.shipping_method
    ),

    adresse_livraison: cmd?.adresse_livraison || cmd?.address || null,
    address: cmd?.adresse_livraison || cmd?.address || null,

    point_retrait: cmd?.point_retrait || null,

    code_client:
      cmd?.code_client ||
      cmd?.client_code ||
      cmd?.code_livraison ||
      null,
    client_code:
      cmd?.code_client ||
      cmd?.client_code ||
      cmd?.code_livraison ||
      null,
    code_livraison:
      cmd?.code_livraison ||
      cmd?.code_client ||
      cmd?.client_code ||
      null,

    code_livreur: cmd?.code_livreur || cmd?.driver_code || null,
    driver_code: cmd?.code_livreur || cmd?.driver_code || null,

    mode_attribution:
      attributionRaw === "ASSIGNE" || attributionRaw === "LIBRE"
        ? attributionRaw
        : null,

    numero_suivi: cmd?.numero_suivi || cmd?.tracking_number || null,
    note_interne: cmd?.note_interne || cmd?.internal_note || null,

    mode_paiement:
      cmd?.mode_paiement ||
      cmd?.payment_method ||
      cmd?.method ||
      null,
    payment_method:
      cmd?.payment_method ||
      cmd?.mode_paiement ||
      cmd?.method ||
      null,

    code_promo: cmd?.code_promo || cmd?.promo_code || null,
    promo_code: cmd?.promo_code || cmd?.code_promo || null,

    exchange_rate: rate,
    shipping_rate_used: rate,
    rate,

    currency: "USD",

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

    acheteur: {
      id: String(
        acheteurObj?.id ||
          cmd?.acheteur_id ||
          cmd?.client_id ||
          ""
      ),
      nom: String(
        acheteurObj?.nom ||
          cmd?.acheteur_nom ||
          cmd?.client_nom ||
          ""
      ),
      prenom: String(
        acheteurObj?.prenom ||
          cmd?.acheteur_prenom ||
          cmd?.client_prenom ||
          ""
      ),
      email: String(
        acheteurObj?.email ||
          cmd?.acheteur_email ||
          cmd?.client_email ||
          ""
      ),
      telephone:
        acheteurObj?.telephone ||
        cmd?.acheteur_telephone ||
        cmd?.client_telephone ||
        null,
    },

    livreur,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15_000

function getCache(key: string) {
  const entry = cache.get(key)

  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }

  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const getQuerySchema = z.object({
  search: z.string().optional().default(""),

  statut: z.string().optional().default(""),
  status: z.string().optional(),

  date_debut: z.string().optional().default(""),
  date_fin: z.string().optional().default(""),

  type_livraison: z.string().optional().default(""),
  livraison: z.string().optional().default(""),

  sort_by: z.string().optional().default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),

  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),

  min: z.coerce.number().finite().nonnegative().optional(),
  max: z.coerce.number().finite().nonnegative().optional(),

  min_usd: z.coerce.number().finite().nonnegative().optional(),
  max_usd: z.coerce.number().finite().nonnegative().optional(),

  min_total: z.coerce.number().finite().nonnegative().optional(),
  max_total: z.coerce.number().finite().nonnegative().optional(),

  format: z.enum(["json", "csv"]).optional().default("json"),
})

const bulkStatusSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "Au moins un ID requis"),

  statut: z.enum([
    "en_attente",
    "payee",
    "conditionnement_premium",
    "collecte",
    "en_livraison",
    "livree",
    "annulee",
    "refusee",
    "rembourse",
    "retour_demande",
  ]),

  commentaire: z.string().max(500).optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  CSV                                                            */
/* ═══════════════════════════════════════════════════════════════ */

function escapeCsv(value: any): string {
  const s = value == null ? "" : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function buildAdminCsv(commands: any[]): string {
  const headers = [
    "Numéro",
    "Client",
    "Email",
    "Téléphone",
    "Total USD",
    "Total CDF",
    "Sous-total USD",
    "Sous-total CDF",
    "Livraison USD",
    "Livraison CDF",
    "Remise USD",
    "Remise CDF",
    "Statut",
    "Livraison",
    "Date",
    "Livreur",
    "Suivi",
    "Mode paiement",
    "Code promo",
    "Code client",
    "Code livreur",
    "Attribution",
    "Taux",
    "Articles",
  ]

  const rows = commands.map((c) => [
    c.numero,
    `${c.acheteur?.prenom || ""} ${c.acheteur?.nom || ""}`.trim(),
    c.acheteur?.email || "",
    c.acheteur?.telephone || "",
    Number(c.total_usd || 0).toFixed(2),
    String(Math.round(Number(c.total_cdf || c.total_global || 0))),
    Number(c.subtotal_usd || 0).toFixed(2),
    String(Math.round(Number(c.subtotal_cdf || c.sous_total || 0))),
    Number(c.shipping_usd || 0).toFixed(2),
    String(Math.round(Number(c.shipping_cdf || c.frais_livraison || 0))),
    Number(c.reduction_usd || 0).toFixed(2),
    String(Math.round(Number(c.reduction_cdf || c.remise || 0))),
    c.statut,
    c.type_livraison,
    c.date,
    c.livreur ? `${c.livreur.prenom || ""} ${c.livreur.nom || ""}`.trim() : "",
    c.numero_suivi || "",
    c.mode_paiement || "",
    c.code_promo || "",
    c.code_client || "",
    c.code_livreur || "",
    c.mode_attribution || "",
    c.exchange_rate ? Number(c.exchange_rate).toFixed(2) : "",
    (c.articles || [])
      .map(
        (a: any) =>
          `${a.nom} x${a.quantite} ($${Number(
            a.line_total_usd || 0
          ).toFixed(2)} ≈ ${Math.round(
            Number(a.line_total_cdf || 0)
          )} FC)`
      )
      .join("; "),
  ])

  return [headers, ...rows]
    .map((r) => r.map(escapeCsv).join(","))
    .join("\n")
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste admin                                              */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-cmd:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: "Trop de requêtes admin commandes." },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Accès non autorisé" },
      { status: err?.status || 403 }
    )
  }

  const { searchParams } = new URL(request.url)

  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Paramètres invalides",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== "function") {
    return NextResponse.json(
      { error: "Configuration Supabase invalide" },
      { status: 500 }
    )
  }

  const serverRate = await getServerUsdRate(supabase)
  const rateNum = Number(serverRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const search = String(parsed.data.search || "").trim()
  const statut = String(parsed.data.statut || parsed.data.status || "").trim()
  const typeLivraison = String(
    parsed.data.type_livraison || parsed.data.livraison || ""
  ).trim()

  const dateDebut = String(parsed.data.date_debut || "").trim()
  const dateFin = String(parsed.data.date_fin || "").trim()

  const page = Number(parsed.data.page || 1)
  const limit = Number(parsed.data.limit || 10)
  const offset = (page - 1) * limit

  const sortKey = normalizeSortKey(parsed.data.sort_by)
  const sortOrder = parsed.data.sort_order

  const format = parsed.data.format

  /* ------------------------------------------------------------ */
  /* Montants : USD principal, CDF legacy fallback                 */
  /* ------------------------------------------------------------ */

  const minUsdInput = nonNegativeNumber(parsed.data.min_usd)
  const maxUsdInput = nonNegativeNumber(parsed.data.max_usd)

  const minCdfInput =
    nonNegativeNumber(parsed.data.min) ??
    nonNegativeNumber(parsed.data.min_total)

  const maxCdfInput =
    nonNegativeNumber(parsed.data.max) ??
    nonNegativeNumber(parsed.data.max_total)

  let minUsd = minUsdInput != null ? round2(minUsdInput) : null
  let maxUsd = maxUsdInput != null ? round2(maxUsdInput) : null

  let minCdf = minCdfInput != null ? roundCdf(minCdfInput) : null
  let maxCdf = maxCdfInput != null ? roundCdf(maxCdfInput) : null

  if (minUsd != null) {
    minCdf = rateOk ? roundCdf(toCdf(minUsd, rateNum)) : minCdf
  }

  if (maxUsd != null) {
    maxCdf = rateOk ? roundCdf(toCdf(maxUsd, rateNum)) : maxCdf
  }

  if (minUsd == null && minCdf != null && rateOk) {
    minUsd = round2(toUsd(minCdf, rateNum))
  }

  if (maxUsd == null && maxCdf != null && rateOk) {
    maxUsd = round2(toUsd(maxCdf, rateNum))
  }

  /* ------------------------------------------------------------ */
  /* Cache                                                         */
  /* ------------------------------------------------------------ */

  const cacheKey = `admin-cmd:${JSON.stringify({
    search,
    statut,
    typeLivraison,
    dateDebut,
    dateFin,
    sortKey,
    sortOrder,
    page,
    limit,
    minUsd,
    maxUsd,
    minCdf,
    maxCdf,
    format,
    rate: serverRate,
  })}`

  if (format === "json") {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const hasTotalUsd = await columnExists(
      supabase,
      "commandes",
      "total_usd"
    )

    const searchProfileIds = search
      ? await searchProfileIds(supabase, search)
      : []

    const applyBaseFilters = (query: any) => {
      if (statut) query = query.eq("statut", statut)

      if (typeLivraison) {
        query = query.eq("type_livraison", typeLivraison)
      }

      if (dateDebut) {
        query = query.gte("created_at", dateDebut)
      }

      if (dateFin) {
        query = query.lte("created_at", `${dateFin}T23:59:59`)
      }

      if (search) {
        const encoded = encodeURIComponent(`%${search}%`)
        const parts = [`numero_commande.ilike.${encoded}`]

        if (searchProfileIds.length > 0) {
          parts.push(`acheteur_id.in.(${searchProfileIds.join(",")})`)
        }

        query = query.or(parts.join(","))
      }

      return query
    }

    const applyAmountFilters = (query: any) => {
      if (minUsd != null) {
        if (hasTotalUsd) {
          query = query.gte("total_usd", minUsd)
        } else if (minCdf != null) {
          query = query.gte("total_global", minCdf)
        }
      } else if (minCdf != null) {
        if (hasTotalUsd && rateOk) {
          query = query.gte("total_usd", round2(toUsd(minCdf, rateNum)))
        } else {
          query = query.gte("total_global", minCdf)
        }
      }

      if (maxUsd != null) {
        if (hasTotalUsd) {
          query = query.lte("total_usd", maxUsd)
        } else if (maxCdf != null) {
          query = query.lte("total_global", maxCdf)
        }
      } else if (maxCdf != null) {
        if (hasTotalUsd && rateOk) {
          query = query.lte("total_usd", round2(toUsd(maxCdf, rateNum)))
        } else {
          query = query.lte("total_global", maxCdf)
        }
      }

      return query
    }

    const orderColumn =
      sortKey === "total"
        ? hasTotalUsd
          ? "total_usd"
          : "total_global"
        : sortKey === "statut"
          ? "statut"
          : sortKey === "numero_commande"
            ? "numero_commande"
            : "created_at"

    /* ------------------------------------------------------------ */
    /* Page principale                                               */
    /* ------------------------------------------------------------ */

    let pageQuery = supabase
      .from("commandes")
      .select("*", { count: "exact" })

    pageQuery = applyBaseFilters(pageQuery)
    pageQuery = applyAmountFilters(pageQuery)
    pageQuery = pageQuery.order(orderColumn, {
      ascending: sortOrder === "asc",
    })
    pageQuery = pageQuery.range(offset, offset + limit - 1)

    let { data: rows, error: rowsError, count } = await pageQuery

    if (rowsError) {
      logger.error?.("Erreur requête admin commandes", rowsError)

      if (isMissingColumnError(rowsError)) {
        let fallbackQuery = supabase
          .from("commandes")
          .select("*", { count: "exact" })

        fallbackQuery = applyBaseFilters(fallbackQuery)
        fallbackQuery = fallbackQuery.order("created_at", {
          ascending: false,
        })
        fallbackQuery = fallbackQuery.range(offset, offset + limit - 1)

        const fallback = await fallbackQuery

        if (fallback.error) {
          return NextResponse.json(
            {
              error: "Erreur SQL admin commandes",
              details: fallback.error.message,
            },
            { status: 500 }
          )
        }

        rows = fallback.data
        count = fallback.count
      } else {
        return NextResponse.json(
          {
            error: "Erreur SQL admin commandes",
            details: rowsError.message,
          },
          { status: 500 }
        )
      }
    }

    const commandIds = (rows || [])
      .map((r: any) => String(r?.id || ""))
      .filter(Boolean)

    const acheteurIds = (rows || [])
      .map((r: any) => String(r?.acheteur_id || r?.client_id || ""))
      .filter(Boolean)

    const [articlesByCmd, acheteursById] = await Promise.all([
      fetchArticlesForCommands(supabase, commandIds),
      fetchProfilesByIds(supabase, acheteurIds),
    ])

    const commandes = (rows || []).map((cmd: any) =>
      normalizeAdminCommand(
        cmd,
        articlesByCmd[String(cmd?.id || "")] || [],
        acheteursById[String(cmd?.acheteur_id || cmd?.client_id || "")] ||
          cmd?.acheteur ||
          {},
        serverRate
      )
    )

    /* ------------------------------------------------------------ */
    /* Stats filtrées (échantillon max 1000)                         */
    /* ------------------------------------------------------------ */

    let statsRows: any[] = []
    let filteredCount = Number(count || 0)
    let statsTruncated = false

    try {
      let statsQuery = supabase
        .from("commandes")
        .select("*", { count: "exact" })

      statsQuery = applyBaseFilters(statsQuery)
      statsQuery = applyAmountFilters(statsQuery)
      statsQuery = statsQuery.limit(1000)

      const statsResult = await statsQuery

      if (!statsResult.error) {
        statsRows = Array.isArray(statsResult.data) ? statsResult.data : []
        filteredCount = Number(statsResult.count ?? count ?? statsRows.length)
        statsTruncated = statsRows.length < filteredCount
      }
    } catch (err) {
      logger.warn?.("Erreur stats admin commandes", err)
    }

    let filteredSumUsd = 0
    let filteredSumCdf = 0

    for (const row of statsRows) {
      const pair = computeStoredTotalPair(row, serverRate)
      filteredSumUsd += pair.usd
      filteredSumCdf += pair.cdf
    }

    filteredSumUsd = round2(filteredSumUsd)
    filteredSumCdf = roundCdf(filteredSumCdf)

    const statsSampleCount = statsRows.length || 1
    const panierMoyenUsd = round2(filteredSumUsd / statsSampleCount)
    const panierMoyenCdf = roundCdf(filteredSumCdf / statsSampleCount)

    /* ------------------------------------------------------------ */
    /* Stats globales jour / attente                                 */
    /* ------------------------------------------------------------ */

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    let commandesJour = 0
    let caJourUsd = 0
    let caJourCdf = 0
    let enAttente = 0

    try {
      const [todayCountRes, todayLivreeRes, enAttenteRes] =
        await Promise.all([
          supabase
            .from("commandes")
            .select("*", { count: "exact", head: true })
            .gte("created_at", todayStart.toISOString())
            .lte("created_at", todayEnd.toISOString()),

          supabase
            .from("commandes")
            .select("*")
            .eq("statut", "livree")
            .gte("created_at", todayStart.toISOString())
            .lte("created_at", todayEnd.toISOString())
            .limit(1000),

          supabase
            .from("commandes")
            .select("*", { count: "exact", head: true })
            .eq("statut", "en_attente"),
        ])

      commandesJour = Number(todayCountRes.count || 0)
      enAttente = Number(enAttenteRes.count || 0)

      const todayRows = Array.isArray(todayLivreeRes.data)
        ? todayLivreeRes.data
        : []

      for (const row of todayRows) {
        const pair = computeStoredTotalPair(row, serverRate)
        caJourUsd += pair.usd
        caJourCdf += pair.cdf
      }

      caJourUsd = round2(caJourUsd)
      caJourCdf = roundCdf(caJourCdf)
    } catch (err) {
      logger.warn?.("Erreur stats globales admin commandes", err)
    }

    /* ------------------------------------------------------------ */
    /* Réponse                                                       */
    /* ------------------------------------------------------------ */

    const totalPages = Math.max(
      1,
      Math.ceil(Number(count || 0) / Math.max(1, limit))
    )

    const response = {
      data: commandes,

      total: Number(count || 0),
      page,
      limit,
      totalPages,

      chiffre_affaires_usd: filteredSumUsd,
      chiffre_affaires_cdf: filteredSumCdf,
      chiffre_affaires: filteredSumCdf,

      panier_moyen_usd: panierMoyenUsd,
      panier_moyen_cdf: panierMoyenCdf,
      panier_moyen: panierMoyenCdf,

      commandes_jour: commandesJour,
      ca_jour_usd: caJourUsd,
      ca_jour_cdf: caJourCdf,
      en_attente: enAttente,

      exchange_rate: serverRate,
      stats_truncated: statsTruncated,

      pagination: {
        page,
        limit,
        total: Number(count || 0),
        totalPages,
      },

      stats: {
        commandesJour,
        caJour: caJourCdf,
        caJourUsd,
        caJourCdf,
        enAttente,
        chiffreAffairesUsd: filteredSumUsd,
        chiffreAffairesCdf: filteredSumCdf,
        panierMoyenUsd,
        panierMoyenCdf,
        filteredCount,
        truncated: statsTruncated,
      },
    }

    if (format === "csv") {
      const csv = buildAdminCsv(commandes)

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=commandes_admin_${new Date()
            .toISOString()
            .slice(0, 10)}.csv`,
        },
      })
    }

    setCache(cacheKey, response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error?.("Crash GET admin/commandes", error)

    return NextResponse.json(
      {
        error: "Erreur serveur interne admin commandes",
        details: error?.message || "Erreur inconnue",
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT – Changement de statut en masse                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-cmd-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: "Trop de requêtes admin bulk status." },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Accès non autorisé" },
      { status: err?.status || 403 }
    )
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide" },
      { status: 400 }
    )
  }

  const parsed = bulkStatusSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Données invalides",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { ids, statut, commentaire } = parsed.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== "function") {
    return NextResponse.json(
      { error: "Configuration Supabase invalide" },
      { status: 500 }
    )
  }

  try {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))]

    const { data: currentRows, error: fetchError } = await supabase
      .from("commandes")
      .select("id, acheteur_id, statut, numero_commande")
      .in("id", uniqueIds)

    if (fetchError) {
      logger.error?.("Erreur fetch commandes bulk status", fetchError)

      return NextResponse.json(
        {
          error: "Erreur lors de la récupération des commandes",
          details: fetchError.message,
        },
        { status: 500 }
      )
    }

    const rows = Array.isArray(currentRows) ? currentRows : []

    const changedRows = rows.filter(
      (row: any) =>
        String(row?.statut || "").toLowerCase() !==
        String(statut || "").toLowerCase()
    )

    if (changedRows.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: "Aucun changement de statut nécessaire",
      })
    }

    const changedIds = changedRows
      .map((row: any) => String(row.id))
      .filter(Boolean)

    const now = new Date().toISOString()

    const updateAttempts = [
      {
        name: "full",
        data: {
          statut,
          commentaire_statut: commentaire || null,
          updated_at: now,
        },
      },
      {
        name: "no_comment",
        data: {
          statut,
          updated_at: now,
        },
      },
      {
        name: "minimal",
        data: {
          statut,
        },
      },
    ]

    let updatedRows: any[] = []
    let lastError: any = null

    for (const attempt of updateAttempts) {
      try {
        const { data, error } = await supabase
          .from("commandes")
          .update(attempt.data)
          .in("id", changedIds)
          .select("id, acheteur_id, statut, numero_commande")

        if (!error && Array.isArray(data)) {
          updatedRows = data
          break
        }

        lastError = error

        if (isMissingColumnError(error)) {
          continue
        }

        logger.error?.(
          { error, attempt: attempt.name },
          "Échec bulk update statut admin"
        )

        return NextResponse.json(
          {
            error: "Échec mise à jour des statuts",
            details: error?.message,
          },
          { status: 500 }
        )
      } catch (err: any) {
        lastError = err

        if (isMissingColumnError(err)) {
          continue
        }

        logger.error?.(
          { err, attempt: attempt.name },
          "Exception bulk update statut admin"
        )

        return NextResponse.json(
          {
            error: "Échec mise à jour des statuts",
            details: err?.message,
          },
          { status: 500 }
        )
      }
    }

    if (updatedRows.length === 0) {
      return NextResponse.json(
        {
          error: "Aucune commande mise à jour",
          details: lastError?.message,
        },
        { status: 500 }
      )
    }

    cache.clear()

    /* ------------------------------------------------------------ */
    /* Notifications                                                 */
    /* ------------------------------------------------------------ */

    const statutLabel =
      STATUS_LABELS[statut] ||
      statut.charAt(0).toUpperCase() + statut.replace("_", " ")

    for (const row of updatedRows) {
      try {
        if (!row?.acheteur_id) continue

        const { data: acheteur } = await supabase
          .from("profiles")
          .select("email, telephone")
          .eq("id", row.acheteur_id)
          .single()

        const numero = row.numero_commande || row.id

        if (acheteur?.email) {
          await sendEmail(
            acheteur.email,
            `Commande #${numero} – ${statutLabel}`,
            `Votre commande est désormais « ${statutLabel } »${
              commentaire ? `.\nCommentaire : ${commentaire}` : "."
            }`
          ).catch((err: any) => {
            logger.warn?.("sendEmail bulk status indisponible", err)
          })
        }

        await createNotification(
          row.acheteur_id,
          "commande",
          `Statut : ${statutLabel}`,
          `Commande #${numero} → ${statutLabel}`,
          { commande_id: row.id }
        ).catch((err: any) => {
          logger.warn?.("createNotification bulk status indisponible", err)
        })

        if (acheteur?.telephone) {
          await sendSMS(
            acheteur.telephone,
            `Gercie: Votre commande #${numero} est maintenant ${statutLabel}.`
          ).catch((err: any) => {
            logger.warn?.("sendSMS bulk status indisponible", err)
          })
        }
      } catch (notifErr) {
        logger.warn?.("Erreur notification bulk status", notifErr)
      }
    }

    logger.info?.(
      {
        statut,
        updated: updatedRows.length,
        ids: changedIds,
      },
      "Bulk statut admin appliqué"
    )

    return NextResponse.json({
      success: true,
      updated: updatedRows.length,
      statut,
      message: `${updatedRows.length} commande(s) mise(s) à jour`,
    })
  } catch (error: any) {
    logger.error?.("Crash PUT admin/commandes", error)

    return NextResponse.json(
      {
        error: "Erreur serveur interne bulk status",
        details: error?.message || "Erreur inconnue",
      },
      { status: 500 }
    )
  }
}