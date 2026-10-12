// components/DeliveryTracker.tsx
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTheme } from '@/contexts/ThemeContext'
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking'
import { useGeolocation } from '@/hooks/useGeolocation'
import {
  Truck, CheckCircle, Clock, XCircle, Package, MapPin, Phone, MessageSquare,
  AlertTriangle, ChevronRight, Share2, Star, RefreshCw, WifiOff, Navigation,
  User, Calendar, Camera, FileText, RotateCcw, ChevronDown, ChevronUp,
  ExternalLink, Heart, Gift, Shield, Award, Layers, ArrowRight, Bell,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import type { Coordinates } from '@/lib/geocoding'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

// Chargement dynamique des composants lourds pour optimiser les performances
const DynamicMapItineraire = dynamic(() => import('@/components/MapItineraire').then(m => m.MapItineraire), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-xl" />
})
const DynamicLivreurCard = dynamic(() => import('@/components/LivreurCard').then(m => m.default), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full rounded-xl" />
})

/* ========================================================================== */
/*  Types enrichis pour les étapes de livraison                               */
/* ========================================================================== */
interface TimelineStep {
  id: string
  label: string
  description: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  status: 'completed' | 'current' | 'pending' | 'cancelled'
  date?: string
  subLabel?: string
  detail?: string
}

interface DeliveryTrackerProps {
  commandeId: string
  /** Permet de personnaliser l'affichage (compact, complet) */
  variant?: 'full' | 'compact'
  className?: string
  onAction?: (action: 'call' | 'message' | 'report' | 'share') => void
}

/* ========================================================================== */
/*  Helper : formatage de date relative                                        */
/* ========================================================================== */
const formatRelative = (dateStr?: string | null) => {
  if (!dateStr) return null
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: fr })
  } catch {
    return dateStr
  }
}

