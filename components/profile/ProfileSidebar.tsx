// components/profile/ProfileSidebar.tsx
'use client'

import {
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Award,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Database,
  Gift,
  Heart,
  LifeBuoy,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  User,
  X,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ProfileSidebarTabId =
  | 'overview'
  | 'orders'
  | 'favorites'
  | 'addresses'
  | 'notifications'
  | 'security'
  | 'preferences'
  | 'loyalty'
  | 'referral'
  | 'reviews'
  | 'support'
  | 'data'

export interface ProfileSidebarStats {
  orders?: number
  favorites?: number
  notifications?: number
  addresses?: number
  tickets?: number
  loyaltyPoints?: number
}

export interface ProfileSidebarProps {
  user: any
  profile: any

  /**
   * @deprecated
   * Propriété conservée uniquement pour compatibilité transitoire.
   * Le système de portefeuille a été supprimé.
   * Cette valeur est volontairement ignorée.
   */
  wallet?: unknown

  isVerified: boolean
  isOnboarded: boolean
  onLogout: () => void
  onAvatarUpdated: (url: string) => void
  onAvatarRemoved: () => void

  activeTab?: ProfileSidebarTabId | string
  onTabChange?: (tab: ProfileSidebarTabId | string) => void

  stats?: ProfileSidebarStats
  currency?: 'USD' | 'CDF'
  exchangeRate?: number | null

  className?: string
}

interface NavItem {
  id: ProfileSidebarTabId
  label: string
  icon: ReactNode
  badgeKey?: keyof ProfileSidebarStats
  description?: string
}

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const MAX_AVATAR_SIZE_MB = 5

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Aperçu',
    icon: <User size={16} />,
    description: 'Vue générale du compte',
  },
  {
    id: 'orders',
    label: 'Commandes',
    icon: <Package size={16} />,
    badgeKey: 'orders',
    description: 'Historique et suivi',
  },
  {
    id: 'favorites',
    label: 'Favoris',
    icon: <Heart size={16} />,
    badgeKey: 'favorites',
    description: 'Produits enregistrés',
  },
  {
    id: 'addresses',
    label: 'Adresses',
    icon: <MapPin size={16} />,
    badgeKey: 'addresses',
    description: 'Livraison et retrait',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={16} />,
    badgeKey: 'notifications',
    description: 'Alertes et messages',
  },
  {
    id: 'security',
    label: 'Sécurité',
    icon: <ShieldCheck size={16} />,
    description: 'Mot de passe, 2FA, sessions',
  },
  {
    id: 'preferences',
    label: 'Préférences',
    icon: <Settings size={16} />,
    description: 'Langue, devise, thème',
  },
  {
    id: 'loyalty',
    label: 'Fidélité',
    icon: <Award size={16} />,
    badgeKey: 'loyaltyPoints',
    description: 'Points et avantages',
  },
  {
    id: 'referral',
    label: 'Parrainage',
    icon: <Gift size={16} />,
    description: 'Inviter et gagner',
  },
  {
    id: 'reviews',
    label: 'Avis',
    icon: <Star size={16} />,
    description: 'Vos évaluations',
  },
  {
    id: 'support',
    label: 'Support',
    icon: <LifeBuoy size={16} />,
    badgeKey: 'tickets',
    description: 'Assistance et tickets',
  },
  {
    id: 'data',
    label: 'Données',
    icon: <Database size={16} />,
    description: 'Export et confidentialité',
  },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  try {
    if (toast?.addToast) {
      toast.addToast({ type, message })
    } else if (toast?.show) {
      toast.show({ type, message })
    } else if (typeof toast === 'function') {
      toast(message, { type })
    }
  } catch {
    // silencieux
  }
}

function initials(first?: string, last?: string): string {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || 'U'
}

function getNavHref(tabId: ProfileSidebarTabId): string {
  if (tabId === 'overview') return '/profile'
  return `/profile?tab=${tabId}`
}

/* ------------------------------------------------------------------ */
/* Mini modal local                                                    */
/* ------------------------------------------------------------------ */

function LocalModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'sm',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl',
          size === 'sm' ? 'max-w-md' : 'max-w-xl'
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export function ProfileSidebar({
  user,
  profile,
  isVerified,
  isOnboarded,
  onLogout,
  onAvatarUpdated,
  onAvatarRemoved,
  activeTab,
  onTabChange,
  stats,
  currency,
  exchangeRate,
  className,
}: ProfileSidebarProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [showRemoveAvatarModal, setShowRemoveAvatarModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const safeStats = useMemo(() => stats ?? {}, [stats])

  const displayName = useMemo(() => {
    if (profile?.prenom && profile?.nom) {
      return `${profile.prenom} ${profile.nom}`
    }
    return profile?.prenom || profile?.nom || user?.email || 'Utilisateur'
  }, [profile?.nom, profile?.prenom, user?.email])

  const displayEmail = useMemo(() => {
    return profile?.email || user?.email || '—'
  }, [profile?.email, user?.email])

  const currentAvatar = useMemo(() => {
    return previewUrl || profile?.avatar_url || null
  }, [previewUrl, profile?.avatar_url])

  const profileCompleteness = useMemo(() => {
    const checks = [
      Boolean(profile?.avatar_url),
      Boolean(profile?.prenom?.trim()),
      Boolean(profile?.nom?.trim()),
      Boolean(profile?.email?.trim() || user?.email?.trim()),
      Boolean(profile?.telephone?.trim()),
      Number(safeStats.addresses || 0) > 0,
    ]

    const filled = checks.filter(Boolean).length
    return Math.round((filled / checks.length) * 100)
  }, [
    profile?.avatar_url,
    profile?.email,
    profile?.nom,
    profile?.prenom,
    profile?.telephone,
    safeStats.addresses,
    user?.email,
  ])

  const currencyLabel = useMemo(() => {
    if (!currency) return null

    if (currency === 'USD') {
      return exchangeRate
        ? `USD • 1 $ ≈ ${Math.round(exchangeRate).toLocaleString('fr-FR')} FC`
        : 'USD'
    }

    return exchangeRate
      ? `CDF • 1 FC ≈ ${(1 / exchangeRate).toFixed(4)} $`
      : 'CDF'
  }, [currency, exchangeRate])

  /* ---------------------------------------------------------------- */
  /* Avatar                                                            */
  /* ---------------------------------------------------------------- */

  const openAvatarPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleAvatarChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file) return

      if (!file.type.startsWith('image/')) {
        notify(toast, 'error', 'Le fichier doit être une image')
        return
      }

      if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
        notify(
          toast,
          'error',
          `L\'image ne doit pas dépasser ${MAX_AVATAR_SIZE_MB} Mo`
        )
        return
      }

      const objectUrl = URL.createObjectURL(file)
      setPreviewUrl(objectUrl)
      setUploadingAvatar(true)

      try {
        const formData = new FormData()
        formData.append('file', file)

        if (user?.id) {
          formData.append('userId', user.id)
        }

        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          let message = "Impossible de téléverser l'image"
          try {
            const err = await res.json()
            message = err.error || err.message || message
          } catch {
            // ignore
          }
          throw new Error(message)
        }

        const data = await res.json()
        const url =
          data?.url ||
          data?.data?.url ||
          data?.avatar_url ||
          data?.path ||
          data?.publicUrl

        if (!url) {
          throw new Error('URL de l\'avatar absente de la réponse')
        }

        onAvatarUpdated(url)
        setPreviewUrl(null)
        notify(toast, 'success', 'Photo de profil mise à jour')
      } catch (err: any) {
        setPreviewUrl(null)
        notify(toast, 'error', err?.message || 'Erreur lors du téléversement')
      } finally {
        setUploadingAvatar(false)
        URL.revokeObjectURL(objectUrl)
      }
    },
    [onAvatarUpdated, toast, user?.id]
  )

  const confirmRemoveAvatar = useCallback(async () => {
    setRemovingAvatar(true)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatar_url: null }),
      })

      if (!res.ok) {
        let message = 'Impossible de supprimer la photo'
        try {
          const err = await res.json()
          message = err.error || err.message || message
        } catch {
          // ignore
        }
        throw new Error(message)
      }

      onAvatarRemoved()
      setPreviewUrl(null)
      setShowRemoveAvatarModal(false)
      notify(toast, 'success', 'Photo de profil supprimée')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de la suppression')
    } finally {
      setRemovingAvatar(false)
    }
  }, [onAvatarRemoved, toast])

  /* ---------------------------------------------------------------- */
  /* Logout                                                            */
  /* ---------------------------------------------------------------- */

  const confirmLogout = useCallback(() => {
    setShowLogoutModal(false)
    onLogout()
  }, [onLogout])

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  const handleNavClick = useCallback(
    (tabId: ProfileSidebarTabId) => {
      if (onTabChange) {
        onTabChange(tabId)
      }
    },
    [onTabChange]
  )

  const renderNavItem = useCallback(
    (item: NavItem) => {
      const isActive = activeTab === item.id
      const badgeValue = item.badgeKey ? safeStats[item.badgeKey] : undefined
      const showBadge = typeof badgeValue === 'number' && badgeValue > 0

      const inner = (
        <>
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
              isActive
                ? 'bg-gold-500/15 text-gold-600'
                : 'bg-muted text-muted-foreground group-hover:text-gold-600'
            )}
          >
            {item.icon}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate text-sm font-medium transition',
                isActive ? 'text-gold-600' : 'text-foreground'
              )}
            >
              {item.label}
            </span>

            {item.description && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            )}
          </span>

          {showBadge && (
            <Badge variant={item.id === 'notifications' ? 'danger' : 'neutral'} size="sm">
              {badgeValue}
            </Badge>
          )}

          <ChevronRight
            size={14}
            className={cn(
              'shrink-0 transition',
              isActive ? 'text-gold-500' : 'text-muted-foreground/50'
            )}
          />
        </>
      )

      const sharedClassName = cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500',
        isActive
          ? 'border-gold-400/40 bg-gold-500/10 shadow-sm'
          : 'border-transparent hover:border-gold-400/20 hover:bg-muted'
      )

      if (onTabChange) {
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavClick(item.id)}
            className={sharedClassName}
            aria-current={isActive ? 'page' : undefined}
          >
            {inner}
          </button>
        )
      }

      return (
        <Link
          key={item.id}
          href={getNavHref(item.id)}
          className={sharedClassName}
          aria-current={isActive ? 'page' : undefined}
        >
          {inner}
        </Link>
      )
    },
    [activeTab, handleNavClick, onTabChange, safeStats]
  )

  /* ---------------------------------------------------------------- */
  /* Rendu                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <aside className={cn('space-y-4', className)}>
        {/* Carte profil */}
        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            {/* Avatar */}
            <div className="relative">
              <div className="h-28 w-28 overflow-hidden rounded-full ring-2 ring-offset-4 ring-gold-400 ring-offset-background bg-muted shadow-gold">
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-gold-500">
                    {initials(profile?.prenom, profile?.nom)}
                  </div>
                )}

                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 size={24} className="animate-spin text-white" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={openAvatarPicker}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 p-2 text-white shadow-gold transition hover:shadow-glow-gold disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-background"
                aria-label="Changer la photo de profil"
              >
                <Camera size={16} />
              </button>

              {currentAvatar && !uploadingAvatar && (
                <button
                  type="button"
                  onClick={() => setShowRemoveAvatarModal(true)}
                  className="absolute top-0 right-0 rounded-full bg-red-500 p-1.5 text-white shadow-md transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-background"
                  aria-label="Supprimer la photo de profil"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Nom / email */}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-foreground">
                {displayName}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {displayEmail}
              </p>
            </div>

            {/* Badges statut */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant={isVerified ? 'accent' : 'warm'} size="sm">
                {isVerified ? (
                  <>
                    <CheckCircle2 size={12} className="mr-1" />
                    Vérifié
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} className="mr-1" />
                    Non vérifié
                  </>
                )}
              </Badge>

              {isOnboarded ? (
                <Badge variant="gold" size="sm">
                  Onboarding terminé
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  À compléter
                </Badge>
              )}

              {currencyLabel && (
                <Badge variant="neutral" size="sm">
                  {currencyLabel}
                </Badge>
              )}
            </div>

            {/* Complétude profil */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Complétude du profil</span>
                <span className="font-semibold text-foreground">
                  {profileCompleteness}%
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    profileCompleteness >= 80
                      ? 'bg-green-500'
                      : profileCompleteness >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  )}
                  style={{ width: `${profileCompleteness}%` }}
                />
              </div>
            </div>

            {/* Onboarding CTA */}
            {!isOnboarded && (
              <Link href="/onboarding" className="w-full">
                <Button variant="luxe" fullWidth size="sm">
                  Finaliser mon compte
                </Button>
              </Link>
            )}

            {/* Actions principales */}
            <div className="w-full space-y-2">
              {onTabChange ? (
                <Button
                  variant="outline-gold"
                  fullWidth
                  size="sm"
                  leftIcon={<Settings size={14} />}
                  onClick={() => onTabChange('preferences')}
                >
                  Préférences
                </Button>
              ) : (
                <Link href="/profile?tab=preferences">
                  <Button variant="outline-gold" fullWidth size="sm" leftIcon={<Settings size={14} />}>
                    Préférences
                  </Button>
                </Link>
              )}

              <Button
                variant="outline"
                fullWidth
                size="sm"
                className="text-red-500 hover:bg-red-500/10"
                leftIcon={<LogOut size={14} />}
                onClick={() => setShowLogoutModal(true)}
              >
                Déconnexion
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mini statistiques */}
        <Card variant="glass" className="border-gold-400/20">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activité
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Package size={14} className="text-gold-500" />
                  Commandes
                </div>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {safeStats.orders ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Heart size={14} className="text-gold-500" />
                  Favoris
                </div>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {safeStats.favorites ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bell size={14} className="text-gold-500" />
                  Notifications
                </div>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {safeStats.notifications ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin size={14} className="text-gold-500" />
                  Adresses
                </div>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {safeStats.addresses ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <Card variant="glass" className="border-gold-400/20">
          <CardContent className="p-3">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Menu du profil
            </p>

            <nav className="space-y-1" aria-label="Navigation du profil">
              {NAV_ITEMS.map(renderNavItem)}
            </nav>
          </CardContent>
        </Card>

        {/* Sécurité rapide */}
        <Card variant="glass" className="border-gold-400/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-gold-500" />
              <p className="text-sm font-semibold text-foreground">Sécurité</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Protégez votre compte avec un mot de passe robuste et activez la double authentification si disponible.
            </p>

            {onTabChange ? (
              <Button
                variant="outline-gold"
                size="sm"
                fullWidth
                onClick={() => onTabChange('security')}
              >
                Gérer la sécurité
              </Button>
            ) : (
              <Link href="/profile?tab=security">
                <Button variant="outline-gold" size="sm" fullWidth>
                  Gérer la sécurité
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Support rapide */}
        <Card variant="glass" className="border-gold-400/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <LifeBuoy size={18} className="text-gold-500" />
              <p className="text-sm font-semibold text-foreground">Besoin d\'aide ?</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Ouvrez un ticket support pour une commande, un paiement, une livraison ou un problème de compte.
            </p>

            {onTabChange ? (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => onTabChange('support')}
              >
                Contacter le support
              </Button>
            ) : (
              <Link href="/profile?tab=support">
                <Button variant="outline" size="sm" fullWidth>
                  Contacter le support
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Modal suppression avatar */}
      <LocalModal
        open={showRemoveAvatarModal}
        onClose={() => setShowRemoveAvatarModal(false)}
        title="Supprimer la photo"
        description="Votre photo de profil actuelle sera retirée."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowRemoveAvatarModal(false)}
              disabled={removingAvatar}
            >
              Annuler
            </Button>

            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              onClick={confirmRemoveAvatar}
              disabled={removingAvatar}
              leftIcon={
                removingAvatar ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )
              }
            >
              Supprimer
            </Button>
          </>
        }
      >
        <div className="flex items-center justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-muted ring-2 ring-red-500/30">
            {currentAvatar ? (
              <img
                src={currentAvatar}
                alt="Avatar actuel"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                {initials(profile?.prenom, profile?.nom)}
              </div>
            )}
          </div>
        </div>
      </LocalModal>

      {/* Modal déconnexion */}
      <LocalModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Déconnexion"
        description="Voulez-vous vraiment vous déconnecter ?"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowLogoutModal(false)}>
              Annuler
            </Button>

            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              onClick={confirmLogout}
              leftIcon={<LogOut size={14} />}
            >
              Se déconnecter
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Vous devrez vous reconnecter pour accéder à votre espace client.
        </p>
      </LocalModal>
    </>
  )
}

export default ProfileSidebar