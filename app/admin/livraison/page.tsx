// app/admin/livraison/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { motion, useReducedMotion } from 'framer-motion'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDebounce } from '@/hooks/useDebounce'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'

import {
  AlertTriangle,
  Home,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
  Zap,
} from 'lucide-react'

import { normalizeProductDeliveryConfig } from '@/lib/shipping-utils'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type ModeId = 'domicile' | 'point_retrait' | 'express'

interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source:
    | 'USD'
    | 'CDF_CONVERTED'
    | 'CDF_LEGACY'
    | 'NONE'
}

interface RawProduct {
  id?: string | number
  nom?: string
  name?: string

  prix?: number | string | null
  price?: number | string | null
  prix_cdf?: number | string | null
  price_cdf?: number | string | null

  prix_usd?: number | string | null
  price_usd?: number | string | null
  unit_price_usd?: number | string | null

  delivery_config?: any
  deliveryConfig?: any

  livraison_domicile?: number | string | null
  livraison_point_retrait?: number | string | null
  livraison_express?: number | string | null
  express_gratuit?: boolean | string | number | null

  [key: string]: any
}

interface NormalizedLivraisonProduct {
  id: string
  nom: string
  pricePair: MoneyPair
  modes: Record<ModeId, MoneyPair>
  expressFree: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const MODE_IDS: ModeId[] = ['domicile', 'point_retrait', 'express']

const MODE_META: Record<
  ModeId,
  { label: string; icon: React.ReactNode }
> = {
  domicile: {
    label: 'Domicile',
    icon: <Home size={14} className="inline mr-1" aria-hidden="true" />,
  },
  point_retrait: {
    label: 'Retrait',
    icon: <MapPin size={14} className="inline mr-1" aria-hidden="true" />,
  },
  express: {
    label: 'Express',
    icon: <Zap size={14} className="inline mr-1" aria-hidden="true" />,
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : null
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
  if (!Number.isFinite(cdf) || cdf < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

function explicitUsd(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

function explicitCdf(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return roundCdf(n)
    }
  }

  return null
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase()
    return clean === 'true' || clean === 'yes' || clean === 'oui'
  }
  return false
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

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux serveur.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 *
 * - Si CDF seul et taux indisponible → lecture tolérée en fallback.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdSource != null) {
    const usd = round2(usdSource)

    if (usd === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      return {
        usd,
        cdf: roundCdf(toCdf(usd, rateNum)),
        cdfKnown: true,
        source: 'USD',
      }
    }

    return {
      usd,
      cdf: cdfSource != null ? roundCdf(cdfSource) : null,
      cdfKnown: cdfSource != null,
      source: 'USD',
    }
  }

  if (cdfSource != null && rateOk) {
    const usd = round2(toUsd(cdfSource, rateNum))

    return {
      usd,
      cdf: roundCdf(toCdf(usd, rateNum)),
      cdfKnown: true,
      source: 'CDF_CONVERTED',
    }
  }

  if (cdfSource != null) {
    return {
      usd: 0,
      cdf: roundCdf(cdfSource),
      cdfKnown: true,
      source: 'CDF_LEGACY',
    }
  }

  return {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }
}

function getUsdSignal(raw: RawProduct): number | null {
  return explicitUsd(
    raw.prix_usd,
    raw.price_usd,
    raw.unit_price_usd,
    raw.variante?.prix_usd,
    raw.variante?.price_usd,
    raw.variante?.unit_price_usd,
    raw.product?.prix_usd,
    raw.product?.price_usd,
    raw.product?.unit_price_usd
  )
}

function getCdfSignal(raw: RawProduct): number | null {
  return explicitCdf(
    raw.prix,
    raw.price,
    raw.prix_cdf,
    raw.price_cdf,
    raw.variante?.prix,
    raw.variante?.price,
    raw.variante?.prix_cdf,
    raw.variante?.price_cdf,
    raw.product?.prix,
    raw.product?.price,
    raw.product?.prix_cdf,
    raw.product?.price_cdf
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORMAT HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'

  return `$${round2(value).toFixed(2)}`
}

function formatCdf(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'

  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function displayMoneyPair(
  pair: MoneyPair,
  kind: 'price' | 'fee'
): string {
  if (pair.source === 'NONE') return '—'

  const isFree =
    pair.usd === 0 &&
    (pair.source === 'USD' || pair.cdf === 0)

  if (kind === 'fee' && isFree) {
    return 'Gratuit'
  }

  if (pair.usd > 0 || (pair.source === 'USD' && pair.usd === 0)) {
    const main = formatUsd(pair.usd)

    if (pair.cdf != null && pair.cdf > 0) {
      return `${main} ≈ ${formatCdf(pair.cdf)}`
    }

    if (pair.cdf === 0) {
      return main
    }

    return main
  }

  if (pair.cdf != null && pair.cdf > 0) {
    return formatCdf(pair.cdf)
  }

  if (pair.cdf === 0) {
    return kind === 'fee' ? 'Gratuit' : '0 FC'
  }

  return '—'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeLivraisonProduct(
  raw: RawProduct,
  rate: number | null
): NormalizedLivraisonProduct {
  const pricePair = resolvePricePair(
    getUsdSignal(raw),
    getCdfSignal(raw),
    rate
  )

  const deliveryConfig = normalizeProductDeliveryConfig(
    raw.delivery_config ?? raw.deliveryConfig ?? null,
    raw,
    rate
  )

  const modes = {} as Record<ModeId, MoneyPair>

  for (const modeId of MODE_IDS) {
    const mode = deliveryConfig.modes?.[modeId]

    const usdSource = explicitUsd(
      mode?.fee_usd,
      mode?.base_fee_usd
    )

    const cdfSource = explicitCdf(
      mode?.fee_cdf
    )

    let pair = resolvePricePair(usdSource, cdfSource, rate)

    if (
      modeId === 'express' &&
      normalizeBoolean(raw.express_gratuit)
    ) {
      pair = {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    modes[modeId] = pair
  }

  const expressFree =
    normalizeBoolean(raw.express_gratuit) ||
    (modes.express.usd === 0 &&
      (modes.express.source === 'USD' ||
        modes.express.cdf === 0))

  return {
    id: String(raw.id ?? ''),
    nom: String(raw.nom ?? raw.name ?? 'Produit'),
    pricePair,
    modes,
    expressFree,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function MoneyCell({
  pair,
  kind,
  align = 'left',
}: {
  pair: MoneyPair
  kind: 'price' | 'fee'
  align?: 'left' | 'right'
}) {
  const text = displayMoneyPair(pair, kind)

  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left')}>
      <p
        className={cn(
          'font-medium',
          pair.source === 'USD' && 'text-gold-600',
          pair.source === 'CDF_CONVERTED' && 'text-gold-600',
          pair.source === 'CDF_LEGACY' && 'text-amber-600',
          pair.source === 'NONE' && 'text-muted-foreground'
        )}
      >
        {text}
      </p>

      {pair.source === 'CDF_LEGACY' && (
        <p className="text-[11px] text-amber-600">
          CDF legacy · taux indisponible
        </p>
      )}

      {pair.source === 'NONE' && (
        <p className="text-[11px] text-muted-foreground">
          Prix indisponible
        </p>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminLivraisonPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading, isAdmin } = useAuth()

  const exchange = useExchangeRate() as any
  const prefersReducedMotion = useReducedMotion()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ------------------------------------------------------------ */
  /* Taux normalisé + protection hydration                          */
  /* ------------------------------------------------------------ */

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  const effectiveRate = mounted ? rawRate : null
  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ------------------------------------------------------------ */
  /* Recherche                                                      */
  /* ------------------------------------------------------------ */

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  /* ------------------------------------------------------------ */
  /* Garde admin                                                    */
  /* ------------------------------------------------------------ */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/livraison')}`
      )
      return
    }

    if (!isAdmin) {
      router.replace('/')
    }
  }, [authLoading, isAdmin, router, user])

  /* ------------------------------------------------------------ */
  /* Paramètre global livraison gratuite                            */
  /* ------------------------------------------------------------ */

  const {
    data: isFreeShipping,
    isLoading: loadingGlobal,
  } = useQuery<boolean>({
    queryKey: ['setting', 'global_free_shipping'],
    queryFn: async () => {
      const res = await fetch(
        '/api/settings?key=global_free_shipping',
        {
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur chargement paramètre livraison'
        )
      }

      return normalizeBoolean(json?.value)
    },
    enabled: !!user && !!isAdmin,
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          key: 'global_free_shipping',
          value: newValue,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur mise à jour paramètre livraison'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['setting', 'global_free_shipping'],
      })

      addToast({
        type: 'success',
        message: 'Paramètre mis à jour',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message || 'Erreur lors de la mise à jour',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Produits + tarifs livraison                                    */
  /* ------------------------------------------------------------ */

  const {
    data: produitsResponse,
    isLoading: loadingProduits,
    isError: produitsError,
    error: produitsErrorObj,
    refetch,
  } = useQuery<any>({
    queryKey: ['admin-produits-livraison', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '50')

      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }

      const res = await fetch(
        `/api/admin/produits?${params.toString()}`,
        {
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur chargement produits livraison'
        )
      }

      return json
    },
    enabled: !!user && !!isAdmin,
    staleTime: 30_000,
  })

  const rawProducts = useMemo<RawProduct[]>(() => {
    if (Array.isArray(produitsResponse)) {
      return produitsResponse
    }

    if (Array.isArray(produitsResponse?.data)) {
      return produitsResponse.data
    }

    return []
  }, [produitsResponse])

  const normalizedProducts = useMemo<NormalizedLivraisonProduct[]>(
    () =>
      rawProducts.map((raw) =>
        normalizeLivraisonProduct(raw, effectiveRate)
      ),
    [effectiveRate, rawProducts]
  )

  /* ------------------------------------------------------------ */
  /* Early returns                                                  */
  /* ------------------------------------------------------------ */

  if (authLoading) {
    return (
      <Container className="py-12">
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      </Container>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const motionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: 20 }

  return (
    <Container className="py-8">
      <motion.div
        initial={motionInitial}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.5,
        }}
      >
        {/* En-tête */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-serif text-3xl font-bold text-foreground">
              <Truck
                size={28}
                className="text-gold-500"
                aria-hidden="true"
              />
              Gestion de la livraison
            </h1>

            <p className="mt-1 text-muted-foreground">
              Configurez les frais de livraison et activez la gratuité globale pour vos promotions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!mounted ? (
              <Badge variant="neutral" size="sm">
                Initialisation du taux…
              </Badge>
            ) : rateOk ? (
              <Badge variant="accent" size="sm">
                1 USD ≈ {formatCdf(rateNum)}
              </Badge>
            ) : rateLoading ? (
              <Badge variant="neutral" size="sm">
                Chargement du taux…
              </Badge>
            ) : (
              <Badge variant="danger" size="sm">
                <AlertTriangle
                  size={12}
                  className="mr-1"
                  aria-hidden="true"
                />
                Taux indisponible
              </Badge>
            )}
          </div>
        </div>

        {/* Toggle global free shipping */}
        <Card
          variant="glass"
          className="mb-8 border-gold-400/20 shadow-soft"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap
                size={20}
                className="text-gold-500"
                aria-hidden="true"
              />
              Livraison gratuite globale
            </CardTitle>

            <CardDescription>
              Activez cette option pour offrir la livraison gratuite sur l&apos;ensemble de la boutique.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-wrap items-center gap-4">
            {loadingGlobal ? (
              <Spinner size="sm" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    toggleMutation.mutate(!isFreeShipping)
                  }
                  disabled={toggleMutation.isPending}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500',
                    isFreeShipping ? 'bg-green-500' : 'bg-gray-300'
                  )}
                  aria-label="Basculer la livraison gratuite globale"
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      isFreeShipping
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    )}
                  />
                </button>

                <span
                  className={cn(
                    'text-sm font-medium',
                    isFreeShipping
                      ? 'text-green-600'
                      : 'text-muted-foreground'
                  )}
                >
                  {isFreeShipping
                    ? 'Activée – Livraison gratuite partout'
                    : 'Désactivée'}
                </span>

                {toggleMutation.isPending && <Spinner size="sm" />}
              </>
            )}
          </CardContent>

