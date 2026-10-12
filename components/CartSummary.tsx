// components/CartSummary.tsx
'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Tag,
  Gift,
  Truck,
  ShieldCheck,
  Clock,
  CreditCard,
  Wallet,
  Sparkles,
  ChevronRight,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
  Percent,
  Star,
  Zap,
  TrendingDown,
  Lock,
  RefreshCw,
  ArrowRight,
  Package,
  MapPin,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types internes                                                             */
/* ========================================================================== */

interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minTotal?: number
  maxDiscount?: number
  description?: string
}

/* ========================================================================== */
/*  Composant CartSummary                                                      */
/* ========================================================================== */

interface CartSummaryProps {
  /** Variante d'affichage (sticky sidebar, inline, compact) */
  variant?: 'sidebar' | 'inline' | 'compact'
  /** Afficher le champ de code promo */
  showPromoCode?: boolean
  /** Afficher les garanties */
  showTrustBadges?: boolean
  /** Afficher la barre de progression (livraison gratuite) */
  showFreeShippingProgress?: boolean
  /** Seuil de livraison gratuite (en CDF) */
  freeShippingThreshold?: number
  /** Afficher les frais de livraison estimés */
  showShippingEstimate?: boolean
  /** Callback personnalisé avant de passer commande */
  onCheckout?: () => void
  /** Classe additionnelle */
  className?: string
}

