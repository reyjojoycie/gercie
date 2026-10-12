// components/LivreurCard.tsx
'use client'

import { useState, useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTheme } from '@/contexts/ThemeContext'
import {
  Phone, MessageSquare, MapPin, Star, Shield, Award, Truck,
  ChevronDown, ChevronUp, ExternalLink, AlertTriangle,
  Navigation, Clock, ThumbsUp, Bike, Car, User, Mail, Heart,
  Share2, Flag, MoreHorizontal, CheckCircle2, Wifi, WifiOff,
} from 'lucide-react'

/* ========================================================================== */
/*  Types enrichis pour le livreur                                            */
/* ========================================================================== */
export interface LivreurInfo {
  id: string
  nom: string
  prenom: string
  telephone?: string
  email?: string
  photo_url?: string
  note?: number            // note moyenne sur 5
  total_livraisons?: number
  taux_satisfaction?: number // pourcentage
  vehicule?: 'moto' | 'voiture' | 'velo' | 'pied'
  en_ligne?: boolean
  distance_km?: number     // distance par rapport au client (option)
  temps_estime?: number    // minutes
  specialites?: string[]   // ex: ["fragile", "express"]
  livraison_en_cours?: boolean
  derniere_connexion?: string
}

interface LivreurCardProps {
  livreur: LivreurInfo | null | undefined
  /** Actions disponibles (par défaut toutes) */
  actions?: ('call' | 'message' | 'navigate' | 'signal')[]
  /** Variante compacte (moins de détails) */
  compact?: boolean
  /** Classes additionnelles */
  className?: string
  /** Callback quand on clique sur une action */
  onAction?: (action: 'call' | 'message' | 'navigate' | 'signal') => void
  /** Afficher un skeleton pendant le chargement */
  loading?: boolean
}

/* ========================================================================== */
/*  Sous-composant : étoiles de notation                                     */
/* ========================================================================== */
const StarRating = memo(function StarRating({ note, size = 14 }: { note: number; size?: number }) {
  const fullStars = Math.floor(note)
  const hasHalf = note - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)

  return (
    <div className="flex items-center gap-0.5" aria-label={`Note: ${note.toFixed(1)} sur 5`}>
      {Array.from({ length: fullStars }, (_, i) => (
        <Star key={`full-${i}`} size={size} className="text-amber-400 fill-amber-400" />
      ))}
      {hasHalf && (
        <div className="relative">
          <Star size={size} className="text-neutral-300 dark:text-neutral-600" />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star size={size} className="text-amber-400 fill-amber-400" />
          </div>
        </div>
      )}
      {Array.from({ length: emptyStars }, (_, i) => (
        <Star key={`empty-${i}`} size={size} className="text-neutral-300 dark:text-neutral-600" />
      ))}
      <span className="ml-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">{note.toFixed(1)}</span>
    </div>
  )
})

/* ========================================================================== */
/*  Icône du véhicule                                                        */
/* ========================================================================== */
const VehiculeIcon = memo(function VehiculeIcon({ type, size = 18 }: { type: string; size?: number }) {
  switch (type) {
    case 'moto': return <Bike size={size} className="text-blue-500" />
    case 'voiture': return <Car size={size} className="text-emerald-500" />
    case 'velo': return <Bike size={size} className="text-amber-500" />
    case 'pied': return <User size={size} className="text-purple-500" />
    default: return <Truck size={size} className="text-neutral-500" />
  }
})

