// components/CommandeCard.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'

import { motion, useReducedMotion } from 'framer-motion'

import {
  Package,
  ChevronRight,
  Truck,
  MapPin,
  Calendar,
  Eye,
  EyeOff,
  Copy,
  CheckCircle,
  Key,
  ShieldCheck,
  Zap,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  getStatutLabel,
  getStatutVariant,
  isStatutValidForCode,
} from '@/lib/statuts'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

export interface CommandeArticleData {
  nom: string
  quantite?: number | null
  quantity?: number | null

  prix_unitaire?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null
  price?: number | null

  prix_unitaire_usd?: number | null
  unit_price_usd?: number | null
  prix_usd?: number | null
  price_usd?: number | null

  specifications?: string | null
  variante?: any
  variant_attributes?: any

  [key: string]: any
}

export interface CommandeData {
  id: string
  numero: string

  total?: number | null
  total_global?: number | null
  total_usd?: number | null
  totalUSD?: number | null
  total_cdf?: number | null
  totalCDF?: number | null

  exchange_rate?: number | null
  shipping_rate_used?: number | null
  currency?: Currency | null

  statut: string
  date: string
  type_livraison: string

  adresse_livraison?: string | null
  point_retrait?: {
    nom: string
    adresse?: string
  } | null

  articles: CommandeArticleData[]

  code_client?: string | null
  code_livreur?: string | null

  mode_attribution?: 'LIBRE' | 'ASSIGNE' | null
  livreur?: {
    nom: string
    prenom: string
  } | null
}

interface CommandeCardProps {
  commande: CommandeData
  context?: 'client' | 'admin' | 'livreur'
  onCopyCode?: (code: string) => void
  className?: string

  /**
   * Devise principale d’affichage.
   * USD reste la source de vérité si disponible.
   */
  currency?: Currency

  /**
   * Taux USD/CDF fourni par le parent.
   * Si absent, le composant utilise useExchangeRate().
   */
  rate?: number | null

  /**
   * Afficher ou masquer le prix secondaire.
   */
  showSecondary?: boolean
}

interface MoneyPair {
  usd: number
  cdf: number
}

interface DisplayMoney {
  primaryCurrency: Currency
  primaryAmount: number
  secondaryCurrency: Currency
  secondaryAmount: number
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

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  return `$${value.toFixed(2)}`
}

