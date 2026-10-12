'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'
import {
  Percent,
  Sparkles,
  TrendingUp,
  Truck,
  Gift,
  RefreshCw,
  Headset,
  ShieldCheck,
  Star,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface SecondaryNavLink {
  /** Libellé affiché */
  label: string
  /** URL de destination */
  href: string
  /** Icône Lucide */
  icon?: LucideIcon
  /** Badge (ex: "Nouveau", "🔥") */
  badge?: string
  /** Variante du badge */
  badgeVariant?: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'
  /** Lien externe ? */
  external?: boolean
  /** Afficher une bordure active ? */
  highlightActive?: boolean
  /** Désactiver le lien */
  disabled?: boolean
}

interface NavbarSecondaryNavProps {
  /** Liens personnalisés (remplace ceux par défaut) */
  links?: SecondaryNavLink[]
  /** Afficher la barre sur mobile (par défaut masquée) */
  showOnMobile?: boolean
  /** Masquer la barre entièrement */
  hidden?: boolean
  /** Informations de contact (téléphone) affichées à droite */
  supportPhone?: string
  /** Classes additionnelles */
  className?: string
  /** Désactiver l'animation d'indicateur */
  disableAnimation?: boolean
}

/* ========================================================================== */
/*  Liens par défaut                                                           */
/* ========================================================================== */

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
]

/* ========================================================================== */
/*  Composant NavbarSecondaryNav                                               */
/* ========================================================================== */

export function NavbarSecondaryNav({
  links = defaultLinks,
  showOnMobile = false,
  hidden = false,
  supportPhone = '+243 973 868 195',
  className,
  disableAnimation = false,
}: NavbarSecondaryNavProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const sortedLinks = useMemo(() => {
    return [...links].sort((a, b) => {
      const aActive = isActive(a.href) ? -1 : 1
      const bActive = isActive(b.href) ? -1 : 1
      return aActive - bActive
    })
  }, [links, pathname])

  if (hidden) return null

  return (
    <div
      className={cn(
        'bg-gradient-to-r from-midnight-900/50 via-midnight-800/30 to-midnight-900/50 border-t border-gold-400/10',
        !showOnMobile && 'hidden lg:block',
        className
      )}
      role="navigation"
      aria-label="Navigation secondaire"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex items-center gap-1 py-2 overflow-x-auto scrollbar-hide">
          {sortedLinks.map((link) => {
            const active = isActive(link.href) && link.highlightActive !== false
            const Icon = link.icon

            const linkContent = (
              <Link
                key={link.href}
                href={link.disabled ? '#' : link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap',
                  active
                    ? 'text-gold-400'
                    : 'text-neutral-400 hover:text-gold-400',
                  link.disabled && 'opacity-50 cursor-not-allowed'
                )}
                aria-current={active ? 'page' : undefined}
                aria-disabled={link.disabled}
                onClick={(e) => link.disabled && e.preventDefault()}
              >
                {Icon && <Icon size={14} className={active ? 'text-gold-400' : 'text-neutral-400'} />}
                <span>{link.label}</span>
                {link.badge && (
                  <Badge variant={link.badgeVariant || 'gold'} size="sm" className="text-[10px] px-1.5 py-0">
                    {link.badge}
                  </Badge>
                )}

                {active && !disableAnimation && (
                  <motion.div
                    layoutId="nav-secondary-underline"
                    className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-gold-400 to-gold-600 rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            )

            return link.disabled ? (
              <Tooltip key={link.href} content="Bientôt disponible">
                {linkContent}
              </Tooltip>
            ) : (
              linkContent
            )
          })}

          {supportPhone && (
            <div className="ml-auto hidden xl:flex items-center gap-2 text-xs text-neutral-400 flex-shrink-0">
              <Headset size={14} className="text-gold-400" />
              <a
                href={`tel:${supportPhone.replace(/\s/g, '')}`}
                className="hover:text-gold-400 transition-colors"
              >
                {supportPhone}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}