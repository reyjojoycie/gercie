// components/CartItem.tsx
'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart, type CartItem as CartItemType } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  Heart,
  Bookmark,
  Loader2,
  AlertTriangle,
  Check,
  X,
  GripVertical,
  Star,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types (alignés avec CartContext)                                           */
/* ========================================================================== */

interface CartItemProps {
  /** L'article du panier */
  item: CartItemType
  /** Callback pour mettre à jour la quantité (si fourni, surcharge le contexte) */
  onUpdateQuantity?: (id: string, quantity: number, variantKey?: string) => Promise<void>
  /** Callback pour supprimer l'article */
  onRemove?: (id: string, variantKey?: string) => Promise<void>
  /** Callback pour sauvegarder pour plus tard */
  onSaveForLater?: (id: string, variantKey?: string) => Promise<void>
  /** Désactiver les interactions (mode synchro) */
  disabled?: boolean
  /** Variante compacte (utilisée dans une liste étroite) */
  compact?: boolean
  /** Affiche les boutons d'action avancés (favoris, partager) */
  showAdvancedActions?: boolean
  /** Index pour l'animation (décalage) */
  animationDelay?: number
  /** Classe additionnelle */
  className?: string
}

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

function getVariantKey(item: CartItemType): string | undefined {
  if (!item.variante?.attributes) return undefined
  return JSON.stringify(item.variante.attributes)
}

