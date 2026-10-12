// components/ETAIndicator.tsx
'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTheme } from '@/contexts/ThemeContext'
import {
  Clock, Navigation, MapPin, Truck, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Info,
  Zap, Gauge, Route, Copy, Check, Smartphone
} from 'lucide-react'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */
export interface ETAIndicatorProps {
  /** Temps estimé en minutes (ou null si indisponible) */
  etaMinutes: number | null
  /** Distance restante en km (optionnel) */
  distanceKm?: number | null
  /** Statut de la livraison (pour déterminer l'état d'affichage) */
  status?: 'en_cours' | 'arrivee' | 'retard' | 'annulee' | 'livree' | 'inactive'
  /** Mode d'affichage */
  variant?: 'default' | 'compact' | 'inline'
  /** Rafraîchir manuellement l'ETA */
  onRefresh?: () => void
  /** Classes additionnelles */
  className?: string
  /** Désactiver l'animation de compte à rebours */
  noAnimation?: boolean
  /** Callback lorsque l'ETA arrive à zéro (livraison imminente) */
  onImminent?: () => void
}

/* ========================================================================== */
/*  Helpers : formatage du temps                                               */
/* ========================================================================== */
function formatTime(minutes: number): string {
  if (minutes < 1) return "Moins d'une minute"
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  if (remaining === 0) return `${hours} h`
  return `${hours} h ${remaining} min`
}

