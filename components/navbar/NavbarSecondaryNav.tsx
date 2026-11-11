// components/navbar/NavbarSecondaryNav.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'

import {
  Gift,
  Headset,
  Percent,
  Phone,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Truck,
  type LucideIcon,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type SecondaryBadgeVariant =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  // Legacy compatibility
  | 'gold'
  | 'warm'
  | 'burgundy'

export interface SecondaryNavLink {
  /** Libellé affiché */
  label: string

  /** URL de destination */
  href: string

  /** Icône Lucide */
  icon?: LucideIcon

  /** Badge optionnel, ex : "New", "-30%", "🔥" */
  badge?: string

  /** Variante du badge */
  badgeVariant?: SecondaryBadgeVariant

  /** Lien externe ? */
  external?: boolean

  /** Mettre en avant le lien quand il est actif */
  highlightActive?: boolean

  /** Désactiver le lien */
  disabled?: boolean
}

export interface NavbarSecondaryNavProps {
  /** Liens personnalisés. Remplace les liens par défaut. */
  links?: SecondaryNavLink[]

  /** Afficher la barre sur mobile. Par défaut : masquée sur mobile. */
  showOnMobile?: boolean

  /** Masquer complètement la barre. */
  hidden?: boolean

  /** Numéro de support affiché à droite. */
  supportPhone?: string

  /** Horaires du support affichés à droite sur grand écran. */
  supportHours?: string

  /** Afficher le support aussi sur mobile / tablette. */
  showSupportOnMobile?: boolean

  /** Classes additionnelles. */
  className?: string

  /** Désactiver l’animation de soulignement actif. */
  disableAnimation?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULT LINKS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const defaultLinks: SecondaryNavLink[] = [
  {
    label: 'Promos',
    href: '/promotions',
    icon: Percent,
    badge: '🔥',
    badgeVariant: 'danger',
    highlightActive: true,
  },
  {
    label: 'Nouveautés',
    href: '/nouveautes',
    icon: Sparkles,
    badge: 'New',
    badgeVariant: 'accent',
    highlightActive: true,
  },
  {
    label: 'Meilleures ventes',
    href: '/meilleures-ventes',
    icon: TrendingUp,
    highlightActive: true,
  },
  {
    label: 'Livraison',
    href: '/aide/livraison',
    icon: Truck,
  },
  {
    label: 'Cartes cadeaux',
    href: '/carte-cadeau',
    icon: Gift,
  },
  {
    label: 'Retours',
    href: '/aide/retours',
    icon: RefreshCw,
  },
  {
    label: 'Support',
    href: '/support',
    icon: Headset,
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  BADGE TOKENS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const badgeStyles: Record<
  Exclude<SecondaryBadgeVariant, 'gold' | 'warm' | 'burgundy'>,
  string
> = {
  accent: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  neutral: 'bg-muted text-fg-muted border-line',
}

function normalizeBadgeVariant(
  variant?: SecondaryBadgeVariant
): keyof typeof badgeStyles {
  switch (variant) {
    case 'gold':
    case 'accent':
      return 'accent'

    case 'warm':
    case 'warning':
      return 'warning'

    case 'burgundy':
    case 'danger':
      return 'danger'

    case 'success':
      return 'success'

    case 'neutral':
    default:
      return 'neutral'
  }
}

function SecondaryBadge({
  children,
  variant = 'neutral',
}: {
  children?: string
  variant?: SecondaryBadgeVariant
}) {
  if (!children) return null

  const normalized = normalizeBadgeVariant(variant)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5',
        'text-[9px] font-bold leading-none',
        badgeStyles[normalized]
      )}
    >
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function isActivePath(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false

  if (href === '/') return pathname === '/'

  return pathname === href || pathname.startsWith(`${href}/`)
}

function sanitizeTel(phone: string): string {
  return phone.replace(/\s+/g, '')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarSecondaryNav({
  links = defaultLinks,
  showOnMobile = false,
  hidden = false,
  supportPhone = '+243 973 868 195',
  supportHours = 'Lun–Sam : 8h–20h',
  showSupportOnMobile = false,
  className,
  disableAnimation = false,
}: NavbarSecondaryNavProps) {
  const pathname = usePathname()
  const instanceId = useId()
  const underlineLayoutId = `navbar-secondary-active-${instanceId}`

  const prefersReducedMotion = useReducedMotion()
  const shouldAnimate = !disableAnimation && !prefersReducedMotion

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())

  const safeLinks = Array.isArray(links) ? links : defaultLinks

  const activeLink = useMemo(() => {
    return safeLinks.find((link) => isActivePath(pathname, link.href)) ?? null
  }, [pathname, safeLinks])

  /* ───────────────────────────────────────────────────────────── */
  /*  SCROLL ACTIVE LINK INTO VIEW                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!activeLink) return

    const element = itemRefs.current.get(activeLink.href)

    if (!element) return

    element.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeLink, prefersReducedMotion])

  /* ───────────────────────────────────────────────────────────── */
  /*  REF CALLBACK                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const setItemRef = useCallback((href: string, element: HTMLAnchorElement | null) => {
    if (element) {
      itemRefs.current.set(href, element)
    } else {
      itemRefs.current.delete(href)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  if (hidden) return null

  const wrapperVisibility =
    showOnMobile || showSupportOnMobile
      ? 'block'
      : 'hidden lg:block'

  return (
    <div
      className={cn(
        'border-t border-line/60 bg-surface/45 backdrop-blur-md',
        wrapperVisibility,
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <nav
          ref={scrollContainerRef}
          aria-label="Navigation secondaire"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 scrollbar-hide"
        >
          {safeLinks.map((link) => {
            const active = isActivePath(pathname, link.href)
            const Icon = link.icon

            return (
              <Link
                key={link.href}
                href={link.disabled ? '#' : link.href}
                ref={(element) => setItemRef(link.href, element)}
                aria-current={active ? 'page' : undefined}
                aria-disabled={link.disabled || undefined}
                onClick={
                  link.disabled
                    ? (event) => event.preventDefault()
                    : undefined
                }
                className={cn(
                  'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-xs font-medium',
                  'transition-colors duration-200 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  link.disabled && 'pointer-events-none opacity-50',
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'text-fg-muted hover:bg-muted hover:text-fg'
                )}
              >
                {Icon && (
                  <Icon
                    size={14}
                    strokeWidth={2}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                )}

                <span className="whitespace-nowrap">
                  {link.label}
                </span>

                <SecondaryBadge variant={link.badgeVariant}>
                  {link.badge}
                </SecondaryBadge>

                {shouldAnimate && active && (
                  <motion.span
                    layoutId={underlineLayoutId}
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-accent"
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 32,
                    }}
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {supportPhone && (
          <div
            className={cn(
              'ml-auto hidden shrink-0 items-center gap-2 text-xs text-fg-subtle',
              showSupportOnMobile ? 'flex' : 'xl:flex'
            )}
          >
            <Phone
              size={13}
              strokeWidth={2}
              className="text-accent"
              aria-hidden="true"
            />

            <a
              href={`tel:${sanitizeTel(supportPhone)}`}
              className={cn(
                'font-medium text-fg-muted transition-colors duration-200',
                'hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'rounded-md px-1 py-0.5'
              )}
            >
              {supportPhone}
            </a>

            {supportHours && (
              <span className="hidden lg:inline">
                • {supportHours}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default NavbarSecondaryNav