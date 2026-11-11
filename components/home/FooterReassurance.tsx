// components/FooterReassurance.tsx
'use client'

import Link from 'next/link'

import { Container } from '@/components/layout/Container'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  BadgeCheck,
  Clock,
  Headset,
  Heart,
  Lock,
  MapPin,
  RefreshCcw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface ReassuranceItem {
  Icon: LucideIcon
  title: string
  subtitle: string
  href: string
  tooltip: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DONNÉES                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const reassurances: ReassuranceItem[] = [
  {
    Icon: Lock,
    title: 'Paiement 100 % sécurisé',
    subtitle: 'Cryptage SSL & 3D Secure',
    href: '/securite',
    tooltip:
      'Vos données bancaires sont protégées par un cryptage de niveau bancaire.',
  },
  {
    Icon: Clock,
    title: 'Livraison express',
    subtitle: '24-48h à Kinshasa',
    href: '/aide/livraison',
    tooltip:
      'Expédition rapide le jour même pour toute commande passée avant 14h.',
  },
  {
    Icon: RefreshCcw,
    title: 'Retours gratuits',
    subtitle: 'Sous 15 jours',
    href: '/aide/retours',
    tooltip:
      'Changez d’avis ? Retournez votre article sans frais sous 15 jours.',
  },
  {
    Icon: Headset,
    title: 'Support 7j/7',
    subtitle: 'Chat, email & téléphone',
    href: '/support',
    tooltip:
      'Notre équipe est disponible pour vous aider à tout moment.',
  },
  {
    Icon: BadgeCheck,
    title: 'Produits authentiques',
    subtitle: 'Garantis par nos experts',
    href: '/conditions',
    tooltip:
      'Tous nos produits sont vérifiés et accompagnés de leur garantie.',
  },
  {
    Icon: MapPin,
    title: 'Click & Collect',
    subtitle: 'Points retrait en RDC',
    href: '/points-retrait',
    tooltip:
      'Retirez votre commande dans le point de retrait le plus proche.',
  },
  {
    Icon: Heart,
    title: 'Satisfaction garantie',
    subtitle: 'Ou remboursé',
    href: '/garantie',
    tooltip:
      '98 % de nos clients recommandent Gercie.',
  },
  {
    Icon: Sparkles,
    title: 'Offres exclusives',
    subtitle: 'Promos & ventes flash',
    href: '/deals',
    tooltip:
      'Profitez de réductions toute l’année sur une large sélection.',
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  REASSURANCE LINK                                               */
/* ═══════════════════════════════════════════════════════════════ */

function ReassuranceLink({
  item,
  showSubtitle = false,
  className,
}: {
  item: ReassuranceItem
  showSubtitle?: boolean
  className?: string
}) {
  const { Icon, title, subtitle, href } = item

  return (
    <Link
      href={href}
      className={cn(
        'group flex w-full flex-col items-center gap-2 rounded-card border border-transparent p-3 text-center',
        'transition-all duration-200 ease-out',
        'hover:border-line hover:bg-muted/50 hover:shadow-card',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'motion-reduce:transition-none',
        className
      )}
      aria-label={showSubtitle ? `${title}. ${subtitle}` : title}
    >
      <span
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          'border border-accent/20 bg-accent-soft text-accent shadow-card',
          'transition-colors duration-200',
          'group-hover:bg-accent/15',
          'motion-reduce:transition-none'
        )}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={2} className="text-accent" />
      </span>

      <span className="text-xs font-semibold leading-tight text-fg">
        {title}
      </span>

      {showSubtitle ? (
        <span className="hidden text-[10px] leading-tight text-fg-subtle lg:block">
          {subtitle}
        </span>
      ) : null}
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function FooterReassurance() {
  return (
    <section
      className="relative isolate border-t border-line bg-surface py-8 md:py-10"
      aria-labelledby="footer-reassurance-heading"
    >
      {/* Ligne décorative premium discrète */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden="true"
      />

      <Container>
        <h2 id="footer-reassurance-heading" className="sr-only">
          Nos garanties client
        </h2>

        {/* ====================================================
            DESKTOP / TABLETTE : GRILLE
           ==================================================== */}
        <div className="hidden gap-3 md:grid md:grid-cols-4 lg:grid-cols-8 lg:gap-4">
          {reassurances.map((item) => (
            <div key={item.href} className="w-full [&>div]:w-full">
              <Tooltip
                content={item.tooltip}
                delay={200}
                disableOnMobile
              >
                <ReassuranceLink item={item} showSubtitle />
              </Tooltip>
            </div>
          ))}
        </div>

        {/* ====================================================
            MOBILE : CARROUSEL HORIZONTAL
           ==================================================== */}
        <div
          className={cn(
            'flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
          role="list"
          aria-label="Garanties Gercie"
        >
          {reassurances.map((item) => (
            <div
              key={item.href}
              className="w-[132px] min-w-[132px] snap-start"
              role="listitem"
            >
              <ReassuranceLink item={item} />
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}