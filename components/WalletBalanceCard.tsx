// components/WalletBalanceCard.tsx
'use client'

import React, { useMemo, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useWallet } from '@/hooks/useWallet'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Zap,
  Gift,
  ArrowRightLeft,
  History,
  Info,
  DollarSign,
  Shield,
} from 'lucide-react'

/* ========================================================================== */
/*  Types & Props                                                              */
/* ========================================================================== */

export interface WalletBalanceCardProps {
  /** Variante de style */
  variant?: 'gradient' | 'glass' | 'minimal'
  /** Taille de la carte */
  size?: 'sm' | 'md' | 'lg'
  /** Afficher le solde vente (si l'utilisateur est vendeur) */
  showVente?: boolean
  /** Afficher les boutons d'action */
  showActions?: boolean
  /** Afficher le graphique de progression */
  showChart?: boolean
  /** Afficher la conversion USD */
  showUSD?: boolean
  /** Classe additionnelle */
  className?: string
  /** Callback pour recharger */
  onRecharge?: () => void
  /** Callback pour transférer */
  onTransfer?: () => void
  /** Callback pour voir l'historique */
  onHistory?: () => void
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */

export function WalletBalanceCard({
  variant = 'gradient',
  size = 'md',
  showVente = true,
  showActions = true,
  showChart = true,
  showUSD = true,
  className,
  onRecharge,
  onTransfer,
  onHistory,
}: WalletBalanceCardProps) {
  const router = useRouter()
  const { soldeAchat, soldeVente, isLoading, isFetching, error, refetch } = useWallet()
  const { rate, isLoading: rateLoading } = useExchangeRate()

  // Conversion USD
  const soldeAchatUSD = rate ? soldeAchat / rate : null
  const soldeVenteUSD = rate ? soldeVente / rate : null

  // Déterminer si on affiche le solde vente
  const hasVente = showVente && soldeVente !== undefined && soldeVente > 0

  // Taille des éléments
  const sizeClasses = {
    sm: 'p-4 text-sm',
    md: 'p-5 text-base',
    lg: 'p-6 text-lg',
  }

  // Classes de fond selon la variante
  const variantClasses = {
    gradient:
      'bg-gradient-to-br from-gold-500 via-gold-600 to-amber-700 text-white border-0 shadow-gold',
    glass:
      'bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl border border-gold-400/20 shadow-card',
    minimal:
      'bg-transparent border-0 shadow-none',
  }

  // Indicateur de chargement
  if (isLoading || rateLoading) {
    return (
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          variant === 'gradient' ? 'bg-neutral-200 dark:bg-neutral-700' : 'bg-card',
          sizeClasses[size],
          className
        )}
      >
        <div className="space-y-4">
          <Skeleton variant="text" className="w-32 h-6" shimmer shimmerVariant="gold" />
          <Skeleton variant="text" className="w-48 h-8" shimmer shimmerVariant="gold" />
          {showActions && (
            <div className="flex gap-2">
              <Skeleton variant="rectangular" className="w-20 h-8 rounded-full" shimmer shimmerVariant="gold" />
              <Skeleton variant="rectangular" className="w-20 h-8 rounded-full" shimmer shimmerVariant="gold" />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Erreur
  if (error) {
    return (
      <div className={cn('rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-center', className)}>
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        <Button variant="danger" size="sm" onClick={() => refetch()} className="mt-2">
          <RefreshCw size={14} className="mr-1" /> Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden relative transition-all',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {/* Indicateur de rafraîchissement */}
      {isFetching && (
        <div className="absolute top-2 right-2">
          <Spinner size="sm" />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Solde Achat */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={variant === 'sm' ? 16 : 20} className="opacity-70" />
            <span className={cn('font-medium', variant === 'gradient' ? 'text-white/80' : 'text-muted-foreground')}>
              Solde achat
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn('font-bold', size === 'lg' ? 'text-4xl' : 'text-3xl')}>
              {soldeAchat.toLocaleString()} FC
            </span>
            {showUSD && soldeAchatUSD && (
              <span className={cn('opacity-70', size === 'sm' ? 'text-xs' : 'text-sm')}>
                ≈ {soldeAchatUSD.toFixed(2)} USD
              </span>
            )}
          </div>
        </div>

        {/* Solde Vente (si présent) */}
        {hasVente && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={variant === 'sm' ? 16 : 20} className="opacity-70" />
              <span className={cn('font-medium', variant === 'gradient' ? 'text-white/80' : 'text-muted-foreground')}>
                Solde vente
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={cn('font-bold', size === 'lg' ? 'text-3xl' : 'text-2xl')}>
                {soldeVente.toLocaleString()} FC
              </span>
              {showUSD && soldeVenteUSD && (
                <span className={cn('opacity-70', size === 'sm' ? 'text-xs' : 'text-sm')}>
                  ≈ {soldeVenteUSD.toFixed(2)} USD
                </span>
              )}
            </div>
          </div>
        )}

        {/* Graphique de progression (simulé) */}
        {showChart && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Entrées ce mois</span>
              <span className="font-medium">+{Math.round(soldeAchat * 0.3).toLocaleString()} FC</span>
            </div>
            <div className="h-1.5 bg-white/20 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, (soldeAchat > 0 ? 30 : 0))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Sorties ce mois</span>
              <span className="font-medium">-{Math.round(soldeAchat * 0.15).toLocaleString()} FC</span>
            </div>
            <div className="h-1.5 bg-white/20 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-400 to-pink-500 rounded-full"
                style={{ width: `${Math.min(100, (soldeAchat > 0 ? 15 : 0))}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 flex-wrap">
            <Tooltip content="Recharger votre portefeuille">
              <Button
                variant={variant === 'gradient' ? 'glass' : 'luxe'}
                size="sm"
                onClick={onRecharge || (() => router.push('/profile/recharge'))}
                leftIcon={<Zap size={14} />}
                className={variant === 'gradient' ? 'bg-white/20 border-white/30 text-white hover:bg-white/30' : ''}
              >
                Recharger
              </Button>
            </Tooltip>
            {hasVente && (
              <Tooltip content="Transférer du solde vente vers achat">
                <Button
                  variant={variant === 'gradient' ? 'glass' : 'outline-gold'}
                  size="sm"
                  onClick={onTransfer || (() => router.push('/profile/wallet?transfer=1'))}
                  leftIcon={<ArrowRightLeft size={14} />}
                  className={variant === 'gradient' ? 'bg-white/20 border-white/30 text-white hover:bg-white/30' : ''}
                >
                  Transférer
                </Button>
              </Tooltip>
            )}
            <Tooltip content="Voir l'historique des transactions">
              <Button
                variant={variant === 'gradient' ? 'glass' : 'ghost'}
                size="sm"
                onClick={onHistory || (() => router.push('/profile/wallet?tab=transactions'))}
                leftIcon={<History size={14} />}
                className={variant === 'gradient' ? 'bg-white/20 border-white/30 text-white hover:bg-white/30' : ''}
              >
                Historique
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Effet de brillance (gradient seulement) */}
      {variant === 'gradient' && (
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-transparent pointer-events-none" />
      )}
    </div>
  )
}