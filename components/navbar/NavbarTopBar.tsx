// components/navbar/NavbarTopBar.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'

import {
  ChevronUp,
  Clock,
  Headset,
  Info,
  Megaphone,
  Phone,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface TopBarLink {
  /** Libellé affiché */
  label: string

  /** URL de destination */
  href: string

  /** Icône optionnelle */
  icon?: ReactNode

  /** Tooltip optionnel */
  tooltip?: string

  /** Lien externe ? */
  external?: boolean

  /** Lien désactivé ? */
  disabled?: boolean
}

export interface TrustBadge {
  /** Icône */
  icon: ReactNode

  /** Texte affiché */
  text: string

  /** Tooltip optionnel */
  tooltip?: string
}

export type TopBarAnnouncementTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

export interface NavbarTopBarProps {
  /** Afficher la barre sur mobile. Par défaut : masquée sur mobile. */
  showOnMobile?: boolean

  /** Badges de confiance à gauche. */
  trustBadges?: TrustBadge[]

  /** Liens rapides à droite. */
  links?: TopBarLink[]

  /** Numéro de support. */
  supportPhone?: string

  /** Horaires du support. */
  supportHours?: string

  /** Afficher l’indicateur de connexion réseau. */
  showStatus?: boolean

  /** Mode compact : réduit la hauteur et affiche moins d’informations. */
  compact?: boolean

  /** Classes additionnelles. */
  className?: string

  /** Message d’annonce optionnel. */
  announcement?: string

  /** Ton du message d’annonce. */
  announcementTone?: TopBarAnnouncementTone

  /** Autoriser la fermeture du message d’annonce. */
  dismissibleAnnouncement?: boolean

  /** Clé de stockage personnalisée pour l’annonce fermée. */
  storageKeyAnnouncement?: string

  /**
   * @deprecated La gestion multilingue est supprimée du projet.
   * Prop conservée uniquement pour compatibilité temporaire.
   */
  showLanguageSwitcher?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULTS                                                       */
/* ═══════════════════════════════════════════════════════════════ */

const defaultTrustBadges: TrustBadge[] = [
  {
    icon: <Truck size={12} />,
    text: 'Livraison suivie',
    tooltip: 'Suivi de commande disponible.',
  },
  {
    icon: <ShieldCheck size={12} />,
    text: 'Paiement sécurisé',
    tooltip: 'Transactions protégées.',
  },
  {
    icon: <Headset size={12} />,
    text: 'Support réactif',
    tooltip: 'Une équipe disponible pour vous aider.',
  },
]

const defaultLinks: TopBarLink[] = [
  {
    href: '/aide/livraison',
    label: 'Suivi de commande',
    icon: <Truck size={12} />,
  },
  {
    href: '/aide/retours',
    label: 'Retours',
    icon: <RefreshCw size={12} />,
  },
  {
    href: '/support',
    label: 'Aide & Contact',
    icon: <Headset size={12} />,
  },
]

const announcementToneClasses: Record<TopBarAnnouncementTone, string> = {
  info: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function createAnnouncementKey(text: string): string {
  return `gercie-topbar-announcement:${encodeURIComponent(text).slice(0, 96)}`
}

function sanitizeTel(phone: string): string {
  return phone.replace(/\s+/g, '')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUBCOMPONENTS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function TrustBadgeItem({ badge }: { badge: TrustBadge }) {
  const content = (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="shrink-0 text-accent"
        aria-hidden="true"
      >
        {badge.icon}
      </span>

      <span className="truncate text-fg-muted">
        {badge.text}
      </span>
    </span>
  )

  if (badge.tooltip) {
    return <Tooltip content={badge.tooltip}>{content}</Tooltip>
  }

  return content
}

function TopBarLinkItem({
  link,
  onNavigate,
  layout = 'inline',
}: {
  link: TopBarLink
  onNavigate?: () => void
  layout?: 'inline' | 'stack'
}) {
  const icon = link.icon ? (
    <span
      className="shrink-0 text-accent"
      aria-hidden="true"
    >
      {link.icon}
    </span>
  ) : null

  const label = (
    <span className="truncate">
      {link.label}
    </span>
  )

  if (link.disabled) {
    const content = (
      <span
        className={cn(
          layout === 'stack'
            ? 'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left opacity-50 pointer-events-none'
            : 'inline-flex items-center gap-1 whitespace-nowrap opacity-50 pointer-events-none',
          'text-fg-muted'
        )}
      >
        {icon}
        {label}
      </span>
    )

    if (link.tooltip) {
      return <Tooltip content={link.tooltip}>{content}</Tooltip>
    }

    return content
  }

  const classes = cn(
    layout === 'stack'
      ? 'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left'
      : 'inline-flex items-center gap-1 whitespace-nowrap',
    'text-fg-muted transition-colors duration-200 ease-out',
    'hover:text-accent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
  )

  const content = link.external ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className={classes}
    >
      {icon}
      {label}
    </a>
  ) : (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={classes}
    >
      {icon}
      {label}
    </Link>
  )

  if (link.tooltip) {
    return <Tooltip content={link.tooltip}>{content}</Tooltip>
  }

  return content
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarTopBar({
  showOnMobile = false,
  trustBadges = defaultTrustBadges,
  links = defaultLinks,
  supportPhone = '+243 973 868 195',
  supportHours = 'Lun–Sam : 8h–20h',
  showStatus = true,
  compact = false,
  className,
  announcement,
  announcementTone = 'info',
  dismissibleAnnouncement = true,
  storageKeyAnnouncement,
  showLanguageSwitcher,
}: NavbarTopBarProps) {
  // Prop dépréciée conservée pour compatibilité temporaire.
  void showLanguageSwitcher

  const uniqueId = useId()
  const pathname = usePathname()
  const prefersReducedMotion = useReducedMotion()

  const [mounted, setMounted] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [announcementReady, setAnnouncementReady] = useState<boolean | null>(null)
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)

  const safeTrustBadges = Array.isArray(trustBadges) ? trustBadges : defaultTrustBadges
  const safeLinks = Array.isArray(links) ? links : defaultLinks

  const firstBadge = safeTrustBadges[0]
  const hasMobileExtra =
    safeTrustBadges.length > 1 ||
    safeLinks.length > 0 ||
    Boolean(supportPhone || supportHours)

  const announcementKey = useMemo(() => {
    if (!announcement) return null
    return storageKeyAnnouncement ?? createAnnouncementKey(announcement)
  }, [announcement, storageKeyAnnouncement])

  const visibleAnnouncement =
    Boolean(announcement) &&
    announcementReady === true &&
    !announcementDismissed

  /* ───────────────────────────────────────────────────────────── */
  /*  MOUNT                                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  NETWORK STATUS                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return

    setOnline(navigator.onLine)

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  ANNOUNCEMENT DISMISS STATE                                   */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!announcement) {
      setAnnouncementReady(true)
      return
    }

    try {
      const stored = window.localStorage.getItem(announcementKey ?? '')
      setAnnouncementDismissed(Boolean(stored))
    } catch {
      setAnnouncementDismissed(false)
    }

    setAnnouncementReady(true)
  }, [announcement, announcementKey])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLOSE MOBILE EXPANDED ON ROUTE CHANGE                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setExpanded(false)
  }, [pathname])

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const dismissAnnouncement = useCallback(() => {
    setAnnouncementDismissed(true)

    if (!announcementKey) return

    try {
      window.localStorage.setItem(announcementKey, '1')
    } catch {
      // stockage indisponible : on continue silencieusement
    }
  }, [announcementKey])

  const toggleExpanded = useCallback(() => {
    setExpanded((previous) => !previous)
  }, [])

  const closeExpanded = useCallback(() => {
    setExpanded(false)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOTION                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const announcementMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
        transition: { duration: 0.18, ease: 'easeOut' as const },
      }

  const mobilePanelMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
        transition: { duration: 0.18, ease: 'easeOut' as const },
      }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div
      className={cn(
        'bg-muted/55 text-xs',
        showOnMobile ? 'block' : 'hidden sm:block',
        className
      )}
    >
      {/* ========================================================
          ANNOUNCEMENT
         ======================================================== */}
      <AnimatePresence initial={false}>
        {visibleAnnouncement && (
          <motion.div
            {...announcementMotion}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 sm:px-6 lg:px-8',
                announcementToneClasses[announcementTone]
              )}
            >
              <Megaphone
                size={13}
                strokeWidth={2}
                className="shrink-0"
                aria-hidden="true"
              />

              <p className="min-w-0 flex-1 truncate font-medium">
                {announcement}
              </p>

              {dismissibleAnnouncement && (
                <button
                  type="button"
                  onClick={dismissAnnouncement}
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                    'transition-colors duration-200',
                    'hover:bg-surface/60',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current'
                  )}
                  aria-label="Fermer l’annonce"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MAIN TOP BAR ROW
         ======================================================== */}
      <div
        className={cn(
          'mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8',
          compact ? 'h-8' : 'h-9'
        )}
      >
        {/* Left : trust badges */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {compact ? (
            firstBadge && <TrustBadgeItem badge={firstBadge} />
          ) : (
            <div className="hidden items-center gap-4 sm:flex">
              {safeTrustBadges.map((badge, index) => (
                <TrustBadgeItem
                  key={`${badge.text}-${index}`}
                  badge={badge}
                />
              ))}
            </div>
          )}

          {showOnMobile && (
            <div className="flex min-w-0 items-center gap-2 sm:hidden">
              {!compact && firstBadge && (
                <TrustBadgeItem badge={firstBadge} />
              )}

              {hasMobileExtra && (
                <button
                  type="button"
                  onClick={toggleExpanded}
                  aria-expanded={expanded}
                  aria-controls={`${uniqueId}-mobile-panel`}
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                    'text-fg-muted transition-colors duration-200',
                    'hover:bg-surface/70 hover:text-accent',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-muted'
                  )}
                >
                  {expanded ? (
                    <ChevronUp size={14} aria-hidden="true" />
                  ) : (
                    <Info size={14} aria-hidden="true" />
                  )}

                  <span className="sr-only">
                    {expanded
                      ? 'Réduire les informations'
                      : 'Afficher les informations'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right : links, support, status */}
        <div className="flex shrink-0 items-center gap-3">
          {safeLinks.length > 0 && (
            <div className="hidden items-center gap-4 md:flex">
              {safeLinks.map((link, index) => (
                <TopBarLinkItem
                  key={`${link.href}-${index}`}
                  link={link}
                />
              ))}
            </div>
          )}

          {supportPhone && (
            <a
              href={`tel:${sanitizeTel(supportPhone)}`}
              className={cn(
                'hidden items-center gap-1 whitespace-nowrap text-fg-muted transition-colors duration-200',
                'hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-muted',
                'rounded-md px-1 py-0.5 lg:flex'
              )}
              aria-label={`Appeler le support : ${supportPhone}`}
            >
              <Phone
                size={12}
                className="text-accent"
                aria-hidden="true"
              />

              <span>{supportPhone}</span>
            </a>
          )}

          {supportHours && (
            <Tooltip content={supportHours}>
              <span className="hidden items-center gap-1 text-fg-subtle xl:flex">
                <Clock
                  size={12}
                  aria-hidden="true"
                />

                <span>{supportHours}</span>
              </span>
            </Tooltip>
          )}

          {showStatus && mounted && (
            <span
              className="hidden items-center gap-1.5 text-fg-subtle sm:inline-flex"
              title={
                online === null
                  ? 'État de connexion'
                  : online
                    ? 'Connexion active'
                    : 'Hors ligne'
              }
            >
              {online === null ? (
                <WifiOff size={12} aria-hidden="true" />
              ) : online ? (
                <Wifi size={12} className="text-success" aria-hidden="true" />
              ) : (
                <WifiOff size={12} className="text-danger" aria-hidden="true" />
              )}

              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  online === null
                    ? 'bg-fg-subtle'
                    : online
                      ? 'bg-success'
                      : 'bg-danger'
                )}
                aria-hidden="true"
              />
            </span>
          )}
        </div>
      </div>

      {/* ========================================================
          MOBILE EXPANDED PANEL
         ======================================================== */}
      <AnimatePresence initial={false}>
        {showOnMobile && expanded && (
          <motion.div
            id={`${uniqueId}-mobile-panel`}
            {...mobilePanelMotion}
            className="overflow-hidden border-t border-line/60 bg-surface/65 sm:hidden"
          >
            <div className="space-y-3 px-4 py-3">
              {safeTrustBadges.length > 0 && (
                <div className="space-y-1.5">
                  {safeTrustBadges.map((badge, index) => (
                    <TrustBadgeItem
                      key={`mobile-badge-${badge.text}-${index}`}
                      badge={badge}
                    />
                  ))}
                </div>
              )}

              {safeLinks.length > 0 && (
                <div className="grid gap-1 border-t border-line/60 pt-2">
                  {safeLinks.map((link, index) => (
                    <TopBarLinkItem
                      key={`mobile-link-${link.href}-${index}`}
                      link={link}
                      layout="stack"
                      onNavigate={closeExpanded}
                    />
                  ))}
                </div>
              )}

              {(supportPhone || supportHours) && (
                <div className="space-y-1 border-t border-line/60 pt-2">
                  {supportPhone && (
                    <a
                      href={`tel:${sanitizeTel(supportPhone)}`}
                      className="flex items-center gap-2 rounded-control px-2 py-1.5 text-left text-fg-muted transition-colors duration-200 hover:bg-muted hover:text-accent"
                    >
                      <Phone
                        size={12}
                        className="text-accent"
                        aria-hidden="true"
                      />

                      <span>{supportPhone}</span>
                    </a>
                  )}

                  {supportHours && (
                    <span className="flex items-center gap-2 px-2 py-1 text-fg-subtle">
                      <Clock
                        size={12}
                        aria-hidden="true"
                      />

                      <span>{supportHours}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NavbarTopBar