function getVariantDisplay(item: CartItemType): string | null {
  if (!item.variante?.attributes) return null
  return Object.entries(item.variante.attributes)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

function getItemTotal(item: CartItemType): number {
  return item.prix * item.quantite
}

/* ========================================================================== */
/*  Composant CartItem                                                         */
/* ========================================================================== */

export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onSaveForLater,
  disabled = false,
  compact = false,
  showAdvancedActions = true,
  animationDelay = 0,
  className,
}: CartItemProps) {
  // Contexte du panier (fallback si pas de callbacks)
  const {
    updateQuantity: ctxUpdateQuantity,
    removeItem: ctxRemove,
    saveForLater: ctxSaveForLater,
    isSyncing,
  } = useCart()
  const { rate } = useExchangeRate()

  // États locaux
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [quantityInput, setQuantityInput] = useState<string>(String(item.quantite))
  const [isEditingQuantity, setIsEditingQuantity] = useState(false)
  const [imageError, setImageError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null)

  const variantKey = getVariantKey(item)
  const variantDisplay = getVariantDisplay(item)
  const itemTotal = getItemTotal(item)
  const itemTotalUSD = rate ? itemTotal / rate : null

  // Utiliser les callbacks passés ou ceux du contexte
  const handleUpdateQuantity = onUpdateQuantity || ctxUpdateQuantity
  const handleRemove = onRemove || ctxRemove
  const handleSaveForLater = onSaveForLater || ctxSaveForLater

  // Réinitialiser le confirm delete après un délai
  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 4000)
    }
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    }
  }, [confirmDelete])

  // Synchroniser l'input quantité avec la prop
  useEffect(() => {
    setQuantityInput(String(item.quantite))
    setIsEditingQuantity(false)
  }, [item.quantite])

  // Gérer le changement de quantité via l'input
  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '')
    setQuantityInput(val)
  }

  const handleQuantityInputBlur = () => {
    const newQty = parseInt(quantityInput, 10)
    if (isNaN(newQty) || newQty < 1) {
      setQuantityInput(String(item.quantite)) // reset
      return
    }
    const maxStock = item.stock ?? 999
    const finalQty = Math.min(newQty, maxStock)
    handleUpdateQuantity(item.id, finalQty, variantKey)
    setIsEditingQuantity(false)
  }

  const handleQuantityInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setQuantityInput(String(item.quantite))
      setIsEditingQuantity(false)
    }
  }

  const handleIncrement = () => {
    const newQty = Math.min(item.quantite + 1, item.stock ?? 999)
    handleUpdateQuantity(item.id, newQty, variantKey)
  }

  const handleDecrement = () => {
    if (item.quantite <= 1) return
    handleUpdateQuantity(item.id, item.quantite - 1, variantKey)
  }

  const handleRemoveClick = () => {
    if (confirmDelete) {
      handleRemove(item.id, variantKey)
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }

  const handleSaveClick = () => {
    handleSaveForLater(item.id, variantKey)
  }

  const isActionDisabled = disabled || isSyncing

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, delay: animationDelay * 0.03 }}
      className={cn(
        'group relative bg-card border border-border rounded-2xl overflow-hidden transition-all hover:shadow-card-hover',
        compact ? 'p-3' : 'p-4 md:p-5',
        className
      )}
    >
      {/* Indicateur de synchronisation */}
      <AnimatePresence>
        {isSyncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/40 dark:bg-black/20 backdrop-blur-[1px] z-10 flex items-center justify-center"
          >
            <Loader2 className="animate-spin text-gold-500" size={24} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn('flex gap-4', compact && 'gap-3')}>
        {/* Image */}
        <div className={cn(
          'relative rounded-xl overflow-hidden flex-shrink-0 bg-muted',
          compact ? 'w-16 h-16' : 'w-20 h-20 sm:w-24 sm:h-24'
        )}>
          {item.image && !imageError ? (
            <Link href={`/produits/${item.id}`} aria-label={item.nom}>
              <Image
                src={item.image}
                alt={item.nom}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes={compact ? '64px' : '96px'}
                onError={() => setImageError(true)}
              />
            </Link>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <ShoppingBag size={compact ? 20 : 24} />
            </div>
          )}
        </div>

        {/* Informations */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/produits/${item.id}`}
                className="font-semibold text-foreground hover:text-gold-500 transition-colors line-clamp-2"
              >
                {item.nom}
              </Link>
              {showAdvancedActions && (
                <Tooltip content="Sauvegarder pour plus tard">
                  <button
                    onClick={handleSaveClick}
                    disabled={isActionDisabled}
                    className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    aria-label="Sauvegarder pour plus tard"
                  >
                    <Bookmark size={16} />
                  </button>
                </Tooltip>
              )}
            </div>

            {variantDisplay && (
              <p className="text-xs text-gold-600 dark:text-gold-400 mt-0.5">
                {variantDisplay}
              </p>
            )}

            {item.remise && item.remise > 0 && (
              <Badge variant="danger" size="sm" className="mt-1">-{item.remise}%</Badge>
            )}

            {item.stock !== undefined && item.stock <= 5 && item.stock > 0 && (
              <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> Plus que {item.stock}
              </p>
            )}
          </div>

          {/* Contrôle de quantité + actions */}
          <div className={cn('flex items-center gap-2 mt-3 flex-wrap', compact && 'gap-1')}>
            <div className="flex items-center gap-1 bg-muted rounded-full p-0.5 shadow-inner border border-border">
              <button
                onClick={handleDecrement}
                disabled={item.quantite <= 1 || isActionDisabled}
                className={cn(
                  'rounded-full bg-card hover:bg-gold-400/10 flex items-center justify-center transition-all disabled:opacity-40',
                  compact ? 'w-7 h-7' : 'w-8 h-8'
                )}
                aria-label="Diminuer la quantité"
              >
                <Minus size={compact ? 12 : 14} className="text-muted-foreground" />
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
                    'w-10 text-center text-sm font-semibold bg-transparent outline-none text-foreground tabular-nums',
                    compact && 'w-8 text-xs'
                  )}
                  autoFocus
                  disabled={isActionDisabled}
                />
              ) : (
                <span
                  className={cn(
                    'text-center text-sm font-semibold tabular-nums cursor-pointer hover:text-gold-500',
                    compact && 'w-8 text-xs',
                    !compact && 'w-10'
                  )}
                  onClick={() => setIsEditingQuantity(true)}
                  title="Cliquez pour modifier"
                >
                  {item.quantite}
                </span>
              )}

              <button
                onClick={handleIncrement}
                disabled={isActionDisabled || (item.stock !== undefined && item.quantite >= item.stock)}
                className={cn(
                  'rounded-full bg-card hover:bg-gold-400/10 flex items-center justify-center transition-all disabled:opacity-40',
                  compact ? 'w-7 h-7' : 'w-8 h-8'
                )}
                aria-label="Augmenter la quantité"
              >
                <Plus size={compact ? 12 : 14} className="text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip content={confirmDelete ? 'Confirmer la suppression' : 'Retirer du panier'}>
                <button
                  onClick={handleRemoveClick}
                  disabled={isActionDisabled}
                  className={cn(
                    'rounded-lg transition-colors',
                    confirmDelete
                      ? 'text-red-500 bg-red-50 dark:bg-red-900/20 font-semibold'
                      : 'text-muted-foreground hover:text-red-500',
                    compact ? 'p-1' : 'p-1.5'
                  )}
                  aria-label={confirmDelete ? 'Confirmer' : 'Retirer'}
                >
                  {confirmDelete ? (
                    <AlertTriangle size={compact ? 14 : 16} className="animate-pulse" />
                  ) : (
                    <Trash2 size={compact ? 14 : 16} />
                  )}
                </button>
              </Tooltip>
              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className={cn(
                    'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg',
                    compact ? 'p-1' : 'p-1.5'
                  )}
                  aria-label="Annuler"
                >
                  <X size={compact ? 14 : 16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Prix */}
        <div className={cn('flex-shrink-0 text-right flex flex-col items-end justify-between', compact && 'gap-1')}>
          <div>
            <p className={cn('font-bold text-gold-600', compact ? 'text-sm' : 'text-lg')}>
              {itemTotal.toLocaleString()} FC
            </p>
            {item.quantite > 1 && (
              <p className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
                {item.prix.toLocaleString()} FC / unité
              </p>
            )}
            {itemTotalUSD && (
              <p className={cn('text-gold-500', compact ? 'text-[10px]' : 'text-xs')}>
                ≈ {itemTotalUSD.toFixed(2)} USD
              </p>
            )}
          </div>
          {item.stock !== undefined && item.stock === 0 && (
            <Badge variant="danger" size="sm">Épuisé</Badge>
          )}
        </div>
      </div>
    </motion.div>
  )
}