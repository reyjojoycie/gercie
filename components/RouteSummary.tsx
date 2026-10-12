// components/RouteSummary.tsx
'use client'

import { useState, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTheme } from '@/contexts/ThemeContext'
import {
  MapPin, Navigation, Clock, Route, Car, Bike, Footprints, Truck,
  ChevronRight, ChevronDown, ChevronUp, Copy, Check, Share2,
  ExternalLink, GripHorizontal, CalendarClock, ArrowRight,
  Circle, Flag, Home, Store, AlertTriangle, RefreshCw, Zap,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface RoutePoint {
  address: string
  lat?: number
  lng?: number
  type?: 'depart' | 'etape' | 'arrivee'
  label?: string
}

export interface RouteStep {
  instruction: string
  distanceKm: number
  durationMin: number
}

export interface RouteSummaryData {
  origin: RoutePoint
  destination: RoutePoint
  waypoints?: RoutePoint[]
  distanceKm: number
  durationMin: number
  steps?: RouteStep[]
  mode?: 'voiture' | 'moto' | 'velo' | 'pied'
  estimatedArrival?: string   // ISO date
  costEstimate?: number       // en devise locale
}

interface RouteSummaryProps {
  data?: RouteSummaryData | null
  /** Chargement (affiche les squelettes) */
  loading?: boolean
  /** Erreur à afficher */
  error?: string | null
  /** Mode d'affichage */
  variant?: 'full' | 'compact' | 'steps'
  /** Classes additionnelles */
  className?: string
  /** Action de partage */
  onShare?: () => void
  /** Action d'actualisation */
  onRefresh?: () => void
  /** Afficher l'option "Ouvrir dans Google Maps" */
  showExternalLinks?: boolean
}

/* ========================================================================== */
/*  Helpers                                                                   */
/* ========================================================================== */

const formatDistance = (km: number) => km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`

const formatDuration = (min: number) => {
  if (min < 1) return 'Moins d’une minute'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const getGoogleMapsUrl = (origin?: RoutePoint, destination?: RoutePoint, waypoints?: RoutePoint[]) => {
  if (!origin || !destination) return '#'
  const base = 'https://www.google.com/maps/dir/?api=1'
  const params = new URLSearchParams()
  params.set('origin', origin.address)
  params.set('destination', destination.address)
  if (waypoints && waypoints.length > 0) {
    params.set('waypoints', waypoints.map(w => w.address).join('|'))
  }
  return `${base}&${params.toString()}`
}

const getWazeUrl = (destination?: RoutePoint) => {
  if (!destination) return '#'
  return `https://www.waze.com/ul?navigate=yes&q=${encodeURIComponent(destination.address)}`
}

const modeIcons: Record<string, React.ComponentType<any>> = {
  voiture: Car,
  moto: Bike,
  velo: Bike,
  pied: Footprints,
}

/* ========================================================================== */
/*  Sous-composant : Ligne d’étape                                            */
/* ========================================================================== */

const StepLine = ({ step, index, isLast }: { step: RouteStep; index: number; isLast: boolean }) => (
  <div className="flex items-start gap-3">
    <div className="flex flex-col items-center">
      <div className="w-6 h-6 rounded-full bg-gold-100 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300 flex items-center justify-center text-xs font-bold">
        {index + 1}
      </div>
      {!isLast && <div className="w-0.5 h-8 bg-neutral-200 dark:bg-neutral-700 mt-1" />}
    </div>
    <div className="flex-1 pb-3">
      <p className="text-sm text-neutral-800 dark:text-neutral-200">{step.instruction}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-3 mt-0.5">
        <span className="flex items-center gap-1"><Route size={12} /> {formatDistance(step.distanceKm)}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> {formatDuration(step.durationMin)}</span>
      </p>
    </div>
  </div>
)

/* ========================================================================== */
/*  Composant principal                                                       */
/* ========================================================================== */

