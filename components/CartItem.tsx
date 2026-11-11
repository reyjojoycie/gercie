// components/CartItem.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

import { useCart, type CartItem as CartItemType } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import {
  AlertTriangle,
  Bookmark,
  Check,
  Eye,
  GripVertical,
  Heart,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

interface PricePair {
  usd: number
  cdf: number
}

interface DisplayPrice {
  primaryCurrency: Currency
  primaryAmount: number
  secondaryCurrency: Currency
  secondaryAmount: number
}

interface CartItemProps {
  /** L’article du panier */
  item: CartItemType

  /** Callback pour mettre à jour la quantité (si fourni, surcharge le contexte) */
  onUpdateQuantity?: (
    id: string,
    quantity: number,
    variantKey?: string
  ) => Promise<void>

  /** Callback pour supprimer l’article */
  onRemove?: (id: string, variantKey?: string) => Promise<void>

  /** Callback pour sauvegarder pour plus tard */
  onSaveForLater?: (id: string, variantKey?: string) => Promise<void>

  /** Désactiver les interactions (mode synchro) */
  disabled?: boolean

  /** Variante compacte */
  compact?: boolean

  /** Affiche les boutons d’action avancés */
  showAdvancedActions?: boolean

  /** Devise principale d’affichage. USD reste la source de vérité. */
  displayCurrency?: Currency

  /** Afficher le prix secondaire calculé */
  showSecondaryPrice?: boolean

  /** Index pour l’animation (décalage) */
  animationDelay?: number

  /** Classe additionnelle */
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) return null

  return n
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = toPositiveNumber(value)

    if (n != null) return n
  }

  return 0
}

function safeQuantity(value: unknown): number {
  return Math.max(1, Math.floor(Number(value ?? 1) || 1))
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

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

/**
 * Clé de variante canonique.
 *
 * IMPORTANT :
 * - trie les clés ;
 * - ignore les valeurs vides ;
 * - évite les doublons dus à l’ordre des attributs ;
 * - cohérent avec CartContext.
 */
function stableVariantKey(item: CartItemType): string | undefined {
  if (!item?.variante?.attributes) return undefined

  const attrs = item.variante.attributes

  if (!attrs || typeof attrs !== 'object') return undefined

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return undefined

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  try {
    return JSON.stringify(Object.fromEntries(entries))
  } catch {
    return undefined
  }
}

function getVariantDisplay(item: CartItemType): string | null {
  if (!item?.variante?.attributes) return null

  const attrs = item.variante.attributes

  if (!attrs || typeof attrs !== 'object') return null

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
}

function getProductHref(item: CartItemType): string {
  const id = String(item.product_id || item.id || '')
  return `/produits/${id}`
}

function getEffectiveStock(item: CartItemType): number | null {
  const direct = item.stock
  const disponible = item.stock_disponible

  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  if (typeof disponible === 'number' && Number.isFinite(disponible)) {
    return disponible
  }

  return null
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  RÉSOLUTION PRIX UNITAIRE — RÈGLE ABSOLUE
 *
 *  - Si USD existe → USD = vérité, CDF = USD × taux.
 *    Le CDF stocké est ignoré car potentiellement obsolète.
 *  - Si seulement CDF existe → CDF = source temporaire, USD = CDF / taux.
 *  - Aucun taux codé en dur.
 * ═══════════════════════════════════════════════════════════════
 */
function resolveUnitPricePair(
  item: CartItemType,
  rate: number | null
): PricePair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const usdSource = firstPositive(
    item.prix_usd,
    item.unit_price_usd,
    item.variante?.prix_specifique_usd
  )

  const cdfSource = firstPositive(
    item.prix,
    item.prix_cdf,
    item.price_cdf,
    item.variante?.prix_specifique_cdf,
    item.variante?.prix_specifique,
    item.variante?.prix
  )

  let usd = usdSource > 0 ? roundUsd(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    /**
     * USD = source principale.
     * CDF est TOUJOURS recalculé depuis USD.
     */
    cdf = rateOk ? roundCdf(toCdf(usd, rateNum)) : 0
  } else if (cdf > 0 && rateOk) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire.
     */
    usd = roundUsd(toUsd(cdf, rateNum))
  }

  return {
    usd: roundUsd(usd),
    cdf: roundCdf(cdf),
  }
}

