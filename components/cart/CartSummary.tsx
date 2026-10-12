// components/cart/CartSummary.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ShoppingBag, Truck, ShieldCheck, RefreshCw,
  ChevronRight, X, Percent, Tag, Loader2,
} from 'lucide-react'
import { useCart } from '@/contexts/CartContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types locaux                                                               */
/* ========================================================================== */
interface CartSummaryProps {
  onCheckout?: () => void
  showCheckoutButton?: boolean
  compact?: boolean
  className?: string
}

/* ========================================================================== */
/*  Composant                                                                  */
/* ========================================================================== */
export default function CartSummary({
  onCheckout,
  showCheckoutButton = true,
  compact = false,
  className,
}: CartSummaryProps) {
  const {
    items,
    summary,
    applyPromoCode,
    removePromoCode,
    activePromo,
    promoError: promoErrorMessage,
    clearCart,
    removeItem,
    updateQuantity,
  } = useCart()

  const [promoInput, setPromoInput] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)

  // Application du code promo
  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return
    setApplyingPromo(true)
    await applyPromoCode(promoInput.trim())
    setApplyingPromo(false)
    setPromoInput('')
  }

  // Si le panier est vide
  if (items.length === 0) {
    return (
      <Card variant="glass" className={cn('border-gold-400/20', className)}>
        <CardContent className="p-6 text-center">
          <ShoppingBag size={48} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Votre panier est vide</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Parcourez notre catalogue et ajoutez des articles à votre panier.
          </p>
          <Link href="/produits">
            <Button variant="luxe" size="sm">
              Explorer les produits
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="glass" className={cn('border-gold-400/20 bg-card/70 backdrop-blur-xl shadow-soft', className)}>
      <CardHeader className={cn(compact && 'pb-2')}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingBag size={20} className="text-gold-500" />
          Récapitulatif
        </CardTitle>
        <CardDescription>
          {items.length} article{items.length > 1 ? 's' : ''}
          {!compact && ` • ${summary.totalItems} unité(s)`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Liste des articles (version compacte ou complète) */}
        {!compact && (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className="flex gap-3 items-start p-2 rounded-xl hover:bg-gold-400/5 transition-colors group"
              >
                {/* Image produit */}
                <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.nom}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <ShoppingBag size={20} className="absolute inset-0 m-auto text-muted-foreground" />
                  )}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/produits/${item.id}`}
                    className="text-sm font-medium truncate hover:text-gold-500 transition-colors block"
                  >
                    {item.nom}
                  </Link>
                  {item.variante && (
                    <p className="text-xs text-muted-foreground">
                      {Object.values(item.variante.attributes).join(' / ')}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {/* Contrôle quantité (compact) */}
                    <div className="flex items-center border border-border rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantite - 1, item.variante ? JSON.stringify(item.variante.attributes) : undefined)}
                        className="px-1.5 py-0.5 text-xs hover:bg-gold-400/10 transition-colors rounded-l-lg"
                        disabled={item.quantite <= 1}
                      >
                        -
                      </button>
                      <span className="px-2 text-xs font-medium">{item.quantite}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantite + 1, item.variante ? JSON.stringify(item.variante.attributes) : undefined)}
                        className="px-1.5 py-0.5 text-xs hover:bg-gold-400/10 transition-colors rounded-r-lg"
                        disabled={item.stock_disponible !== undefined && item.quantite >= item.stock_disponible}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      × {item.prix.toLocaleString()} FC
                    </span>
                  </div>
                </div>

                {/* Prix total + suppression */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-gold-600">
                    {(item.prix * item.quantite).toLocaleString()} FC
                  </span>
                  <button
                    onClick={() => removeItem(item.id, item.variante ? JSON.stringify(item.variante.attributes) : undefined)}
                    className="text-xs text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Retirer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Séparateur */}
        <hr className="border-gold-400/20" />

        {/* Code promo */}
        {activePromo ? (
          <div className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <Percent size={16} className="text-green-600" />
              <span className="font-medium text-green-800 dark:text-green-200">
                {activePromo.code}
              </span>
              <Badge variant="accent" size="sm" className="bg-green-100 text-green-700">
                -{activePromo.value}%
              </Badge>
            </div>
            <button
              onClick={removePromoCode}
              className="text-red-500 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
              title="Retirer le code"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                variant="glass"
                size="sm"
                placeholder="Code promo"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                className="pl-9 uppercase placeholder:normal-case"
              />
            </div>
            <Button
              variant="outline-gold"
              size="sm"
              onClick={handleApplyPromo}
              loading={applyingPromo}
              disabled={!promoInput.trim()}
            >
              Appliquer
            </Button>
          </div>
        )}
        {promoErrorMessage && (
          <p className="text-red-500 text-xs flex items-center gap-1">
            <X size={12} /> {promoErrorMessage}
          </p>
        )}

        {/* Détail des montants */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Sous-total</span>
            <span>{summary.sousTotal.toLocaleString()} FC</span>
          </div>

          {summary.remiseTotal > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Réduction{activePromo && ` (${activePromo.code})`}</span>
              <span>-{summary.remiseTotal.toLocaleString()} FC</span>
            </div>
          )}

          <div className="flex justify-between text-muted-foreground">
            <span>Livraison</span>
            <span>
              {summary.fraisLivraison === 0 ? (
                <span className="text-green-600 font-medium">Gratuite</span>
              ) : (
                `${summary.fraisLivraison.toLocaleString()} FC`
              )}
            </span>
          </div>
        </div>

        {/* Total */}
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-gold-400/20">
          <span>Total</span>
          <span className="text-gold-600">{summary.total.toLocaleString()} FC</span>
        </div>
        {summary.totalUSD && (
          <p className="text-xs text-right text-muted-foreground -mt-2">
            ≈ ${summary.totalUSD.toFixed(2)} USD
          </p>
        )}

        {/* Info livraison gratuite */}
        {summary.fraisLivraison > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
            <Truck size={14} className="text-amber-600" />
            <span>Plus que {(50000 - summary.total).toLocaleString()} FC pour la livraison gratuite</span>
          </div>
        )}

        {/* Sécurité */}
        <div className="space-y-2 pt-2 border-t border-gold-400/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} className="text-gold-500" />
            Paiement 100 % sécurisé
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw size={14} className="text-gold-500" />
            Retours gratuits sous 7 jours
          </div>
        </div>

        {/* Bouton Commander */}
        {showCheckoutButton && (
          <div className="space-y-2 pt-2">
            <Button
              variant="luxe"
              fullWidth
              size="lg"
              onClick={onCheckout}
              className="shadow-gold hover:shadow-glow-gold"
              leftIcon={<ChevronRight size={18} />}
            >
              Commander
            </Button>
            <button
              onClick={clearCart}
              className="w-full text-center text-xs text-muted-foreground hover:text-red-500 transition-colors"
            >
              Vider le panier
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}