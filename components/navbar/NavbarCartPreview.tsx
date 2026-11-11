// components/navbar/NavbarCartPreview.tsx
'use client'

import React, { useMemo } from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { cn } from '@/lib/utils'

import {
  ArrowRight,
  Percent,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface CartPreviewItem {
  id: string
  nom: string
  prix?: number
  prix_initial?: number
  remise?: number
  quantite: number
  image?: string
  variante?: {
    attributes?: Record<string, string>
  }
}

export interface NavbarCartPreviewProps {
  items: CartPreviewItem[]
  totalItems?: number
  subTotal?: number
  onRemove?: (id: string) => void
  onClose?: () => void
  maxVisible?: number
  loading?: boolean
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function formatFC(value: number | null | undefined): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n)) return '0 FC'

  return `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} FC`
}

function getItemImage(item: CartPreviewItem): string | null {
  if (typeof item.image === 'string' && item.image.trim()) {
    return item.image
  }

  return null
}

function getItemUnitPrice(item: CartPreviewItem): number {
  return Number(item.prix ?? 0)
}

function getItemOriginalPrice(item: CartPreviewItem): number {
  return Number(item.prix_initial ?? item.prix ?? 0)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROW                                                            */
/* ═══════════════════════════════════════════════════════════════ */

function CartPreviewRow({
  item,
  onRemove,
}: {
  item: CartPreviewItem
  onRemove?: (id: string) => void
}) {
  const image = getItemImage(item)
  const unitPrice = getItemUnitPrice(item)
  const originalPrice = getItemOriginalPrice(item)
  const hasDiscount = originalPrice > unitPrice

  return (
    <div className="flex items-start gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-muted">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-muted">
        {image ? (
          <Image
            src={image}
            alt={item.nom}
            width={48}
            height={48}
            className="h-12 w-12 object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-fg-subtle"
            aria-hidden="true"
          >
            <ShoppingBag size={16} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-semibold text-fg">
          {item.nom}
        </p>

        <p className="mt-1 text-[11px] text-fg-muted">
          Qté : {item.quantite}
        </p>

        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xs font-bold text-fg">
            {formatFC(unitPrice * item.quantite)}
          </span>

          {hasDiscount ? (
            <span className="text-[10px] text-fg-subtle line-through">
              {formatFC(originalPrice * item.quantite)}
            </span>
          ) : null}
        </div>
      </div>

      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove(item.id)
          }}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-200 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          aria-label={`Retirer ${item.nom} du panier`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

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
  const safeItems = useMemo(() => {
    return Array.isArray(items) ? items : []
  }, [items])

  const visibleItems = safeItems.slice(0, maxVisible)
  const hiddenCount = safeItems.length - visibleItems.length

  const displayedTotal =
    totalItems ??
    safeItems.reduce((sum, item) => sum + Number(item.quantite ?? 1), 0)

  const subtotal =
    subTotal ??
    safeItems.reduce(
      (sum, item) => sum + getItemUnitPrice(item) * Number(item.quantite ?? 1),
      0
    )

  const savings = useMemo(() => {
    return safeItems.reduce((sum, item) => {
      const original = getItemOriginalPrice(item)
      const current = getItemUnitPrice(item)
      const quantity = Number(item.quantite ?? 1)

      return sum + Math.max(0, (original - current) * quantity)
    }, 0)
  }, [safeItems])

  return (
    <div
      role="dialog"
      aria-label="Aperçu du panier"
      className={cn(
        'absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-card border border-line bg-surface shadow-card',
        className
      )}
      onMouseLeave={onClose}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-fg">Votre panier</p>

          <p className="text-[11px] text-fg-muted">
            {displayedTotal} article{displayedTotal > 1 ? 's' : ''}
          </p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Fermer l’aperçu du panier"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={`cart-preview-skeleton-${index}`} className="flex gap-3">
              <div className="skeleton h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-3/4 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : safeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <ShoppingBag
            size={28}
            className="text-fg-subtle"
            aria-hidden="true"
          />

          <p className="text-sm font-medium text-fg">
            Votre panier est vide
          </p>

          <Link
            href="/search"
            onClick={onClose}
            className="text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Découvrir des produits
          </Link>
        </div>
      ) : (
        <>
          <div className="max-h-64 space-y-1 overflow-y-auto p-2">
            {visibleItems.map((item) => (
              <CartPreviewRow
                key={item.id}
                item={item}
                onRemove={onRemove}
              />
            ))}

            {hiddenCount > 0 ? (
              <p className="py-1 text-center text-[11px] text-fg-subtle">
                + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} article
                {hiddenCount > 1 ? 's' : ''}
              </p>
            ) : null}
          </div>

          <div className="border-t border-line p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Sous-total</span>
              <span className="font-bold text-fg">{formatFC(subtotal)}</span>
            </div>

            {savings > 0 ? (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <Percent size={12} aria-hidden="true" />
                  Économies
                </span>

                <span className="font-semibold text-success">
                  −{formatFC(savings)}
                </span>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
              Livraison et taxes calculées à l’étape suivante.
            </p>

            <Link
              href="/panier"
              onClick={onClose}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-card transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Voir le panier
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full text-center text-xs font-medium text-fg-muted transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Continuer mes achats
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export default NavbarCartPreview