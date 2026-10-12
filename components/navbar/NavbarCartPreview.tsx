'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ShoppingBag,
  Trash2,
  ArrowRight,
  X,
} from 'lucide-react'

/* ========================================================================== */
/*  Types (partagés avec NavbarActions / CartContext)                          */
/* ========================================================================== */

export interface CartPreviewItem {
  id: string
  nom: string
  prix?: number
  prix_initial?: number
  remise?: number
  quantite: number
  image?: string
  variante?: { attributes: Record<string, string> }
}

interface NavbarCartPreviewProps {
  /** Articles du panier à afficher */
  items: CartPreviewItem[]
  /** Nombre total d'articles (si différent de items.length) */
  totalItems?: number
  /** Sous‑total du panier (FC) */
  subTotal?: number
  /** Callback pour supprimer un article (si fourni, affiche un bouton) */
  onRemove?: (id: string) => void
  /** Callback pour fermer la preview */
  onClose?: () => void
  /** Nombre maximum d'articles affichés avant "+X autres" */
  maxVisible?: number
  /** État de chargement */
  loading?: boolean
  /** Classes additionnelles */
  className?: string
}

/* ========================================================================== */
/*  Sous‑composant : une ligne d'article                                       */
/* ========================================================================== */

function CartPreviewRow({
  item,
  onRemove,
}: {
  item: CartPreviewItem
  onRemove?: (id: string) => void
}) {
  const itemTotal = (item.prix || 0) * item.quantite
  const variantDisplay = item.variante?.attributes
    ? Object.entries(item.variante.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null

  return (
    <div className="flex gap-3 items-start group">
      {/* Image */}
      <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden relative flex-shrink-0">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.nom}
            fill
            className="object-cover"
            sizes="48px"
          />
        ) : (
          <ShoppingBag size={18} className="m-auto text-neutral-400" />
        )}
        {item.remise && item.remise > 0 && (
          <Badge variant="danger" size="sm" className="absolute -top-1 -right-1 text-[9px] px-1">
            -{item.remise}%
          </Badge>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
          {item.nom}
        </p>
        {variantDisplay && (
          <p className="text-xs text-gold-600 truncate">{variantDisplay}</p>
        )}
        <p className="text-xs text-neutral-500 mt-0.5">
          {item.quantite} × {(item.prix || 0).toLocaleString()} FC
        </p>
      </div>

      {/* Total + suppression */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gold-600">
          {itemTotal.toLocaleString()} FC
        </p>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(item.id)
            }}
            className="mt-1 p-1 rounded-md text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Supprimer ${item.nom}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */

export function NavbarCartPreview({
  items,
  totalItems,
  subTotal,
  onRemove,
  onClose,
  maxVisible = 3,
  loading = false,
  className,
}: NavbarCartPreviewProps) {
  const visibleItems = items.slice(0, maxVisible)
  const hiddenCount = items.length - visibleItems.length
  const displayedTotal = totalItems ?? items.length
  const total = subTotal ?? items.reduce((sum, i) => sum + (i.prix || 0) * i.quantite, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={cn(
        // Positionnement : centré sur mobile, aligné à droite sur desktop
        'absolute left-1/2 sm:left-auto sm:right-0 top-full mt-2',
        // Largeur adaptative
        'w-[calc(100vw-2rem)] max-w-[320px] sm:w-80',
        'bg-white/95 dark:bg-midnight-800/95 backdrop-blur-xl rounded-xl shadow-strong border border-gold-400/20 p-4 z-20',
        'transform -translate-x-1/2 sm:translate-x-0',
        className
      )}
    >
      {/* En‑tête */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
          Panier ({displayedTotal})
        </h3>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          )}
          {items.length > 0 && (
            <Link
              href="/panier"
              className="text-xs text-gold-600 hover:underline"
              onClick={onClose}
            >
              Voir tout
            </Link>
          )}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <Skeleton variant="rectangular" className="w-12 h-12 rounded-lg" shimmer shimmerVariant="gold" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-3/4 h-4" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-1/2 h-3" shimmer shimmerVariant="gold" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <ShoppingBag size={32} className="text-neutral-300 mb-2" />
          <p className="text-sm text-neutral-500">Votre panier est vide</p>
          <Link
            href="/search"
            className="text-xs text-gold-600 hover:underline mt-1"
            onClick={onClose}
          >
            Découvrir des produits
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {visibleItems.map((item) => (
              <CartPreviewRow
                key={item.id}
                item={item}
                onRemove={onRemove}
              />
            ))}
            {hiddenCount > 0 && (
              <p className="text-xs text-neutral-400 text-center py-1">
                + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} article{hiddenCount > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Sous‑total */}
          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-midnight-500/30">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-neutral-500">Sous‑total</span>
              <span className="text-sm font-bold text-gold-600">
                {total.toLocaleString()} FC
              </span>
            </div>
            <Link href="/panier" onClick={onClose}>
              <Button variant="luxe" size="sm" fullWidth rightIcon={<ArrowRight size={14} />}>
                Voir le panier
              </Button>
            </Link>
          </div>
        </>
      )}
    </motion.div>
  )
}