function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function resolveRate(exchange: any): number | null {
  const candidates = [
    exchange?.rate,
    exchange?.usdRate,
    exchange?.data?.rate,
    exchange?.data?.current?.rate,
    exchange,
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)

    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux courant.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas disponible.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux courant.
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

function selectDisplay(
  pair: MoneyPair,
  preferredCurrency: Currency
): DisplayMoney {
  const otherCurrency: Currency =
    preferredCurrency === 'USD' ? 'CDF' : 'USD'

  let primaryCurrency = preferredCurrency
  let primaryAmount =
    preferredCurrency === 'USD' ? pair.usd : pair.cdf

  let secondaryCurrency = otherCurrency
  let secondaryAmount =
    otherCurrency === 'USD' ? pair.usd : pair.cdf

  if (primaryAmount <= 0 && secondaryAmount > 0) {
    primaryCurrency = otherCurrency
    primaryAmount = secondaryAmount

    secondaryCurrency = preferredCurrency
    secondaryAmount =
      preferredCurrency === 'USD' ? pair.usd : pair.cdf
  }

  return {
    primaryCurrency,
    primaryAmount:
      primaryCurrency === 'USD'
        ? round2(primaryAmount)
        : roundCdf(primaryAmount),
    secondaryCurrency,
    secondaryAmount:
      secondaryCurrency === 'USD'
        ? round2(secondaryAmount)
        : roundCdf(secondaryAmount),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ARTICLE HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function getArticleQuantity(article: CommandeArticleData): number {
  return Math.max(
    1,
    Math.floor(
      Number(article.quantite ?? article.quantity ?? 1) || 1
    )
  )
}

function getArticleUsd(article: CommandeArticleData): number {
  return firstPositive(
    article.prix_unitaire_usd,
    article.unit_price_usd,
    article.prix_usd,
    article.price_usd
  )
}

function getArticleCdf(article: CommandeArticleData): number {
  return firstPositive(
    article.prix_unitaire,
    article.prix_cdf,
    article.price_cdf,
    article.price
  )
}

function resolveArticleUnitPair(
  article: CommandeArticleData,
  rate: number | null
): MoneyPair {
  return resolvePricePair(
    getArticleUsd(article),
    getArticleCdf(article),
    rate
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELIVERY HELPERS                                               */
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

function getDeliveryLabel(mode: string): string {
  const normalized = normalizeDeliveryMode(mode)

  if (normalized === 'point_retrait') return 'Point relais'
  if (normalized === 'express') return 'Express'

  return 'Domicile'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DATE HELPER                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLIPBOARD HELPER                                               */
/* ═══════════════════════════════════════════════════════════════ */

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback
  }

  try {
    if (typeof document === 'undefined') return false

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'

    document.body.appendChild(textarea)
    textarea.select()

    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)

    return ok
  } catch {
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function CommandeCard({
  commande,
  context = 'client',
  onCopyCode,
  className,
  currency,
  rate,
  showSecondary = true,
}: CommandeCardProps) {
  const prefersReducedMotion = useReducedMotion()

  const exchange = useExchangeRate() as any

  const [mounted, setMounted] = useState(false)

  const [showClientCode, setShowClientCode] = useState(false)
  const [copiedClient, setCopiedClient] = useState(false)
  const [copiedLivreur, setCopiedLivreur] = useState(false)

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clientCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const livreurCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      if (clientCopyTimerRef.current) clearTimeout(clientCopyTimerRef.current)
      if (livreurCopyTimerRef.current) clearTimeout(livreurCopyTimerRef.current)
    }
  }, [])

  const fallbackRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = useMemo(() => {
    if (!mounted) return null

    return rate ?? fallbackRate
  }, [fallbackRate, mounted, rate])

  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const articles = useMemo<CommandeArticleData[]>(
    () => (Array.isArray(commande.articles) ? commande.articles : []),
    [commande.articles]
  )

  const articleQuantity = useMemo(
    () =>
      articles.reduce(
        (acc, article) => acc + getArticleQuantity(article),
        0
      ),
    [articles]
  )

  const computedArticlesTotal = useMemo<MoneyPair>(() => {
    let usd = 0
    let cdfFallback = 0

    for (const article of articles) {
      const qty = getArticleQuantity(article)
      const unitPair = resolveArticleUnitPair(article, effectiveRate)

      usd += unitPair.usd * qty
      cdfFallback += unitPair.cdf * qty
    }

    const computedUsd = round2(usd)

    const computedCdf =
      rateOk && computedUsd > 0
        ? roundCdf(toCdf(computedUsd, rateNum))
        : roundCdf(cdfFallback)

    return {
      usd: computedUsd,
      cdf: computedCdf,
    }
  }, [articles, effectiveRate, rateNum, rateOk])

  const totalPair = useMemo<MoneyPair>(() => {
    const orderUsd = firstPositive(
      commande.total_usd,
      (commande as any).totalUSD,
      (commande as any).sous_total_usd
    )

    const orderCdf = firstPositive(
      commande.total_cdf,
      (commande as any).totalCDF,
      commande.total_global,
      commande.total
    )

    return resolvePricePair(
      orderUsd > 0 ? orderUsd : computedArticlesTotal.usd,
      orderCdf > 0 ? orderCdf : computedArticlesTotal.cdf,
      effectiveRate
    )
  }, [
    commande.total,
    commande.total_cdf,
    commande.total_global,
    commande.total_usd,
    computedArticlesTotal,
    effectiveRate,
  ])

  const preferredCurrency: Currency = currency ?? 'USD'

  const displayTotal = useMemo(
    () => selectDisplay(totalPair, preferredCurrency),
    [preferredCurrency, totalPair]
  )

  const shouldShowSecondary =
    showSecondary !== false &&
    displayTotal.secondaryAmount > 0 &&
    displayTotal.secondaryAmount !== displayTotal.primaryAmount

  const statutLabel = getStatutLabel(commande.statut)
  const statutVariant = getStatutVariant(commande.statut)

  const deliveryMode = normalizeDeliveryMode(commande.type_livraison)
  const deliveryLabel = getDeliveryLabel(commande.type_livraison)

  const DeliveryIcon =
    deliveryMode === 'point_retrait'
      ? MapPin
      : deliveryMode === 'express'
        ? Zap
        : Truck

  const canShowClientCodeBlock =
    !!commande.code_client && isStatutValidForCode(commande.statut)

  const clientCodeIsVisible =
    canShowClientCodeBlock && (context !== 'client' || showClientCode)

  const canShowLivreurCodeBlock =
    (context === 'admin' || context === 'livreur') &&
    !!commande.code_livreur

  const handleRevealClientCode = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
    }

    setShowClientCode(true)

    revealTimerRef.current = setTimeout(() => {
      setShowClientCode(false)
      revealTimerRef.current = null
    }, 15_000)
  }, [])

  const handleHideClientCode = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }

    setShowClientCode(false)
  }, [])

  const copyCode = useCallback(
    async (text: string, type: 'client' | 'livreur') => {
      const ok = await copyToClipboard(text)

      if (!ok) return

      if (type === 'client') {
        if (clientCopyTimerRef.current) {
          clearTimeout(clientCopyTimerRef.current)
        }

        setCopiedClient(true)

        clientCopyTimerRef.current = setTimeout(() => {
          setCopiedClient(false)
          clientCopyTimerRef.current = null
        }, 2_000)
      } else {
        if (livreurCopyTimerRef.current) {
          clearTimeout(livreurCopyTimerRef.current)
        }

        setCopiedLivreur(true)

        livreurCopyTimerRef.current = setTimeout(() => {
          setCopiedLivreur(false)
          livreurCopyTimerRef.current = null
        }, 2_000)
      }

      onCopyCode?.(text)
    },
    [onCopyCode]
  )

  return (
    <motion.div
      initial={
        prefersReducedMotion ? false : { opacity: 0, y: 10 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.25,
      }}
      className={className}
    >
      <Card className="overflow-hidden border-border bg-card/70 backdrop-blur-sm transition-all duration-300 hover:shadow-card-hover">
        <CardContent className="p-4 sm:p-5">
          {/* En-tête : numéro + statut */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/commande/confirmation?id=${commande.id}`}
                className="block truncate text-base font-bold text-foreground transition-colors hover:text-gold-500 sm:text-lg"
              >
                #{commande.numero}
              </Link>

              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar size={12} aria-hidden="true" />
                {formatDate(commande.date)}
              </p>
            </div>

            <Badge
              variant={statutVariant as any}
              size="sm"
              className="shrink-0"
            >
              {statutLabel}
            </Badge>
          </div>

          {/* Ligne livraison + indicateur code */}
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <DeliveryIcon
              size={14}
              className="text-gold-500"
              aria-hidden="true"
            />

            <span>{deliveryLabel}</span>

            {canShowClientCodeBlock && !clientCodeIsVisible && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-gold-600">
                <ShieldCheck size={12} aria-hidden="true" />
                Code dispo.
              </span>
            )}
          </div>

          {/* Codes de sécurité */}
          {(canShowClientCodeBlock || canShowLivreurCodeBlock) && (
            <div className="mb-3 space-y-2">
              {canShowClientCodeBlock && (
                <div className="flex items-center justify-between rounded-lg border border-gold-400/20 bg-gold-50/50 px-3 py-2 dark:bg-gold-900/10">
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <Key
                      size={14}
                      className="shrink-0 text-gold-500"
                      aria-hidden="true"
                    />

                    <span className="shrink-0 text-muted-foreground">
                      Code client :
                    </span>

                    {clientCodeIsVisible ? (
                      <span className="truncate font-mono font-bold text-gold-600">
                        {commande.code_client}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRevealClientCode}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gold-500 transition hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                        aria-label="Afficher le code client"
                      >
                        <Eye size={12} aria-hidden="true" />
                        Voir
                      </button>
                    )}
                  </div>

                  {clientCodeIsVisible && (
                    <div className="flex shrink-0 items-center gap-1">
                      {context === 'client' && (
                        <Tooltip content="Masquer">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={handleHideClientCode}
                            aria-label="Masquer le code client"
                          >
                            <EyeOff
                              size={14}
                              className="text-muted-foreground"
                              aria-hidden="true"
                            />
                          </Button>
                        </Tooltip>
                      )}

                      <Tooltip
                        content={copiedClient ? 'Copié !' : 'Copier'}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() =>
                            void copyCode(commande.code_client!, 'client')
                          }
                          aria-label="Copier le code client"
                        >
                          {copiedClient ? (
                            <CheckCircle
                              size={14}
                              className="text-green-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <Copy
                              size={14}
                              className="text-gold-500"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              )}

              {canShowLivreurCodeBlock && (
                <div className="flex items-center justify-between rounded-lg border border-blue-400/20 bg-blue-50/50 px-3 py-2 dark:bg-blue-900/10">
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <Truck
                      size={14}
                      className="shrink-0 text-blue-500"
                      aria-hidden="true"
                    />

                    <span className="shrink-0 text-muted-foreground">
                      Code livreur :
                    </span>

                    <span className="truncate font-mono font-bold text-blue-600">
                      {commande.code_livreur}
                    </span>
                  </div>

                  <Tooltip
                    content={copiedLivreur ? 'Copié !' : 'Copier'}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        void copyCode(commande.code_livreur!, 'livreur')
                      }
                      aria-label="Copier le code livreur"
                    >
                      {copiedLivreur ? (
                        <CheckCircle
                          size={14}
                          className="text-green-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <Copy
                          size={14}
                          className="text-blue-500"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          )}

          {/* Résumé articles et total */}
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Package size={14} aria-hidden="true" />
              {articleQuantity} article{articleQuantity > 1 ? 's' : ''}
            </span>

            <div className="text-right">
              <p className="font-bold text-foreground">
                {formatMoney(
                  displayTotal.primaryAmount,
                  displayTotal.primaryCurrency
                )}
              </p>

              {shouldShowSecondary && (
                <p className="text-[11px] text-muted-foreground">
                  ≈{' '}
                  {formatMoney(
                    displayTotal.secondaryAmount,
                    displayTotal.secondaryCurrency
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Ligne d'attribution (admin) */}
          {context === 'admin' && commande.mode_attribution && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  commande.mode_attribution === 'ASSIGNE'
                    ? 'gold'
                    : 'neutral'
                }
                size="sm"
              >
                {commande.mode_attribution === 'ASSIGNE'
                  ? 'Assigné'
                  : 'Libre'}
              </Badge>

              {commande.livreur && (
                <span className="text-xs text-muted-foreground">
                  Livreur : {commande.livreur.prenom} {commande.livreur.nom}
                </span>
              )}
            </div>
          )}

          {/* Actions rapides */}
          <div className="flex justify-end gap-2 border-t border-border pt-1">
            <Link href={`/commande/confirmation?id=${commande.id}`}>
              <Button variant="ghost" size="sm" className="text-xs">
                Détails
                <ChevronRight
                  size={14}
                  className="ml-1"
                  aria-hidden="true"
                />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}