          {isFreeShipping && (
            <CardContent className="pt-0">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-medium">
                  Règle de sécurité
                </p>

                <p className="mt-1">
                  La gratuité globale ne supprime que les frais consolidables. Les frais obligatoires / non consolidables (manutention, installation, produits lourds, etc.) restent facturés.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Rappel config par produit */}
        <Card
          variant="glass"
          className="mb-8 border-gold-400/20 shadow-soft"
        >
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={20}
                className="mt-0.5 shrink-0 text-amber-500"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium text-foreground">
                  Tarifs individuels
                </p>

                <p className="text-sm text-muted-foreground">
                  Pour définir les frais de livraison spécifiques à un produit, rendez-vous dans la fiche produit (onglet <strong>Livraison</strong> lors de l&apos;ajout ou de la modification).
                </p>

                <Link
                  href="/admin/produits"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-gold-500 hover:underline"
                >
                  <Package
                    size={14}
                    aria-hidden="true"
                  />
                  Gérer les produits
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Erreur produits */}
        {produitsError && (
          <Card
            variant="glass"
            className="mb-8 border-red-500/30 bg-red-500/5 shadow-soft"
          >
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertTriangle
                size={32}
                className="text-red-500"
                aria-hidden="true"
              />

              <p className="text-sm text-red-600">
                {produitsErrorObj instanceof Error
                  ? produitsErrorObj.message
                  : 'Impossible de charger les produits.'}
              </p>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => void refetch()}
                leftIcon={
                  <RefreshCw
                    size={14}
                    aria-hidden="true"
                  />
                }
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Liste produits */}
        <Card
          variant="glass"
          className="border-gold-400/20 shadow-soft"
        >
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package
                size={20}
                className="text-gold-500"
                aria-hidden="true"
              />
              Aperçu des tarifs par produit
            </CardTitle>