/* ========================================================================== */
/*  Composant principal                                                       */
/* ========================================================================== */
function LivreurCardContent({
  livreur,
  actions = ['call', 'message', 'navigate'],
  compact = false,
  className,
  onAction,
  loading = false,
}: LivreurCardProps) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)

  // États dérivés
  const isOnline = livreur?.en_ligne ?? false
  const hasActiveDelivery = livreur?.livraison_en_cours ?? false

  // Rendu du squelette de chargement
  if (loading || !livreur) {
    return (
      <div className={cn('bg-white dark:bg-midnight-900 rounded-2xl p-5 border border-neutral-200 dark:border-midnight-500/30 shadow-card', className)}>
        <div className="flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        {!compact && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'bg-white dark:bg-midnight-900 rounded-2xl border border-neutral-200 dark:border-midnight-500/30 shadow-card overflow-hidden transition-shadow hover:shadow-soft-hover',
        className
      )}
    >
      {/* En-tête avec photo, nom, statut */}
      <div className="p-4 sm:p-5 flex items-start gap-4">
        {/* Avatar avec indicateur de présence */}
        <div className="relative">
          <Avatar
            src={livreur.photo_url}
            fallback={`${livreur.prenom?.[0] ?? ''}${livreur.nom?.[0] ?? ''}`}
            size="lg"
            className="ring-2 ring-white dark:ring-midnight-800 shadow-sm"
          />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-midnight-900 transition-colors',
              isOnline ? 'bg-emerald-400' : 'bg-neutral-400'
            )}
            title={isOnline ? 'En ligne' : 'Hors ligne'}
          />
        </div>

        {/* Informations principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white truncate">
              {livreur.prenom} {livreur.nom}
            </h3>
            {hasActiveDelivery && (
              <Badge variant="info" size="sm" className="animate-pulse">
                En livraison
              </Badge>
            )}
            {!isOnline && (
              <Badge variant="neutral" size="sm">
                Hors ligne
              </Badge>
            )}
          </div>

          {/* Note */}
          {livreur.note !== undefined && livreur.note > 0 && (
            <div className="mt-1">
              <StarRating note={livreur.note} size={14} />
            </div>
          )}

          {/* Stats secondaires (compact ou non) */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {livreur.vehicule && (
              <span className="flex items-center gap-1">
                <VehiculeIcon type={livreur.vehicule} size={14} />
                <span className="capitalize">{livreur.vehicule}</span>
              </span>
            )}
            {livreur.total_livraisons !== undefined && (
              <span className="flex items-center gap-1">
                <Truck size={13} />
                {livreur.total_livraisons} livraisons
              </span>
            )}
            {livreur.taux_satisfaction !== undefined && (
              <span className="flex items-center gap-1">
                <ThumbsUp size={13} />
                {livreur.taux_satisfaction}% satisfaction
              </span>
            )}
          </div>
        </div>

        {/* Actions rapides (version bureau) */}
        {!compact && actions.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5">
            {actions.includes('call') && livreur.telephone && (
              <Tooltip content="Appeler">
                <Button
                  variant="gold"
                  size="icon"
                  className="w-9 h-9 rounded-xl"
                  onClick={() => onAction?.('call')}
                >
                  <Phone size={16} />
                </Button>
              </Tooltip>
            )}
            {actions.includes('message') && (
              <Tooltip content="Message">
                <Button
                  variant="outline-gold"
                  size="icon"
                  className="w-9 h-9 rounded-xl"
                  onClick={() => onAction?.('message')}
                >
                  <MessageSquare size={16} />
                </Button>
              </Tooltip>
            )}
            {actions.includes('navigate') && (
              <Tooltip content="Itinéraire">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 rounded-xl"
                  onClick={() => onAction?.('navigate')}
                >
                  <Navigation size={16} />
                </Button>
              </Tooltip>
            )}
            {actions.includes('signal') && (
              <Tooltip content="Signaler">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => onAction?.('signal')}
                >
                  <Flag size={16} />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Section détaillée expansible (non compact) */}
      {!compact && (
        <>
          <div className="px-4 sm:px-5 pb-4 space-y-3">
            {/* Distance et ETA si disponible */}
            {livreur.distance_km !== undefined && (
              <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
                <Navigation size={16} className="text-blue-500" />
                <span className="text-blue-700 dark:text-blue-300">
                  À environ <span className="font-semibold">{livreur.distance_km.toFixed(1)} km</span>
                  {livreur.temps_estime !== undefined && ` (environ ${livreur.temps_estime} min)`}
                </span>
              </div>
            )}

            {/* Spécialités */}
            {livreur.specialites && livreur.specialites.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {livreur.specialites.map((spec) => (
                  <Badge key={spec} variant="gold" size="sm">
                    {spec}
                  </Badge>
                ))}
              </div>
            )}

            {/* Contact détaillé si expanded */}
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2"
              >
                {livreur.email && (
                  <a
                    href={`mailto:${livreur.email}`}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-gold-500 transition-colors"
                  >
                    <Mail size={14} />
                    {livreur.email}
                  </a>
                )}
                {livreur.telephone && (
                  <a
                    href={`tel:${livreur.telephone}`}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-gold-500 transition-colors"
                  >
                    <Phone size={14} />
                    {livreur.telephone}
                  </a>
                )}
                {livreur.derniere_connexion && (
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Clock size={12} />
                    Dernière connexion : {livreur.derniere_connexion}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Barre d'actions mobile + bouton expand */}
          <div className="border-t border-neutral-100 dark:border-midnight-800 px-4 py-2 flex items-center justify-between">
            {/* Actions mobiles (visibles seulement sur petits écrans) */}
            <div className="flex sm:hidden items-center gap-1 flex-1">
              {actions.includes('call') && livreur.telephone && (
                <Button variant="gold" size="sm" leftIcon={<Phone size={14} />} onClick={() => onAction?.('call')}>
                  Appeler
                </Button>
              )}
              {actions.includes('message') && (
                <Button variant="outline-gold" size="sm" leftIcon={<MessageSquare size={14} />} onClick={() => onAction?.('message')}>
                  Message
                </Button>
              )}
              {actions.includes('navigate') && (
                <Button variant="ghost" size="sm" leftIcon={<Navigation size={14} />} onClick={() => onAction?.('navigate')}>
                  Itinéraire
                </Button>
              )}
              {actions.includes('signal') && (
                <Button variant="ghost" size="sm" leftIcon={<Flag size={14} />} className="text-red-500" onClick={() => onAction?.('signal')}>
                  Signaler
                </Button>
              )}
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gold-500 hover:text-gold-600 transition-colors ml-auto"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{expanded ? 'Moins' : 'Plus'}</span>
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}

// Mémoïsation pour éviter les re-rendus inutiles
export default memo(LivreurCardContent)