/* ========================================================================== */
/*  Configuration des étapes de livraison                                     */
/* ========================================================================== */
const STEP_CONFIG: Record<string, { label: string; description: string; icon: React.ComponentType<any> }> = {
  acceptee: { label: 'Acceptée', description: 'Course acceptée par le livreur', icon: CheckCircle },
  collecte: { label: 'Collectée', description: 'Colis récupéré(s)', icon: Package },
  en_cours: { label: 'En cours', description: 'En route vers vous', icon: Truck },
  livree: { label: 'Livrée', description: 'Colis livré avec succès', icon: Star },
  annulee: { label: 'Annulée', description: 'Livraison annulée', icon: XCircle },
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export default function DeliveryTracker({
  commandeId,
  variant = 'full',
  className,
  onAction,
}: DeliveryTrackerProps) {
  const { theme } = useTheme()
  const [showDetails, setShowDetails] = useState(false)
  const [mapVisible, setMapVisible] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hook de suivi en temps réel (livraison + état de la commande)
  const {
    delivery,
    loading,
    error,
    retry,
    isTracking,
    lastPosition,
    distanceRemaining,
    etaMinutes,
    refreshETA,
  } = useDeliveryTracking(commandeId)

  // Géolocalisation du client (optionnelle, pour calculer la distance exacte)
  const { position: userPosition, requestPosition } = useGeolocation({ enabled: false })

  // États dérivés
  const statut = delivery?.statut ?? 'en_attente'
  const isCancelled = statut === 'annulee'
  const isCompleted = statut === 'livree'
  const isActive = statut === 'en_cours' || statut === 'colis_recupere'
  const showETA = isActive && etaMinutes !== undefined

  // Construire la timeline des étapes
  const steps = useMemo<TimelineStep[]>(() => {
    const stepsList: TimelineStep[] = []
    const currentStatus = delivery?.statut

    // Étape 1 : Acceptée
    stepsList.push({
      id: 'acceptee',
      label: STEP_CONFIG.acceptee.label,
      description: STEP_CONFIG.acceptee.description,
      icon: STEP_CONFIG.acceptee.icon,
      status: currentStatus === 'acceptee' ? 'current' : 
              (currentStatus !== 'en_attente' && currentStatus !== 'payee' ? 'completed' : 'pending'),
      date: delivery?.dateAcceptation,
    })

    // Étape 2 : Collecte validée
    stepsList.push({
      id: 'collecte',
      label: STEP_CONFIG.collecte.label,
      description: STEP_CONFIG.collecte.description,
      icon: STEP_CONFIG.collecte.icon,
      status: (currentStatus === 'colis_recupere' || currentStatus === 'en_cours')
        ? 'completed' : (currentStatus === 'acceptee' ? 'current' : 'pending'),
      date: delivery?.dateRecuperation,
      subLabel: delivery?.vendeursNoms?.join(', '),
    })

    // Étape 3 : En cours de livraison
    stepsList.push({
      id: 'en_cours',
      label: STEP_CONFIG.en_cours.label,
      description: STEP_CONFIG.en_cours.description,
      icon: STEP_CONFIG.en_cours.icon,
      status: currentStatus === 'en_cours' ? 'current' :
              (currentStatus === 'livree' ? 'completed' : 'pending'),
      date: delivery?.dateLivraison,
    })

    // Étape 4 : Livrée (ou annulée)
    if (isCancelled) {
      stepsList.push({
        id: 'annulee',
        label: STEP_CONFIG.annulee.label,
        description: STEP_CONFIG.annulee.description,
        icon: STEP_CONFIG.annulee.icon,
        status: 'cancelled',
        date: delivery?.dateAnnulation,
      })
    } else {
      stepsList.push({
        id: 'livree',
        label: STEP_CONFIG.livree.label,
        description: STEP_CONFIG.livree.description,
        icon: STEP_CONFIG.livree.icon,
        status: isCompleted ? 'completed' : 'pending',
        date: delivery?.dateLivraison,
      })
    }

    return stepsList
  }, [delivery, isCancelled, isCompleted])

  // Calcul de la couleur dominante selon le statut (palette luxe)
  const statusColor = useMemo(() => {
    if (isCancelled) return 'red'
    if (isCompleted) return 'emerald'
    if (isActive) return 'blue'
    return 'neutral'
  }, [isCancelled, isCompleted, isActive])

  // Effet pour mettre à jour le timestamp de dernière mise à jour
  useEffect(() => {
    if (lastPosition) setLastUpdate(new Date())
  }, [lastPosition])

  // Render du contenu principal
  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-white dark:bg-midnight-900 rounded-3xl shadow-card border border-neutral-200 dark:border-midnight-500/30 overflow-hidden transition-all duration-500',
        variant === 'compact' ? 'max-w-md' : 'w-full',
        className
      )}
    >
      {/* Barre d'en-tête avec statut et actions */}
      <div className="p-5 md:p-6 flex items-center justify-between border-b border-neutral-100 dark:border-midnight-800">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Suivi de livraison</h2>
          <Badge
            variant={isCancelled ? 'danger' : isCompleted ? 'success' : isActive ? 'info' : 'neutral'}
            size="sm"
            className="animate-fade-in"
          >
            {isCancelled ? 'Annulée' : isCompleted ? 'Livrée' : isActive ? 'En cours' : 'En attente'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Actualiser">
            <Button variant="ghost" size="icon" onClick={retry} disabled={loading}>
              <RefreshCw size={16} className={cn(loading && 'animate-spin', 'text-neutral-500')} />
            </Button>
          </Tooltip>
          <Tooltip content={mapVisible ? 'Masquer la carte' : 'Afficher la carte'}>
            <Button variant="ghost" size="icon" onClick={() => setMapVisible(!mapVisible)}>
              <Layers size={16} className="text-neutral-500" />
            </Button>
          </Tooltip>
          <Tooltip content="Partager le suivi">
            <Button variant="ghost" size="icon" onClick={() => onAction?.('share')}>
              <Share2 size={16} className="text-neutral-500" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Gestion des états loading / error / empty */}
      {loading && !delivery && (
        <div className="p-8 space-y-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && !loading && (
        <div className="p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20">
            <WifiOff size={32} className="text-red-500" />
          </div>
          <p className="text-neutral-600 dark:text-neutral-400">{error}</p>
          <Button variant="outline-gold" onClick={retry} leftIcon={<RefreshCw size={14} />}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className="p-5 md:p-6 space-y-6">
          {/* Timeline interactive */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Progression
            </h3>
            <div className="relative flex items-start justify-between">
              {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1
                const isCompleted = step.status === 'completed'
                const isCurrent = step.status === 'current'
                const isCancelledStep = step.status === 'cancelled'

                return (
                  <div key={step.id} className="flex-1 relative flex flex-col items-center">
                    {/* Ligne de connexion */}
                    {!isLast && (
                      <div className="absolute top-5 left-[60%] w-full h-0.5 -translate-y-1/2">
                        <div
                          className={cn(
                            'h-full transition-all duration-700',
                            isCompleted
                              ? 'bg-emerald-500'
                              : isCurrent
                              ? 'bg-blue-500'
                              : isCancelledStep
                              ? 'bg-red-300'
                              : 'bg-neutral-200 dark:bg-neutral-700'
                          )}
                        />
                      </div>
                    )}

                    {/* Icône */}
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 cursor-pointer',
                        isCompleted && 'bg-emerald-500 border-emerald-500 text-white shadow-md',
                        isCurrent && 'bg-white dark:bg-midnight-800 border-blue-500 text-blue-500 shadow-glow',
                        !isCompleted && !isCurrent && !isCancelledStep && 'bg-neutral-100 dark:bg-midnight-800 border-neutral-200 dark:border-neutral-700 text-neutral-400',
                        isCancelledStep && 'bg-red-100 dark:bg-red-900/30 border-red-400 text-red-500'
                      )}
                      onClick={() => setShowDetails(prev => !prev)}
                    >
                      {isCompleted ? <CheckCircle size={18} /> : isCancelledStep ? <XCircle size={18} /> : <step.icon size={18} />}
                    </motion.div>

                    {/* Label et détails */}
                    <div className="mt-2 text-center">
                      <p className={cn(
                        'text-xs font-semibold',
                        (isCompleted || isCurrent) ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'
                      )}>
                        {step.label}
                      </p>
                      {step.subLabel && (
                        <p className="text-[10px] text-neutral-400 mt-0.5 max-w-[80px] truncate">
                          {step.subLabel}
                        </p>
                      )}
                      {step.date && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {formatRelative(step.date)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Carte de suivi (affichée si non annulée et visible) */}
          {!isCancelled && mapVisible && lastPosition && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Position du livreur
              </h3>
              <DynamicMapItineraire
                points={[
                  { id: 'livreur', lat: lastPosition.latitude, lng: lastPosition.longitude, label: 'Livreur', type: 'depart' },
                  ...(delivery?.clientLocation ? [{ id: 'client', lat: delivery.clientLocation.latitude, lng: delivery.clientLocation.longitude, label: 'Vous', type: 'arrivee' as const }] : [])
                ]}
                height="200px"
                hideControls
                optimize={false}
              />
              {distanceRemaining !== undefined && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
                  <Navigation size={14} className="text-blue-500" />
                  À environ <span className="font-bold">{distanceRemaining.toFixed(1)} km</span> de vous
                </p>
              )}
            </div>
          )}

          {/* ETA et indicateurs temps réel */}
          <div className="grid grid-cols-2 gap-3">
            {showETA && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Arrivée estimée</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                  {etaMinutes < 1 ? 'Imminente' : `${Math.round(etaMinutes)} min`}
                </p>
                {etaMinutes > 0 && (
                  <motion.div
                    className="mt-1 h-1 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: etaMinutes * 0.1, ease: 'linear' }}
                  >
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                  </motion.div>
                )}
              </div>
            )}
            {lastUpdate && (
              <div className="bg-neutral-50 dark:bg-midnight-800 rounded-xl p-3 border border-neutral-100 dark:border-midnight-700">
                <p className="text-xs text-neutral-500">Dernière mise à jour</p>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: fr })}
                </p>
              </div>
            )}
          </div>

          {/* Carte du livreur (si disponible) */}
          {delivery?.livreur && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Votre livreur
              </h3>
              <DynamicLivreurCard livreur={delivery.livreur} />
            </div>
          )}

          {/* Actions principales (appel, message, signaler) */}
          {!isCancelled && !isCompleted && (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="gold"
                leftIcon={<Phone size={16} />}
                onClick={() => onAction?.('call')}
              >
                Appeler le livreur
              </Button>
              <Button
                variant="outline-gold"
                leftIcon={<MessageSquare size={16} />}
                onClick={() => onAction?.('message')}
              >
                Envoyer un message
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<AlertTriangle size={14} />}
                onClick={() => onAction?.('report')}
              >
                Signaler un problème
              </Button>
            </div>
          )}

          {/* Section détail supplémentaire (expansible) */}
          <AnimatePresence>
            {showDetails && delivery && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-dashed border-neutral-200 dark:border-midnight-700 pt-4 mt-2 space-y-3">
                  <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Détails de la commande</h4>
                  <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <li className="flex justify-between">
                      <span>Commande</span>
                      <span className="font-mono">#{delivery.numeroCommande}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Paiement</span>
                      <span>{delivery.montantTotal} CDF</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Adresse de livraison</span>
                      <span className="text-right max-w-[180px] truncate">{delivery.adresseLivraison}</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Bouton pour afficher plus de détails */}
      {variant === 'full' && !loading && !error && (
        <div className="px-6 py-3 border-t border-neutral-100 dark:border-midnight-800 flex justify-center">
          <button
            onClick={() => setShowDetails(prev => !prev)}
            className="flex items-center gap-1 text-xs text-gold-500 hover:text-gold-600 transition-colors"
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{showDetails ? 'Moins de détails' : 'Plus de détails'}</span>
          </button>
        </div>
      )}
    </div>
  )
}