            <div className="relative w-full sm:w-64">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />

              <Input
                variant="glass"
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                size="sm"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>
          </CardHeader>

          <CardContent>
            {loadingProduits ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : normalizedProducts.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Package
                  size={32}
                  className="mx-auto mb-2 opacity-50"
                  aria-hidden="true"
                />

                <p>
                  {debouncedSearch
                    ? 'Aucun produit trouvé pour cette recherche.'
                    : 'Aucun produit trouvé.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold">
                        Produit
                      </th>

                      {MODE_IDS.map((modeId) => (
                        <th
                          key={modeId}
                          className="px-4 py-3 text-left font-semibold"
                        >
                          {MODE_META[modeId].icon}
                          {MODE_META[modeId].label}
                        </th>
                      ))}

                      <th className="px-4 py-3 text-left font-semibold">
                        Express gratuit
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/50">
                    {normalizedProducts.map((prod) => (
                      <tr
                        key={prod.id}
                        className="transition-colors hover:bg-gold-400/5"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium">
                            {prod.nom}
                          </span>

                          <div className="mt-1">
                            <MoneyCell
                              pair={prod.pricePair}
                              kind="price"
                            />
                          </div>
                        </td>

                        {MODE_IDS.map((modeId) => (
                          <td
                            key={`${prod.id}-${modeId}`}
                            className="px-4 py-3"
                          >
                            <MoneyCell
                              pair={prod.modes[modeId]}
                              kind="fee"
                            />
                          </td>
                        ))}

                        <td className="px-4 py-3">
                          {prod.expressFree ? (
                            <Badge variant="accent" size="sm">
                              Oui
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Non
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/produits/${prod.id}/modifier`}
                          >
                            <Button
                              variant="outline-gold"
                              size="sm"
                            >
                              Modifier
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </Container>
  )
}