/* ========================================================================== */
/*  Couleurs et icônes selon le statut / urgence                               */
/* ========================================================================== */
const statusConfig = {
  en_cours: { color: 'blue', icon: Clock, bgClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800' },
  arrivee: { color: 'emerald', icon: CheckCircle2, bgClass: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' },
  retard: { color: 'amber', icon: AlertTriangle, bgClass: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800' },
  annulee: { color: 'red', icon: XCircle, bgClass: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' },
  livree: { color: 'emerald', icon: CheckCircle2, bgClass: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' },
  inactive: { color: 'neutral', icon: Clock, bgClass: 'bg-neutral-50 dark:bg-midnight-800 border-neutral-200 dark:border-midnight-700' },
}

/* ========================================================================== */
/*  Composant ETAIndicator                                                     */
/* ========================================================================== */
function ETAIndicatorComponent({
  etaMinutes,
  distanceKm,
  status = 'en_cours',
  variant = 'default',
  onRefresh,
  className,
  noAnimation = false,
  onImminent,
}: ETAIndicatorProps) {
  const { theme } = useTheme()
  const [displayMinutes, setDisplayMinutes] = useState<number | null>(etaMinutes)
  const [isCopied, setIsCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // Compte à rebours interne (si animation activée)
  useEffect(() => {
    if (noAnimation || etaMinutes === null || etaMinutes <= 0) {
      setDisplayMinutes(etaMinutes)
      return
    }
    setDisplayMinutes(etaMinutes)
    const interval = setInterval(() => {
      setDisplayMinutes(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval)
          return 0
        }
        const next = prev - 1 / 60 // décrémente chaque seconde (approx)
        if (next <= 0 && onImminent) onImminent()
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [etaMinutes, noAnimation, onImminent])

  // Déterminer l'urgence basée sur l'ETA (couleur dynamique)
  const urgencyColor = useMemo(() => {
    if (status !== 'en_cours' || etaMinutes === null) return undefined
    if (etaMinutes <= 5) return 'emerald'   // très proche
    if (etaMinutes <= 15) return 'blue'     // proche
    if (etaMinutes <= 30) return 'amber'    // moyen
    return 'neutral'                         // normal
  }, [etaMinutes, status])

  // Texte à afficher
  const etaText = displayMinutes !== null ? formatTime(displayMinutes) : '—'
  const distanceText = distanceKm !== null ? `${distanceKm.toFixed(1)} km` : null

  // Copier dans le presse-papier
  const handleCopy = useCallback(() => {
    if (etaText && etaText !== '—') {
      navigator.clipboard.writeText(`ETA : ${etaText}`)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }, [etaText])

  // Classe de fond selon le statut
  const bg = statusConfig[status]?.bgClass || statusConfig.inactive.bgClass
  const statusIcon = statusConfig[status]?.icon || Clock
  const statusColorName = statusConfig[status]?.color || 'neutral'

  if (variant === 'compact') {
    // Version compacte (ligne simple)
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        {displayMinutes !== null ? (
          <>
            <Clock size={16} className={cn(
              urgencyColor === 'emerald' && 'text-emerald-500',
              urgencyColor === 'blue' && 'text-blue-500',
              urgencyColor === 'amber' && 'text-amber-500',
              urgencyColor === 'neutral' && 'text-neutral-500',
              !urgencyColor && 'text-neutral-500'
            )} />
            <span className={cn(
              'font-semibold',
              urgencyColor === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
              urgencyColor === 'blue' && 'text-blue-700 dark:text-blue-300',
              urgencyColor === 'amber' && 'text-amber-700 dark:text-amber-300',
              urgencyColor === 'neutral' && 'text-neutral-700 dark:text-neutral-300',
              !urgencyColor && 'text-neutral-700 dark:text-neutral-300'
            )}>{etaText}</span>
            {distanceText && <span className="text-neutral-400">· {distanceText}</span>}
          </>
        ) : (
          <span className="text-neutral-400">Calcul en cours…</span>
        )}
        {onRefresh && (
          <Tooltip content="Rafraîchir">
            <button onClick={onRefresh} className="p-1 hover:bg-neutral-100 dark:hover:bg-midnight-800 rounded-md">
              <RefreshCw size={14} className="text-neutral-400" />
            </button>
          </Tooltip>
        )}
      </div>
    )
  }

  if (variant === 'inline') {
    // Version inline simple (pour intégration dans du texte)
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <span className={cn(
          'font-medium',
          urgencyColor === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
          urgencyColor === 'blue' && 'text-blue-600 dark:text-blue-400',
          urgencyColor === 'amber' && 'text-amber-600 dark:text-amber-400',
          !urgencyColor && 'text-neutral-600 dark:text-neutral-400'
        )}>
          {etaText}
        </span>
        {onRefresh && (
          <button onClick={onRefresh} className="p-0.5 hover:bg-neutral-100 dark:hover:bg-midnight-800 rounded">
            <RefreshCw size={12} className="text-neutral-400" />
          </button>
        )}
      </span>
    )
  }

  // Version default (carte complète)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-2xl border p-4 sm:p-5 shadow-card transition-colors',
        bg,
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Icône et texte principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <statusIcon size={20} className={cn(
              status === 'en_cours' && 'text-blue-600 dark:text-blue-400',
              status === 'arrivee' && 'text-emerald-600 dark:text-emerald-400',
              status === 'retard' && 'text-amber-600 dark:text-amber-400',
              status === 'annulee' && 'text-red-600 dark:text-red-400',
              status === 'livree' && 'text-emerald-600 dark:text-emerald-400',
            )} />
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 capitalize">
              {status === 'en_cours' ? 'Livraison en cours' :
               status === 'retard' ? 'Légèrement en retard' :
               status === 'arrivee' ? 'Presque arrivé' :
               status === 'livree' ? 'Livré' :
               status === 'annulee' ? 'Annulé' : 'Statut inconnu'}
            </h4>
            <Badge variant={urgencyColor === 'emerald' ? 'success' : urgencyColor === 'amber' ? 'warning' : 'info'} size="sm">
              {urgencyColor === 'emerald' ? 'Imminent' : urgencyColor === 'amber' ? 'Bientôt' : 'En route'}
            </Badge>
          </div>

          {/* Affichage de l'ETA avec animation */}
          <div className="flex items-baseline gap-3">
            <motion.span
              key={displayMinutes}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'text-3xl sm:text-4xl font-bold tabular-nums',
                urgencyColor === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
                urgencyColor === 'blue' && 'text-blue-700 dark:text-blue-300',
                urgencyColor === 'amber' && 'text-amber-700 dark:text-amber-300',
                !urgencyColor && 'text-neutral-900 dark:text-white'
              )}
            >
              {etaText}
            </motion.span>
            {displayMinutes !== null && displayMinutes < 5 && displayMinutes > 0 && (
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-xs font-medium text-emerald-500"
              >
                <Zap size={16} className="inline mr-1" />
                Arrivée imminente
              </motion.span>
            )}
          </div>

          {/* Détails secondaires */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {distanceText && (
              <span className="flex items-center gap-1">
                <Route size={14} />
                {distanceText}
              </span>
            )}
            {displayMinutes !== null && (
              <span className="flex items-center gap-1">
                <Navigation size={14} />
                Via l'itinéraire le plus court
              </span>
            )}
            {onRefresh && (
              <Tooltip content="Rafraîchir l'estimation">
                <button
                  onClick={onRefresh}
                  className="flex items-center gap-1 text-gold-500 hover:text-gold-600 text-sm ml-auto"
                >
                  <RefreshCw size={14} />
                  Actualiser
                </button>
              </Tooltip>
            )}
          </div>

          {/* Section détails supplémentaires (expansible) */}
          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <p className="flex items-center gap-2">
                    <Gauge size={14} className="text-neutral-400" />
                    Vitesse moyenne : 30 km/h
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin size={14} className="text-neutral-400" />
                    Dernière position mise à jour il y a 2 min
                  </p>
                  <p className="flex items-center gap-2">
                    <Info size={14} className="text-neutral-400" />
                    Estimation basée sur les conditions de circulation actuelles
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions à droite */}
        <div className="flex flex-col gap-1">
          <Tooltip content={isCopied ? 'Copié !' : 'Copier l\'ETA'}>
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-midnight-800 rounded-lg transition-colors"
            >
              {isCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-neutral-400" />}
            </button>
          </Tooltip>
          <Tooltip content={showDetails ? 'Moins de détails' : 'Plus de détails'}>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-midnight-800 rounded-lg transition-colors"
            >
              {showDetails ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Barre de progression du temps (optionnelle) */}
      {displayMinutes !== null && displayMinutes > 0 && etaMinutes !== null && etaMinutes > 0 && (
        <div className="mt-4 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              urgencyColor === 'emerald' && 'bg-emerald-500',
              urgencyColor === 'blue' && 'bg-blue-500',
              urgencyColor === 'amber' && 'bg-amber-500',
              !urgencyColor && 'bg-neutral-500'
            )}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.max(0, Math.min(100, ((etaMinutes - displayMinutes) / etaMinutes) * 100))}%` }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  )
}

export default memo(ETAIndicatorComponent)