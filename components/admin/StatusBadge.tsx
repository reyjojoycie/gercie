// components/admin/StatusBadge.tsx
'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Circle,
  HelpCircle,
  Pause,
  Play,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Package,
  Truck,
  CreditCard,
  ShoppingCart,
  Wallet,
  Star,
  Ban,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export type StatusBadgeVariant =
  | 'gold'
  | 'accent'
  | 'warm'
  | 'danger'
  | 'neutral'
  | 'brand'

export type StatusBadgeSize = 'sm' | 'md' | 'lg'

export interface StatusBadgeConfig {
  /** Libellé affiché */
  label: string
  /** Variante de couleur */
  variant: StatusBadgeVariant
  /** Icône optionnelle */
  icon?: LucideIcon
  /** Animation (pulse, none) */
  animation?: 'pulse' | 'none'
}

export interface StatusBadgeProps {
  /** Statut sous forme de chaîne (ex: 'payee', 'en_attente', 'livree') */
  status: string
  /** Mapping personnalisé des statuts → configuration */
  statusMap?: Record<string, StatusBadgeConfig>
  /** Taille du badge */
  size?: StatusBadgeSize
  /** Tooltip au survol */
  tooltip?: string
  /** Style du badge (solid, outline, soft) */
  style?: 'solid' | 'outline' | 'soft'
  /** Classes additionnelles */
  className?: string
  /** Utiliser le mapping par défaut ou non */
  useDefaultMapping?: boolean
}

/* ========================================================================== */
/*  Mappings par défaut (extensibles)                                          */
/* ========================================================================== */

export const defaultStatusMap: Record<string, StatusBadgeConfig> = {
  // Commandes
  en_attente: { label: 'En attente', variant: 'warm', icon: Clock, animation: 'pulse' },
  payee: { label: 'Payée', variant: 'gold', icon: CreditCard },
  collecte: { label: 'Préparation', variant: 'neutral', icon: Package },
  en_livraison: { label: 'En livraison', variant: 'warm', icon: Truck, animation: 'pulse' },
  livree: { label: 'Livrée', variant: 'accent', icon: CheckCircle2 },
  annulee: { label: 'Annulée', variant: 'danger', icon: XCircle },
  // Produits
  actif: { label: 'Actif', variant: 'accent', icon: CheckCircle2 },
  inactif: { label: 'Inactif', variant: 'danger', icon: Ban },
  rupture: { label: 'Rupture', variant: 'danger', icon: AlertCircle },
  // Paiements
  pending: { label: 'En attente', variant: 'warm', icon: Clock, animation: 'pulse' },
  approved: { label: 'Approuvé', variant: 'accent', icon: CheckCircle2 },
  rejected: { label: 'Refusé', variant: 'danger', icon: XCircle },
  // Retraits
  retrait_pending: { label: 'En attente', variant: 'warm', icon: Clock, animation: 'pulse' },
  retrait_approved: { label: 'Approuvé', variant: 'accent', icon: CheckCircle2 },
  retrait_rejected: { label: 'Refusé', variant: 'danger', icon: XCircle },
  // Litiges
  ouvert: { label: 'Ouvert', variant: 'danger', icon: AlertCircle, animation: 'pulse' },
  en_cours: { label: 'En cours', variant: 'warm', icon: Clock },
  resolu: { label: 'Résolu', variant: 'accent', icon: CheckCircle2 },
  rejete: { label: 'Rejeté', variant: 'neutral', icon: XCircle },
  // Livreurs
  disponible: { label: 'Disponible', variant: 'accent', icon: CheckCircle2 },
  indisponible: { label: 'Indisponible', variant: 'neutral', icon: Pause },
  // Utilisateurs
  acheteur: { label: 'Acheteur', variant: 'brand', icon: ShoppingCart },
  vendeur: { label: 'Vendeur', variant: 'accent', icon: TrendingUp },
  admin: { label: 'Admin', variant: 'gold', icon: Star },
  // Transactions
  achat: { label: 'Achat', variant: 'brand', icon: ShoppingCart },
  vente: { label: 'Vente', variant: 'accent', icon: TrendingUp },
  recharge: { label: 'Recharge', variant: 'gold', icon: Wallet },
  retrait: { label: 'Retrait', variant: 'warm', icon: CreditCard },
  transfert: { label: 'Transfert', variant: 'neutral', icon: RefreshCw },
  remboursement: { label: 'Remboursement', variant: 'danger', icon: RefreshCw },
  commission: { label: 'Commission', variant: 'gold', icon: Zap },
  // Points de retrait
  verifie: { label: 'Vérifié', variant: 'accent', icon: CheckCircle2 },
  non_verifie: { label: 'Non vérifié', variant: 'neutral', icon: HelpCircle },
}

/* ========================================================================== */
/*  Composant StatusBadge                                                      */
/* ========================================================================== */

export function StatusBadge({
  status,
  statusMap = {},
  size = 'sm',
  tooltip,
  style = 'solid',
  className,
  useDefaultMapping = true,
}: StatusBadgeProps) {
  // Fusionner le mapping par défaut et le mapping personnalisé
  const mergedMap = useMemo(() => {
    if (!useDefaultMapping) return statusMap
    return { ...defaultStatusMap, ...statusMap }
  }, [statusMap, useDefaultMapping])

  // Rechercher la configuration correspondante
  const config = useMemo(() => {
    return mergedMap[status] || null
  }, [mergedMap, status])

  // Si pas de config trouvée, afficher le statut brut
  if (!config) {
    return (
      <Badge variant="neutral" size={size} className={className}>
        {status}
      </Badge>
    )
  }

  const { label, variant, icon: Icon, animation } = config
  const isPulse = animation === 'pulse'

  const badgeContent = (
    <Badge
      variant={variant}
      size={size}
      style={style}
      className={cn(
        'inline-flex items-center gap-1 transition-all',
        isPulse && 'animate-pulse',
        className
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : size === 'lg' ? 16 : 14} />}
      <span>{label}</span>
    </Badge>
  )

  // Affichage avec tooltip si demandé
  if (tooltip) {
    return <Tooltip content={tooltip}>{badgeContent}</Tooltip>
  }

  return badgeContent
}

/* ========================================================================== */
/*  Helper : obtenir la configuration d'un statut sans rendu                   */
/* ========================================================================== */

export function getStatusConfig(
  status: string,
  customMap?: Record<string, StatusBadgeConfig>
): StatusBadgeConfig | null {
  const map = { ...defaultStatusMap, ...customMap }
  return map[status] || null
}