function selectDisplayPrice(
  pair: PricePair,
  preferredCurrency: Currency
): DisplayPrice {
  const otherCurrency: Currency =
    preferredCurrency === 'USD' ? 'CDF' : 'USD'

  let primaryCurrency = preferredCurrency
  let primaryAmount =
    preferredCurrency === 'USD' ? pair.usd : pair.cdf

  let secondaryCurrency = otherCurrency
  let secondaryAmount =
    otherCurrency === 'USD' ? pair.usd : pair.cdf

  /**
   * Si la devise préférée n’a pas de valeur exploitable,
   * on bascule sur l’autre devise disponible.
   */
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
        ? roundUsd(primaryAmount)
        : roundCdf(primaryAmount),
    secondaryCurrency,
    secondaryAmount:
      secondaryCurrency === 'USD'
        ? roundUsd(secondaryAmount)
        : roundCdf(secondaryAmount),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CART ITEM                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onSaveForLater,
  disabled = false,
  compact = false,
  showAdvancedActions = true,
  displayCurrency = 'USD',
  showSecondaryPrice = true,
  animationDelay = 0,
  className,
}: CartItemProps) {
  const cart = useCart() as any

  const ctxUpdateQuantity = cart?.updateQuantity
  const ctxRemove = cart?.removeItem
  const ctxSaveForLater = cart?.saveForLater
  const isSyncing = Boolean(cart?.isSyncing)

  const toast = useToast() as any
  const addToast = toast?.addToast

  const exchange = useExchangeRate() as any

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   * On évite donc d’utiliser le taux avant hydratation.
   */
  const rate = mounted ? rawRate : null

  /* ---------------------------------------------------------- */
  /*  États locaux                                               */
  /* ---------------------------------------------------------- */

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [quantityInput, setQuantityInput] = useState<string>(
    String(item.quantite)
  )
  const [isEditingQuantity, setIsEditingQuantity] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [busy, setBusy] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null)

  /* ---------------------------------------------------------- */
  /*  Résolution prix                                            */
  /* ---------------------------------------------------------- */

  const variantKey = useMemo(
    () => stableVariantKey(item),
    [item]
  )

  const variantDisplay = useMemo(
    () => getVariantDisplay(item),
    [item]
  )

  const quantity = safeQuantity(item.quantite)

  const unitPair = useMemo(
    () => resolveUnitPricePair(item, rate),
    [item, rate]
  )

  const linePair = useMemo<PricePair>(
    () => ({
      usd: roundUsd(unitPair.usd * quantity),
      cdf: roundCdf(unitPair.cdf * quantity),
    }),
    [quantity, unitPair]
  )

  const unitDisplay = useMemo(
    () => selectDisplayPrice(unitPair, displayCurrency),
    [displayCurrency, unitPair]
  )

  const lineDisplay = useMemo(
    () => selectDisplayPrice(linePair, displayCurrency),
    [displayCurrency, linePair]
  )

  const stock = useMemo(() => getEffectiveStock(item), [item])

  const isOutOfStock = stock === 0
  const isLowStock =
    stock !== null && stock > 0 && stock <= 5

  const canIncrease =
    stock === null || quantity < stock

  const hasValidPrice =
    unitPair.usd > 0 || unitPair.cdf > 0

  const productHref = useMemo(
    () => getProductHref(item),
    [item]
  )

  /* ---------------------------------------------------------- */
  /*  Callbacks panier                                           */
  /* ---------------------------------------------------------- */

  const handleUpdateQuantity = onUpdateQuantity || ctxUpdateQuantity
  const handleRemove = onRemove || ctxRemove
  const handleSaveForLater = onSaveForLater || ctxSaveForLater

  const executeCartAction = useCallback(
    async (
      action: () => Promise<void>,
      successMessage?: string,
      errorMessage?: string
    ) => {
      setBusy(true)

      try {
        await action()

        if (successMessage) {
          addToast?.({
            type: 'success',
            message: successMessage,
          })
        }
      } catch (err: any) {
        if (err?.code === 'AUTH_REQUIRED') {
          addToast?.({
            type: 'warning',
            message:
              err?.message ||
              'Veuillez vous connecter pour modifier le panier.',
          })
          return
        }

        addToast?.({
          type: 'error',
          message:
            err?.message ||
            errorMessage ||
            'Opération impossible sur le panier.',
        })
      } finally {
        setBusy(false)
      }
    },
    [addToast]
  )

  /* ---------------------------------------------------------- */
  /*  Timers / effets                                            */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(
        () => setConfirmDelete(false),
        4000
      )
    }

    return () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current)
      }
    }
  }, [confirmDelete])

  useEffect(() => {
    setQuantityInput(String(item.quantite))
    setIsEditingQuantity(false)
  }, [item.quantite])

  /* ---------------------------------------------------------- */
  /*  Handlers quantité                                          */
  /* ---------------------------------------------------------- */

  const handleQuantityInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const val = event.target.value.replace(/[^0-9]/g, '')
      setQuantityInput(val)
    },
    []
  )

  const handleQuantityInputBlur = useCallback(() => {
    const newQty = parseInt(quantityInput, 10)

    if (isNaN(newQty) || newQty < 1) {
      setQuantityInput(String(item.quantite))
      setIsEditingQuantity(false)
      return
    }

    const maxStock = stock ?? 999
    const finalQty = Math.min(newQty, maxStock)

    if (finalQty === item.quantite) {
      setIsEditingQuantity(false)
      return
    }

    if (typeof handleUpdateQuantity !== 'function') {
      addToast?.({
        type: 'error',
        message:
          'La mise à jour de quantité n’est pas disponible.',
      })
      setIsEditingQuantity(false)
      return
    }

    void executeCartAction(
      () =>
        handleUpdateQuantity(
          item.id,
          finalQty,
          variantKey
        ),
      undefined,
      `Impossible de mettre à jour la quantité de « ${item.nom} ».`
    )

    setIsEditingQuantity(false)
  }, [
    addToast,
    executeCartAction,
    handleUpdateQuantity,
    item.id,
    item.quantite,
    item.nom,
    quantityInput,
    stock,
    variantKey,
  ])

  const handleQuantityInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        inputRef.current?.blur()
      } else if (event.key === 'Escape') {
        setQuantityInput(String(item.quantite))
        setIsEditingQuantity(false)
      }
    },
    [item.quantite]
  )

  const handleIncrement = useCallback(() => {
    if (!canIncrease) return

    const newQty = Math.min(quantity + 1, stock ?? 999)

    if (newQty === quantity) return

    if (typeof handleUpdateQuantity !== 'function') {
      addToast?.({
        type: 'error',
        message:
          'La mise à jour de quantité n’est pas disponible.',
      })
      return
    }

    void executeCartAction(
      () =>
        handleUpdateQuantity(
          item.id,
          newQty,
          variantKey
        ),
      undefined,
      `Impossible d’augmenter la quantité de « ${item.nom} ».`
    )
  }, [
    addToast,
    canIncrease,
    executeCartAction,
    handleUpdateQuantity,
    item.id,
    item.nom,
    quantity,
    stock,
    variantKey,
  ])

  const handleDecrement = useCallback(() => {
    if (quantity <= 1) return

    if (typeof handleUpdateQuantity !== 'function') {
      addToast?.({
        type: 'error',
        message:
          'La mise à jour de quantité n’est pas disponible.',
      })
      return
    }

    void executeCartAction(
      () =>
        handleUpdateQuantity(
          item.id,
          quantity - 1,
          variantKey
        ),
      undefined,
      `Impossible de diminuer la quantité de « ${item.nom} ».`
    )
  }, [
    addToast,
    executeCartAction,
    handleUpdateQuantity,
    item.id,
    item.nom,
    quantity,
    variantKey,
  ])

  /* ---------------------------------------------------------- */
  /*  Handlers suppression / sauvegarde                          */
  /* ---------------------------------------------------------- */

  const handleRemoveClick = useCallback(() => {
    if (confirmDelete) {
      if (typeof handleRemove !== 'function') {
        addToast?.({
          type: 'error',
          message: 'La suppression n’est pas disponible.',
        })
        return
      }

      void executeCartAction(
        () => handleRemove(item.id, variantKey),
        `${item.nom} retiré du panier.`,
        `Impossible de retirer « ${item.nom} » du panier.`
      )

      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }, [
    addToast,
    confirmDelete,
    executeCartAction,
    handleRemove,
    item.id,
    item.nom,
    variantKey,
  ])

  const handleSaveClick = useCallback(() => {
    if (typeof handleSaveForLater !== 'function') {
      addToast?.({
        type: 'error',
        message:
          'La sauvegarde pour plus tard n’est pas disponible.',
      })
      return
    }

    void executeCartAction(
      () => handleSaveForLater(item.id, variantKey),
      `${item.nom} sauvegardé pour plus tard.`,
      `Impossible de sauvegarder « ${item.nom} ».`
    )
  }, [
    addToast,
    executeCartAction,
    handleSaveForLater,
    item.id,
    item.nom,
    variantKey,
  ])

  const isActionDisabled =
    disabled || isSyncing || busy || !hasValidPrice

  /* ---------------------------------------------------------- */
  /*  Rendu                                                      */
  /* ---------------------------------------------------------- */

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(animationDelay * 0.03, 0.3),
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-card-hover',
        compact ? 'p-3' : 'p-4 md:p-5',
        isOutOfStock && 'opacity-70',
        className
      )}
    >
      {/* Indicateur de synchronisation */}
      <AnimatePresence>
        {(isSyncing || busy) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px] dark:bg-black/20"
          >
            <Loader2
              className="animate-spin text-gold-500"
              size={24}
              aria-hidden="true"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn('flex gap-4', compact && 'gap-3')}>
        {/* Image */}
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-xl bg-muted',
            compact ? 'h-16 w-16' : 'h-20 w-20 sm:h-24 sm:w-24'
          )}
        >
          {item.image && !imageError ? (
            <Link
              href={productHref}
              aria-label={item.nom}
              className="block h-full w-full"
            >
              <Image
                src={item.image}
                alt={item.nom}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes={compact ? '64px' : '96px'}
                onError={() => setImageError(true)}
              />
            </Link>
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-muted-foreground"
              aria-hidden="true"
            >
              <ShoppingBag size={compact ? 20 : 24} />
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold text-white">
              Rupture
            </div>
          )}
        </div>

        {/* Informations */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <Link
                href={productHref}
                className="line-clamp-2 font-semibold text-foreground transition-colors hover:text-gold-500"
              >
                {item.nom}
              </Link>

              {showAdvancedActions && (
                <Tooltip content="Sauvegarder pour plus tard">
                  <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={isActionDisabled}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-500 disabled:opacity-40"
                    aria-label={`Sauvegarder ${item.nom} pour plus tard`}
                  >
                    <Bookmark size={16} aria-hidden="true" />
                  </button>
                </Tooltip>
              )}
            </div>

            {variantDisplay && (
              <p className="mt-0.5 truncate text-xs text-gold-600 dark:text-gold-400">
                {variantDisplay}
              </p>
            )}

            {item.remise != null && item.remise > 0 && (
              <Badge variant="danger" size="sm" className="mt-1">
                -{item.remise}%
              </Badge>
            )}

            {isLowStock && !isOutOfStock && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle size={12} aria-hidden="true" />
                Plus que {stock} en stock
              </p>
            )}
          </div>

          {/* Contrôle de quantité + actions */}
          <div
            className={cn(
              'mt-3 flex flex-wrap items-center gap-2',
              compact && 'gap-1'
            )}
          >
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-0.5 shadow-inner">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={quantity <= 1 || isActionDisabled}
                className={cn(
                  'flex items-center justify-center rounded-full bg-card transition-all hover:bg-gold-400/10 disabled:opacity-40',
                  compact ? 'h-7 w-7' : 'h-8 w-8'
                )}
                aria-label="Diminuer la quantité"
              >
                <Minus
                  size={compact ? 12 : 14}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </button>

              {isEditingQuantity ? (
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={quantityInput}
                  onChange={handleQuantityInputChange}
                  onBlur={handleQuantityInputBlur}
                  onKeyDown={handleQuantityInputKeyDown}
                  className={cn(
                    'bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none',
                    compact ? 'w-8 text-xs' : 'w-10'
                  )}
                  autoFocus
                  disabled={isActionDisabled}
                  aria-label={`Quantité pour ${item.nom}`}
                />
              ) : (
                <span
                  className={cn(
                    'cursor-pointer text-center text-sm font-semibold tabular-nums text-foreground transition-colors hover:text-gold-500',
                    compact ? 'w-8 text-xs' : 'w-10'
                  )}
                  onClick={() => {
                    if (!isActionDisabled) {
                      setIsEditingQuantity(true)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Modifier la quantité de ${item.nom}`}
                >
                  {quantity}
                </span>
              )}

              <button
                type="button"
                onClick={handleIncrement}
                disabled={!canIncrease || isActionDisabled}
                className={cn(
                  'flex items-center justify-center rounded-full bg-card transition-all hover:bg-gold-400/10 disabled:opacity-40',
                  compact ? 'h-7 w-7' : 'h-8 w-8'
                )}
                aria-label="Augmenter la quantité"
              >
                <Plus
                  size={compact ? 12 : 14}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip
                content={
                  confirmDelete
                    ? 'Confirmer la suppression'
                    : 'Retirer du panier'
                }
              >
                <button
                  type="button"
                  onClick={handleRemoveClick}
                  disabled={isActionDisabled}
                  className={cn(
                    'rounded-lg transition-colors disabled:opacity-40',
                    confirmDelete
                      ? 'bg-red-500/10 font-semibold text-red-500'
                      : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500',
                    compact ? 'p-1' : 'p-1.5'
                  )}
                  aria-label={
                    confirmDelete ? 'Confirmer' : 'Retirer'
                  }
                >
                  {confirmDelete ? (
                    <AlertTriangle
                      size={compact ? 14 : 16}
                      className="animate-pulse"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2
                      size={compact ? 14 : 16}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </Tooltip>

              {confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={cn(
                    'rounded-lg text-green-500 transition-colors hover:bg-green-500/10',
                    compact ? 'p-1' : 'p-1.5'
                  )}
                  aria-label="Annuler la suppression"
                >
                  <X
                    size={compact ? 14 : 16}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Prix */}
        <div
          className={cn(
            'flex shrink-0 flex-col items-end justify-between text-right',
            compact && 'gap-1'
          )}
        >
          <div>
            <p
              className={cn(
                'font-bold text-gold-600',
                compact ? 'text-sm' : 'text-lg'
              )}
            >
              {hasValidPrice
                ? formatMoney(
                    lineDisplay.primaryAmount,
                    lineDisplay.primaryCurrency
                  )
                : '—'}
            </p>

            {showSecondaryPrice &&
              hasValidPrice &&
              lineDisplay.secondaryAmount > 0 &&
              lineDisplay.secondaryAmount !==
                lineDisplay.primaryAmount && (
                <p
                  className={cn(
                    'text-muted-foreground',
                    compact ? 'text-[10px]' : 'text-xs'
                  )}
                >
                  ≈{' '}
                  {formatMoney(
                    lineDisplay.secondaryAmount,
                    lineDisplay.secondaryCurrency
                  )}
                </p>
              )}

            {quantity > 1 && hasValidPrice && (
              <p
                className={cn(
                  'text-muted-foreground',
                  compact ? 'text-[10px]' : 'text-xs'
                )}
              >
                {formatMoney(
                  unitDisplay.primaryAmount,
                  unitDisplay.primaryCurrency
                )}{' '}
                / unité
              </p>
            )}

            {rateLoading && !rate && hasValidPrice && (
              <p
                className={cn(
                  'text-amber-500',
                  compact ? 'text-[10px]' : 'text-xs'
                )}
              >
                Conversion en cours…
              </p>
            )}
          </div>

          {isOutOfStock && (
            <Badge variant="danger" size="sm">
              Épuisé
            </Badge>
          )}
        </div>
      </div>
    </motion.div>
  )
}