export function CartSummary({
  variant = 'sidebar',
  showPromoCode = true,
  showTrustBadges = true,
  showFreeShippingProgress = true,
  freeShippingThreshold = 50000, // 50 000 FC
  showShippingEstimate = true,
  onCheckout,
  className,
}: CartSummaryProps) {
  const router = useRouter()
  const {
    items,
    summary,
    totalItems,
    activePromo,
    isSyncing,
    applyPromoCode,
    removePromoCode,
  } = useCart()
  const { rate } = useExchangeRate()
  const toast = useToast()

  // État local pour le code promo
  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [delaiEstime] = useState('2-4 jours') // À terme, calculé selon l'adresse

  // Calculs de progression livraison gratuite
  const progressPercent = useMemo(() => {
    if (!showFreeShippingProgress) return 100
    const missing = freeShippingThreshold - summary.sousTotal
    if (missing <= 0) return 100
    return Math.round((summary.sousTotal / freeShippingThreshold) * 100)
  }, [summary.sousTotal, freeShippingThreshold, showFreeShippingProgress])

  const missingForFreeShipping = useMemo(() => {
    const missing = freeShippingThreshold - summary.sousTotal
    return missing > 0 ? missing : 0
  }, [freeShippingThreshold, summary.sousTotal])

  const isFreeShipping = missingForFreeShipping === 0 && summary.sousTotal > 0

  // Gestion du code promo
  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const success = await applyPromoCode(promoInput.trim())
      if (success) {
        setPromoInput('')
        toast.addToast({ type: 'success', message: 'Code promo appliqué !' })
      } else {
        setPromoError('Code invalide ou expiré')
      }
    } catch {
      setPromoError('Erreur lors de la validation')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    removePromoCode()
    toast.addToast({ type: 'info', message: 'Code promo retiré' })
  }

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.addToast({ type: 'warning', message: 'Votre panier est vide' })
      return
    }
    if (onCheckout) {
      onCheckout()
    } else {
      router.push('/commande')
    }
  }

  // ─── Rendu principal ──────────────────────────────────────────────
  return (
    <div className={cn(
      'flex flex-col gap-4',
      variant === 'sidebar' && 'sticky top-24',
      className
    )}>
      {/* Carte principale */}
      <div className={cn(
        'rounded-2xl border-2 border-gold-400/20 shadow-gold overflow-hidden',
        'bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl',
        variant === 'compact' ? 'p-4' : 'p-5 md:p-6'
      )}>
        {/* En-tête */}
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-lg bg-gold-100 dark:bg-gold-900/30">
            <Tag size={variant === 'compact' ? 16 : 20} className="text-gold-500" />
          </div>
          <div>
            <h3 className={cn('font-bold text-foreground font-serif', variant === 'compact' ? 'text-base' : 'text-lg')}>
              Récapitulatif
            </h3>
            <p className="text-xs text-muted-foreground">
              {totalItems} article{totalItems > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Ligne sous-total */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Sous-total</span>
            <span className="font-semibold text-foreground">{summary.sousTotal.toLocaleString()} FC</span>
          </div>

          {/* Réduction active */}
          <AnimatePresence>
            {activePromo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex justify-between text-green-600 dark:text-green-400"
              >
                <span className="flex items-center gap-1">
                  <Percent size={14} />
                  Réduction ({activePromo.code})
                </span>
                <span>-{summary.remiseTotal.toLocaleString()} FC</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Frais de livraison estimés */}
          {showShippingEstimate && (
            <div className="flex justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Truck size={14} />
                Livraison estimée
              </span>
              <span className={cn(isFreeShipping && 'text-green-600 line-through')}>
                {summary.fraisLivraison === 0 ? 'Gratuite' : `${summary.fraisLivraison.toLocaleString()} FC`}
              </span>
            </div>
          )}

          {/* Économies réalisées */}
          {summary.remiseTotal > 0 && (
            <div className="flex justify-between text-green-600 text-xs">
              <span>Vous économisez</span>
              <span className="font-medium">{summary.remiseTotal.toLocaleString()} FC</span>
            </div>
          )}

          {/* Conversion USD */}
          {rate && summary.total > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Soit environ</span>
              <span>≈ {(summary.total / rate).toFixed(2)} USD</span>
            </div>
          )}
        </div>

        {/* Barre de progression livraison gratuite */}
        {showFreeShippingProgress && !isFreeShipping && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Plus que {missingForFreeShipping.toLocaleString()} FC pour la livraison gratuite
              </span>
              <Truck size={14} className="text-amber-500" />
            </div>
            <div className="h-2 bg-amber-200 dark:bg-amber-800/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 to-gold-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {isFreeShipping && showFreeShippingProgress && (
          <div className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/50 dark:border-green-800/30 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <span className="text-xs font-medium text-green-700 dark:text-green-300">
              Livraison gratuite ! 🎉
            </span>
          </div>
        )}

        {/* Total */}
        <div className="mt-4 pt-4 border-t border-gold-400/20">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium text-foreground">Total</span>
            <span className="text-2xl font-bold text-gold-600">
              {summary.total.toLocaleString()} FC
            </span>
          </div>
          {rate && (
            <p className="text-xs text-muted-foreground text-right mt-1">
              ≈ {(summary.total / rate).toFixed(2)} USD
            </p>
          )}
        </div>

        {/* Code promo */}
        {showPromoCode && (
          <div className="mt-4 space-y-2">
            {!activePromo ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Code promo"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase())
                    setPromoError('')
                  }}
                  size="sm"
                  variant="glass"
                  className="flex-1 uppercase"
                  error={promoError}
                  allowClear
                  onClear={() => { setPromoInput(''); setPromoError('') }}
                />
                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={handleApplyPromo}
                  loading={promoLoading}
                  disabled={!promoInput.trim()}
                >
                  Appliquer
                </Button>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 border border-green-200 dark:border-green-800"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    {activePromo.code}
                  </span>
                  {activePromo.description && (
                    <Tooltip content={activePromo.description}>
                      <Info size={14} className="text-muted-foreground" />
                    </Tooltip>
                  )}
                </div>
                <button
                  onClick={handleRemovePromo}
                  className="p-1 rounded-md text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  aria-label="Retirer le code promo"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
            {promoError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {promoError}
              </p>
            )}
          </div>
        )}

        {/* Bouton commander */}
        <Button
          variant="luxe"
          fullWidth
          size="lg"
          className="mt-5 shadow-gold hover:shadow-glow-gold animate-glow-pulse transform hover:scale-[1.02] transition-all"
          disabled={items.length === 0 || isSyncing}
          onClick={handleCheckout}
          rightIcon={<ArrowRight size={18} />}
        >
          Passer la commande
        </Button>

        {/* Badges de confiance */}
        {showTrustBadges && (
          <div className="mt-4 space-y-2 pt-3 border-t border-gold-400/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} className="text-gold-500 flex-shrink-0" />
              <span>Paiement 100% sécurisé (SSL)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock size={14} className="text-gold-500 flex-shrink-0" />
              <span>Protection acheteur incluse</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw size={14} className="text-gold-500 flex-shrink-0" />
              <span>Retours gratuits sous 7 jours</span>
            </div>
            {delaiEstime && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock size={14} className="text-gold-500 flex-shrink-0" />
                <span>Livraison estimée : {delaiEstime}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carte secondaire : moyens de paiement */}
      {variant !== 'compact' && (
        <div className="rounded-2xl border border-gold-400/10 bg-white/50 dark:bg-midnight-800/40 backdrop-blur-sm p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Paiements acceptés
          </h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <Wallet size={12} /> Gercie Wallet
            </Badge>
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} /> Orange Money
            </Badge>
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} /> Airtel Money
            </Badge>
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} /> M-Pesa
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}