function RouteSummaryComponent({
  data,
  loading = false,
  error = null,
  variant = 'full',
  className,
  onShare,
  onRefresh,
  showExternalLinks = true,
}: RouteSummaryProps) {
  const { theme } = useTheme()
  const [showAllSteps, setShowAllSteps] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const googleMapsUrl = data ? getGoogleMapsUrl(data.origin, data.destination, data.waypoints) : '#'
  const wazeUrl = data ? getWazeUrl(data.destination) : '#'

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-center', className)}>
        <AlertTriangle className="text-red-500 mx-auto mb-2" size={24} />
        <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} className="mt-3" leftIcon={<RefreshCw size={14} />}>
            Réessayer
          </Button>
        )}
      </div>
    )
  }

  if (!data) {
    return (
      <div className={cn('text-neutral-500 dark:text-neutral-400 text-sm italic', className)}>
        Aucun itinéraire calculé.
      </div>
    )
  }

  const { origin, destination, waypoints = [], distanceKm, durationMin, steps, mode = 'voiture', estimatedArrival, costEstimate } = data
  const ModeIcon = modeIcons[mode] || Car
  const etaText = estimatedArrival ? new Date(estimatedArrival).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null

  // Version compacte : ligne simple avec distance + durée + actions
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center justify-between gap-3 py-2 px-1 text-sm', className)}>
        <div className="flex items-center gap-2 min-w-0">
          <ModeIcon size={16} className="text-gold-500 shrink-0" />
          <span className="truncate text-neutral-700 dark:text-neutral-300">{origin.address}</span>
          <ArrowRight size={14} className="text-neutral-400 shrink-0" />
          <span className="truncate text-neutral-700 dark:text-neutral-300">{destination.address}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
          <span>{formatDistance(distanceKm)}</span>
          <span>·</span>
          <span>{formatDuration(durationMin)}</span>
          {etaText && <span className="font-medium text-gold-500">{etaText}</span>}
        </div>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} className="shrink-0"><RefreshCw size={14} /></Button>
        )}
      </div>
    )
  }

  // Version "steps" : liste détaillée des instructions
  if (variant === 'steps' && steps && steps.length > 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Étapes de l’itinéraire</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAllSteps(!showAllSteps)}>
            {showAllSteps ? 'Réduire' : 'Tout afficher'}
          </Button>
        </div>
        <div className="space-y-2">
          {(showAllSteps ? steps : steps.slice(0, 3)).map((step, idx) => (
            <StepLine key={idx} step={step} index={idx} isLast={idx === steps.length - 1} />
          ))}
        </div>
        {steps.length > 3 && !showAllSteps && (
          <p className="text-xs text-neutral-500">+ {steps.length - 3} étapes supplémentaires</p>
        )}
      </div>
    )
  }

  // Version full (par défaut)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white dark:bg-midnight-900 rounded-2xl border border-neutral-200 dark:border-midnight-500/30 shadow-card overflow-hidden',
        className
      )}
    >
      {/* En-tête */}
      <div className="p-5 flex items-center justify-between border-b border-neutral-100 dark:border-midnight-800">
        <div className="flex items-center gap-2">
          <ModeIcon size={20} className="text-gold-500" />
          <h3 className="text-base font-bold text-neutral-900 dark:text-white">Itinéraire</h3>
          <Badge variant="gold" size="sm">{mode}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <Tooltip content="Rafraîchir">
              <Button variant="ghost" size="icon" onClick={onRefresh}><RefreshCw size={16} /></Button>
            </Tooltip>
          )}
          {onShare && (
            <Tooltip content="Partager">
              <Button variant="ghost" size="icon" onClick={onShare}><Share2 size={16} /></Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Corps */}
      <div className="p-5 space-y-5">
        {/* Points de départ / arrivée */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
              <Home size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                {origin.label || 'Départ'}
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                {origin.address}
              </p>
            </div>
            <Tooltip content="Copier l’adresse">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopyAddress(origin.address)}
              >
                {copiedAddress === origin.address ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </Button>
            </Tooltip>
          </div>

          {waypoints.length > 0 && (
            <>
              {waypoints.map((wp, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                    <Circle size={12} fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {wp.label || `Étape ${idx + 1}`}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                      {wp.address}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleCopyAddress(wp.address)}>
                    {copiedAddress === wp.address ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </Button>
                </div>
              ))}
              <div className="flex justify-center">
                <ChevronDown size={16} className="text-neutral-400" />
              </div>
            </>
          )}

          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center">
              <Flag size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                {destination.label || 'Arrivée'}
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                {destination.address}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleCopyAddress(destination.address)}>
              {copiedAddress === destination.address ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </Button>
          </div>
        </div>

        {/* Résumé des distances */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 dark:bg-midnight-800 rounded-xl">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <Route size={16} />
              Distance
            </div>
            <p className="text-lg font-bold text-neutral-900 dark:text-white">{formatDistance(distanceKm)}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <Clock size={16} />
              Durée
            </div>
            <p className="text-lg font-bold text-neutral-900 dark:text-white">{formatDuration(durationMin)}</p>
            {etaText && (
              <p className="text-xs text-gold-600 dark:text-gold-400 flex items-center gap-1 mt-0.5">
                <CalendarClock size={12} />
                Arrivée prévue à {etaText}
              </p>
            )}
          </div>
        </div>

        {/* Estimation tarif (optionnel) */}
        {costEstimate !== undefined && (
          <div className="flex items-center justify-between px-4 py-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl">
            <span className="text-sm text-neutral-700 dark:text-neutral-300">Estimation du tarif</span>
            <span className="font-bold text-gold-700 dark:text-gold-300">{costEstimate.toLocaleString()} CDF</span>
          </div>
        )}

        {/* Étapes si disponibles */}
        {steps && steps.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Instructions</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowAllSteps(!showAllSteps)}>
                {showAllSteps ? 'Réduire' : 'Tout afficher'}
              </Button>
            </div>
            <AnimatePresence>
              <motion.div layout className="space-y-2">
                {(showAllSteps ? steps : steps.slice(0, 3)).map((step, idx, arr) => (
                  <StepLine key={idx} step={step} index={idx} isLast={showAllSteps ? idx === arr.length - 1 : idx === 2} />
                ))}
              </motion.div>
            </AnimatePresence>
            {steps.length > 3 && !showAllSteps && (
              <p className="text-xs text-neutral-500">+ {steps.length - 3} étapes supplémentaires</p>
            )}
          </div>
        )}

        {/* Liens externes */}
        {showExternalLinks && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-neutral-100 dark:border-midnight-800">
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline-gold" size="sm" leftIcon={<ExternalLink size={14} />}>
                Google Maps
              </Button>
            </a>
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline-gold" size="sm" leftIcon={<Navigation size={14} />}>
                Waze
              </Button>
            </a>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default memo(RouteSummaryComponent)