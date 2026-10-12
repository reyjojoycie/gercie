// app/profile/notifications/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle, Truck, Wallet, CreditCard, Info, UserPlus,
  ShoppingCart, AlertTriangle, Trash2, Check, Clock, Tag, BellOff, BellRing,
  MessageSquare, Gift, Star, Filter, Search, RefreshCw, Eye, 
  ChevronLeft, BadgeCheck, X, ExternalLink
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card, CardContent } from '@/components/ui/Card'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import Link from 'next/link'
import { useInView } from 'react-intersection-observer'

interface Notification {
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

const typeConfig: Record<string, { icon: React.ComponentType<any>; label: string; variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' | 'brand' }> = {
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
  message: { icon: MessageSquare, label: 'Message', variant: 'brand' },
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

export default function NotificationsPage() {
  const { user } = useAuth()
  const toast = useToast()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const { ref, inView } = useInView()

  // Notifications push
  const {
    isSupported,
    permission,
    requestPermission,
    unregister,
    loading: pushLoading,
  } = usePushNotifications()

  // Chargement initial
  useEffect(() => {
    if (!user) return
    loadNotifications(1, true)
  }, [user])

  // Infinite scroll
  useEffect(() => {
    if (inView && hasMore && !loading) {
      loadNotifications(page + 1)
    }
  }, [inView, hasMore, loading, page])

  const loadNotifications = async (pageNum: number, reset = false) => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabaseBrowser
        .from('notifications')
        .select('id, type, title, message, read, created_at, data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range((pageNum - 1) * 20, pageNum * 20 - 1)

      if (!error) {
        if (reset) {
          setNotifications(data || [])
        } else {
          setNotifications(prev => [...prev, ...(data || [])])
        }
        setPage(pageNum)
        setHasMore((data?.length || 0) === 20)
      }
    } catch (err) {
      console.error('Erreur chargement notifications', err)
    } finally {
      // ✅ Correction de l'orthographe ici : finally avec deux "l"
      setLoading(false)
    }
  }

  // Canal temps réel Supabase
  useEffect(() => {
    if (!user) return
    const channel = supabaseBrowser
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev])
          toast.addToast({
            type: 'info',
            title: 'Nouvelle notification',
            message: (payload.new as Notification).title,
            duration: 3000,
          })
        }
      )
      .subscribe()
    return () => { supabaseBrowser.removeChannel(channel) }
  }, [user, toast])

  // Actions
  const markAsRead = async (id: number) => {
    await supabaseBrowser.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markMultipleAsRead = async () => {
    if (selectedIds.size === 0) return
    setActionLoading('mark-read')
    await supabaseBrowser.from('notifications').update({ read: true }).in('id', Array.from(selectedIds))
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, read: true } : n))
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.addToast({ type: 'success', message: `${selectedIds.size} notification(s) marquée(s) comme lue(s)` })
    setActionLoading(null)
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
    if (selectedIds.size === 0) return
    setActionLoading('delete-multiple')
    await supabaseBrowser.from('notifications').delete().in('id', Array.from(selectedIds))
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.addToast({ type: 'info', message: `${selectedIds.size} notification(s) supprimée(s)` })
    setActionLoading(null)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filtrage et recherche
  const filteredNotifications = useMemo(() => {
    let list = notifications

    if (filter === 'unread') list = list.filter(n => !n.read)
    else if (filter === 'read') list = list.filter(n => n.read)

    if (typeFilter !== 'all') list = list.filter(n => n.type === typeFilter)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q)
      )
    }

    return list
  }, [notifications, filter, typeFilter, searchQuery])

  const unreadCount = notifications.filter(n => !n.read).length
  const uniqueTypes = useMemo(() => {
    const types = new Set(notifications.map(n => n.type))
    return Array.from(types)
  }, [notifications])

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState
          icon={<Bell size={48} className="text-muted-foreground" />}
          title="Connexion requise"
          description="Connectez-vous pour voir vos notifications."
          actionLabel="Se connecter"
          onAction={() => window.location.href = '/login?redirect=/profile/notifications'}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Container className="py-8 max-w-4xl">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/profile" className="text-muted-foreground hover:text-gold-500">
                <ChevronLeft size={20} />
              </Link>
              <h1 className="text-3xl font-bold text-foreground font-serif">Mes notifications</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              {unreadCount > 0
                ? `Vous avez ${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
                : 'Aucune nouvelle notification'}
            </p>
          </div>
          <div className="flex gap-2">
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
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button variant="luxe" size="sm" onClick={markAllAsRead} loading={actionLoading === 'mark-all'} leftIcon={<CheckCircle size={14} />}>
                    Tout marquer comme lu
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  <Check size={14} className="mr-1" /> Sélectionner
                </Button>
                <Button variant="ghost" size="sm" onClick={() => loadNotifications(1, true)} loading={loading}>
                  <RefreshCw size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bannière notifications push */}
        <Card variant="glass" className="border-gold-400/20 mb-8 shadow-soft">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                      ? 'Bloquées par le navigateur. Modifiez les paramètres.'
                      : 'Activez pour recevoir des alertes instantanées.'}
                </p>
              </div>
            </div>
            <div>
              {permission === 'granted' ? (
                <Button variant="outline-gold" size="sm" onClick={unregister} loading={pushLoading} leftIcon={<BellOff size={16} />}>
                  Désactiver
                </Button>
              ) : (
                <Button variant="luxe" size="sm" onClick={requestPermission} loading={pushLoading} disabled={!isSupported} leftIcon={<BellRing size={16} />}>
                  Activer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Barre de recherche + filtres */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              leftIcon={<Search size={18} className="text-muted-foreground" />}
              placeholder="Rechercher dans les notifications..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
              onClear={() => setSearchQuery('')}
              variant="glass"
            />
          </div>
          <div className="flex gap-2">
            <Dropdown
              trigger={
                <Button variant="outline-gold" size="sm" leftIcon={<Filter size={14} />}>
                  {typeFilter === 'all' ? 'Tous les types' : typeConfig[typeFilter]?.label || typeFilter}
                </Button>
              }
              align="right"
            >
              <DropdownItem onClick={() => setTypeFilter('all')}>Tous les types</DropdownItem>
              <DropdownSeparator />
              {uniqueTypes.map(type => {
                const config = typeConfig[type]
                if (!config) return null
                const Icon = config.icon
                return (
                  <DropdownItem key={type} onClick={() => setTypeFilter(type)}>
                    <Icon size={16} className="mr-2" />
                    {config.label}
                    {type === typeFilter && <BadgeCheck size={14} className="ml-auto text-gold-500" />}
                  </DropdownItem>
                )
              })}
            </Dropdown>
          </div>
        </div>

        {/* Filtres par statut */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
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
        </div>

        {/* Liste */}
        {loading && notifications.length === 0 ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-border animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-300 dark:bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="w-3/4 h-5 bg-gray-300 dark:bg-gray-800 rounded" />
                    <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={48} className="text-gold-400" />}
            title="Aucune notification"
            description={searchQuery ? 'Aucun résultat pour cette recherche.' : 'Vous n\'avez aucune notification pour le moment.'}
            actionLabel={searchQuery ? 'Effacer la recherche' : undefined}
            onAction={searchQuery ? () => setSearchQuery('') : undefined}
          />
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredNotifications.map((n) => {
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
                    transition={{ duration: 0.3 }}
                    className={cn(
                      'bg-card border rounded-2xl p-4 flex items-start gap-4 transition-all group relative overflow-hidden',
                      !n.read
                        ? 'border-l-4 border-l-gold-400 bg-gold-50/30 dark:bg-gold-950/30'
                        : 'border-border hover:shadow-card-hover',
                      isSelected && 'ring-2 ring-gold-400'
                    )}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(n.id)
                      } else if (!n.read) {
                        markAsRead(n.id)
                      }
                    }}
                  >
                    {/* Checkbox mode sélection */}
                    {selectMode && (
                      <div className="absolute top-3 left-3 z-10">
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          isSelected
                            ? 'bg-gold-500 border-gold-500 text-white'
                            : 'border-neutral-400 bg-white dark:bg-neutral-800'
                        )}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>
                    )}

                    {/* Icône */}
                    <div className={cn(
                      'p-2 rounded-xl flex-shrink-0 transition-colors',
                      !n.read ? 'bg-white dark:bg-midnight-800 shadow-sm' : 'bg-muted'
                    )}>
                      <Icon size={20} className={cn(
                        config.variant === 'gold' && 'text-gold-600 dark:text-gold-400',
                        config.variant === 'accent' && 'text-accent-600 dark:text-accent-400',
                        config.variant === 'warm' && 'text-warm-600 dark:text-warm-400',
                        config.variant === 'danger' && 'text-red-600 dark:text-red-400',
                        config.variant === 'neutral' && 'text-neutral-600 dark:text-neutral-400',
                        config.variant === 'brand' && 'text-brand-600 dark:text-brand-400',
                      )} />
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={config.variant} size="sm">{config.label}</Badge>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={12} />
                          {getRelativeTime(n.created_at)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm text-foreground">{n.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.message}</p>

                      {/* Boutons d'action */}
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!n.read && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); markAsRead(n.id) }} className="text-gold-500">
                            <Eye size={14} className="mr-1" /> Lire
                          </Button>
                        )}
                        {n.link && (
                          <Link href={n.link} onClick={(e) => e.stopPropagation()} className="text-xs text-gold-500 hover:underline flex items-center gap-1 px-2 py-1">
                            <ExternalLink size={12} /> Voir
                          </Link>
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
              <div ref={ref} className="py-4 text-center">
                {loading ? (
                  <Spinner size="sm" label="Chargement..." />
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => loadNotifications(page + 1)}>
                    Afficher plus
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}