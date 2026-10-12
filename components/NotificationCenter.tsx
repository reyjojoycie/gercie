// components/NotificationCenter.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  createContext,
  useContext,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useToast } from '@/components/ui/Toast'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import {
  Bell,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  Wallet,
  CreditCard,
  Info,
  UserPlus,
  ShoppingCart,
  AlertTriangle,
  Trash2,
  Check,
  Clock,
  Tag,
  Smartphone,
  BellOff,
  BellRing,
  Gift,
  Star,
  Zap,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  MoreVertical,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  Inbox,
  Archive,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { useInView } from 'react-intersection-observer'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface AppNotification {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  data?: any
  link?: string
  action_label?: string
}

export interface NotificationCenterProps {
  /** Notifications passées depuis le parent (optionnel, sinon chargement automatique) */
  initialNotifications?: AppNotification[]
  /** Limite par page */
  pageSize?: number
  /** Afficher la bannière push */
  showPushBanner?: boolean
  /** Callback lorsqu'une notification est cliquée */
  onNotificationClick?: (notification: AppNotification) => void
  /** Callback lorsqu'une action groupée est effectuée */
  onAction?: (action: string, ids: number[]) => void
  /** Classes additionnelles */
  className?: string
  /** Mode compact (pas de bannière push, moins de padding) */
  compact?: boolean
}

/* ========================================================================== */
/*  Configuration des types                                                    */
/* ========================================================================== */

const typeConfig: Record<string, { icon: LucideIcon; label: string; variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' | 'brand' }> = {
  commande: { icon: ShoppingCart, label: 'Commande', variant: 'gold' },
  paiement: { icon: CreditCard, label: 'Paiement', variant: 'accent' },
  livraison: { icon: Truck, label: 'Livraison', variant: 'warm' },
  retrait: { icon: Wallet, label: 'Retrait', variant: 'accent' },
  negociation: { icon: Tag, label: 'Négociation', variant: 'neutral' },
  litige: { icon: AlertTriangle, label: 'Litige', variant: 'danger' },
  systeme: { icon: Info, label: 'Système', variant: 'neutral' },
  remboursement: { icon: Wallet, label: 'Remboursement', variant: 'danger' },
  compte: { icon: UserPlus, label: 'Compte', variant: 'gold' },
  promotion: { icon: Gift, label: 'Promotion', variant: 'gold' },
  avis: { icon: Star, label: 'Avis', variant: 'accent' },
  message: { icon: Bell, label: 'Message', variant: 'brand' },
}

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return "À l'instant"
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`
  if (diffHours < 24) return `Il y a ${diffHours} h`
  if (diffDays < 7) return `Il y a ${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/* ========================================================================== */
/*  Composant NotificationCenter                                              */
/* ========================================================================== */

export const NotificationCenter = forwardRef<HTMLDivElement, NotificationCenterProps>(
  (
    {
      initialNotifications,
      pageSize = 20,
      showPushBanner = true,
      onNotificationClick,
      onAction,
      className,
      compact = false,
    },
    ref
  ) => {
    const { user } = useAuth()
    const toast = useToast()

    // Notifications push
    const {
      isSupported,
      permission,
      requestPermission,
      unregister,
      loading: pushLoading,
    } = usePushNotifications()

    // États
    const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications || [])
    const [loading, setLoading] = useState(!initialNotifications)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [selectMode, setSelectMode] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const { ref: loadMoreRef, inView } = useInView()

    // Chargement depuis Supabase si pas de données initiales
    const loadNotifications = useCallback(
      async (pageNum: number, reset = false) => {
        if (!user || initialNotifications) return
        setLoading(true)
        try {
          const { data, error: supError } = await supabaseBrowser
            .from('notifications')
            .select('id, type, title, message, read, created_at, data')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range((pageNum - 1) * pageSize, pageNum * pageSize - 1)

          if (supError) throw new Error(supError.message)
          if (reset) {
            setNotifications(data || [])
          } else {
            setNotifications(prev => [...prev, ...(data || [])])
          }
          setPage(pageNum)
          setHasMore((data?.length || 0) === pageSize)
        } catch (err: any) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      },
      [user, pageSize, initialNotifications]
    )

    useEffect(() => {
      if (!initialNotifications) {
        loadNotifications(1, true)
      }
    }, [loadNotifications, initialNotifications])

    // Infinite scroll
    useEffect(() => {
      if (inView && hasMore && !loading) {
        loadNotifications(page + 1)
      }
    }, [inView, hasMore, loading, page, loadNotifications])

    // Canal temps réel (si pas de données initiales)
    useEffect(() => {
      if (!user || initialNotifications) return
      const channel = supabaseBrowser
        .channel('notifications-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            setNotifications(prev => [payload.new as AppNotification, ...prev])
            toast.addToast({ type: 'info', title: 'Nouvelle notification', message: (payload.new as AppNotification).title })
          }
        )
        .subscribe()
      return () => { supabaseBrowser.removeChannel(channel) }
    }, [user, initialNotifications, toast])

    // Actions
    const markAsRead = async (id: number) => {
      try {
        await supabaseBrowser.from('notifications').update({ read: true }).eq('id', id)
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      } catch {}
    }

    const markMultipleAsRead = async () => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      setActionLoading('mark-read')
      await supabaseBrowser.from('notifications').update({ read: true }).in('id', ids)
      setNotifications(prev => prev.map(n => (ids.includes(n.id) ? { ...n, read: true } : n)))
      setSelectedIds(new Set())
      setSelectMode(false)
      toast.addToast({ type: 'success', message: `${ids.length} notification(s) marquée(s) comme lue(s)` })
      setActionLoading(null)
      onAction?.('mark-read', ids)
    }

    const markAllAsRead = async () => {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
      if (unreadIds.length === 0) return
      setActionLoading('mark-all')
      await supabaseBrowser.from('notifications').update({ read: true }).in('id', unreadIds)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      toast.addToast({ type: 'success', message: 'Toutes les notifications sont marquées comme lues' })
      setActionLoading(null)
    }

    const deleteNotification = async (id: number) => {
      setActionLoading(`delete-${id}`)
      await supabaseBrowser.from('notifications').delete().eq('id', id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
      toast.addToast({ type: 'info', message: 'Notification supprimée' })
      setActionLoading(null)
    }

    const deleteMultiple = async () => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      setActionLoading('delete-multiple')
      await supabaseBrowser.from('notifications').delete().in('id', ids)
      setNotifications(prev => prev.filter(n => !ids.includes(n.id)))
      setSelectedIds(new Set())
      setSelectMode(false)
      toast.addToast({ type: 'info', message: `${ids.length} notification(s) supprimée(s)` })
      setActionLoading(null)
      onAction?.('delete', ids)
    }

    const toggleSelect = (id: number) => {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    const handleNotificationClick = (n: AppNotification) => {
      if (selectMode) {
        toggleSelect(n.id)
      } else if (!n.read) {
        markAsRead(n.id)
      }
      onNotificationClick?.(n)
    }

    // Filtrage
    const filteredNotifications = useMemo(() => {
      let list = notifications
      if (filter === 'unread') list = list.filter(n => !n.read)
      else if (filter === 'read') list = list.filter(n => n.read)
      if (typeFilter !== 'all') list = list.filter(n => n.type === typeFilter)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        list = list.filter(n => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q))
      }
      return list
    }, [notifications, filter, typeFilter, searchQuery])

    const unreadCount = notifications.filter(n => !n.read).length
    const uniqueTypes = useMemo(() => [...new Set(notifications.map(n => n.type))], [notifications])

    return (
      <div ref={ref} className={cn('space-y-6', className)}>
        {/* Bannière push */}
        {showPushBanner && !compact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-5 rounded-2xl bg-card border border-gold-400/20 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                {permission === 'granted' ? <BellRing size={20} /> : <BellOff size={20} />}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Notifications push</h3>
                <p className="text-sm text-muted-foreground">
                  {permission === 'granted'
                    ? 'Activées – vous recevez les alertes en temps réel.'
                    : permission === 'denied'
                      ? 'Bloquées par le navigateur.'
                      : 'Activez pour recevoir des alertes instantanées.'}
                </p>
              </div>
            </div>
            <div>
              {permission === 'granted' ? (
                <Button variant="outline-gold" size="sm" onClick={unregister} loading={pushLoading}>
                  <BellOff size={14} className="mr-1" /> Désactiver
                </Button>
              ) : (
                <Button variant="luxe" size="sm" onClick={requestPermission} loading={pushLoading} disabled={!isSupported}>
                  <BellRing size={14} className="mr-1" /> Activer
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* Barre de contrôle */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 flex gap-2 w-full sm:w-auto">
            <Input
              leftIcon={<Search size={16} className="text-muted-foreground" />}
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
              onClear={() => setSearchQuery('')}
              variant="glass"
              size="sm"
              className="flex-1 max-w-xs"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {selectMode ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedIds.size} sélectionnée(s)</span>
                <Button variant="outline-gold" size="sm" onClick={markMultipleAsRead} loading={actionLoading === 'mark-read'}>
                  <Eye size={14} className="mr-1" /> Lire
                </Button>
                <Button variant="danger" size="sm" onClick={deleteMultiple} loading={actionLoading === 'delete-multiple'}>
                  <Trash2 size={14} className="mr-1" /> Supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}>
                  <X size={14} className="mr-1" /> Annuler
                </Button>
              </div>
            ) : (
              <>
                {unreadCount > 0 && (
                  <Button variant="luxe" size="sm" onClick={markAllAsRead} loading={actionLoading === 'mark-all'}>
                    <CheckCircle2 size={14} className="mr-1" /> Tout lire
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  <Check size={14} className="mr-1" /> Sélectionner
                </Button>
                <Button variant="ghost" size="sm" onClick={() => loadNotifications(1, true)} loading={loading}>
                  <RefreshCw size={14} />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Filtres rapides */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'Toutes' },
            { key: 'unread', label: `Non lues${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
            { key: 'read', label: 'Lues' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap',
                filter === tab.key
                  ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                  : 'bg-card text-foreground border border-border hover:border-gold-400'
              )}
            >
              {tab.label}
            </button>
          ))}
          {/* Types */}
          {uniqueTypes.slice(0, 5).map(type => {
            const config = typeConfig[type]
            if (!config) return null
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap border',
                  typeFilter === type
                    ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                )}
              >
                {config.label}
              </button>
            )
          })}
          {typeFilter !== 'all' && (
            <button onClick={() => setTypeFilter('all')} className="text-xs text-red-500 hover:text-red-600 px-2">
              <X size={12} className="inline mr-1" /> Effacer
            </button>
          )}
        </div>

        {/* Liste des notifications */}
        {loading && notifications.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-border">
                <div className="flex items-start gap-4">
                  <Skeleton variant="rectangular" className="w-10 h-10 rounded-xl" shimmer shimmerVariant="gold" />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" className="w-3/4 h-5" shimmer shimmerVariant="gold" />
                    <Skeleton variant="text" className="w-full h-4" shimmer shimmerVariant="gold" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error && notifications.length === 0 ? (
          <div className="text-center py-10">
            <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="danger" size="sm" onClick={() => loadNotifications(1, true)} className="mt-2">
              <RefreshCw size={14} className="mr-1" /> Réessayer
            </Button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={48} className="text-muted-foreground" />}
            title="Aucune notification"
            description={searchQuery ? 'Aucun résultat trouvé.' : 'Vous êtes à jour !'}
            actionLabel={searchQuery ? 'Effacer la recherche' : undefined}
            onAction={searchQuery ? () => setSearchQuery('') : undefined}
          />
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredNotifications.map(n => {
                const config = typeConfig[n.type] || typeConfig.systeme
                const Icon = config.icon
                const isSelected = selectedIds.has(n.id)
                const isDeleteLoading = actionLoading === `delete-${n.id}`

                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    className={cn(
                      'bg-card border rounded-2xl p-4 flex items-start gap-4 transition-all group relative',
                      !n.read
                        ? 'border-l-4 border-l-gold-400 bg-gold-50/30 dark:bg-gold-950/30'
                        : 'border-border hover:shadow-card-hover',
                      isSelected && 'ring-2 ring-gold-400'
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {selectMode && (
                      <div className="absolute top-3 left-3 z-10">
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center',
                          isSelected ? 'bg-gold-500 border-gold-500 text-white' : 'border-neutral-400 bg-white dark:bg-neutral-800'
                        )}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>
                    )}
                    <div className={cn('p-2 rounded-xl flex-shrink-0', !n.read ? 'bg-white dark:bg-midnight-800 shadow-sm' : 'bg-muted')}>
                      <Icon size={20} className={cn(
                        config.variant === 'gold' && 'text-gold-600 dark:text-gold-400',
                        config.variant === 'accent' && 'text-accent-600 dark:text-accent-400',
                        config.variant === 'warm' && 'text-warm-600 dark:text-warm-400',
                        config.variant === 'danger' && 'text-red-600 dark:text-red-400',
                        config.variant === 'neutral' && 'text-neutral-600 dark:text-neutral-400',
                        config.variant === 'brand' && 'text-brand-600 dark:text-brand-400',
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={config.variant} size="sm">{config.label}</Badge>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={12} /> {getRelativeTime(n.created_at)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm text-foreground">{n.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!n.read && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); markAsRead(n.id) }} className="text-gold-500">
                            <Eye size={14} className="mr-1" /> Lire
                          </Button>
                        )}
                        {n.link && (
                          <a href={n.link} className="text-xs text-gold-500 hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={12} /> Voir
                          </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteNotification(n.id) }} loading={isDeleteLoading}>
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center">
                {loading ? <Spinner size="sm" label="Chargement..." /> : null}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)

NotificationCenter.displayName = 'NotificationCenter'