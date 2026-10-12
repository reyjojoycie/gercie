'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { LanguageSwitcher } from '../LanguageSwitcher'
import {
  Truck,
  ShieldCheck,
  Headset,
  Smartphone,
  Phone,
  Clock,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TopBarLink {
  href: string
  label: string
  icon?: React.ReactNode
  external?: boolean
}

interface TrustBadge {
  icon: React.ReactNode
  text: string
}

/* ------------------------------------------------------------------ */
/*  Données (constantes externes pour éviter les re-créations)         */
/* ------------------------------------------------------------------ */
const defaultTrustBadges: TrustBadge[] = [
  { icon: <Truck size={14} className="text-gold-400" />, text: 'Livraison offerte dès 50$' },
  { icon: <ShieldCheck size={14} className="text-gold-400" />, text: 'Paiement 100% sécurisé' },
  { icon: <Headset size={14} className="text-gold-400" />, text: 'Support 7j/7' },
]

const defaultLinks: TopBarLink[] = [
  { href: '/aide/livraison', label: 'Suivi de commande', icon: <Truck size={12} className="text-gold-400/80" /> },
  { href: '/aide/retours', label: 'Retours gratuits', icon: <RefreshCw size={12} className="text-gold-400/80" /> },
  { href: '/mobile', label: 'App Mobile', icon: <Smartphone size={12} className="text-gold-400/80" /> },
]

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */
interface NavbarTopBarProps {
  showOnMobile?: boolean
  trustBadges?: TrustBadge[]
  links?: TopBarLink[]
  supportPhone?: string
  supportHours?: string
  showStatus?: boolean
  compact?: boolean
  className?: string
}

export function NavbarTopBar({
  showOnMobile = false,
  trustBadges = defaultTrustBadges,
  links = defaultLinks,
  supportPhone = '+243 973 868 195',
  supportHours = 'Lun–Sam : 8h–20h',
  showStatus = true,
  compact = false,
  className,
}: NavbarTopBarProps) {
  const [online, setOnline] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Détection de la connexion réseau
  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  return (
    <div
      className={cn(
        'bg-gradient-to-r from-midnight-900 via-midnight-800 to-midnight-900 dark:from-midnight-950 dark:via-midnight-900 dark:to-midnight-950 border-b border-gold-400/20',
        !showOnMobile && 'hidden lg:block',
        compact ? 'py-1' : 'py-1.5',
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between text-xs text-neutral-200 dark:text-neutral-300">
          {/* Partie gauche : badges de confiance (fixe, sans carrousel) */}
          <div className="flex items-center gap-4">
            {compact ? (
              // Mode compact : un seul badge (le premier)
              <div className="flex items-center gap-1.5">
                {trustBadges[0]?.icon}
                <span>{trustBadges[0]?.text}</span>
              </div>
            ) : (
              // Mode complet : tous les badges sur desktop
              <div className="hidden sm:flex items-center gap-6">
                {trustBadges.map((badge, idx) => (
                  <span key={idx} className="flex items-center gap-1.5">
                    {badge.icon}
                    <span>{badge.text}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Version mobile réduite (si showOnMobile) */}
            {showOnMobile && (
              <div className="sm:hidden flex items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <Truck size={12} className="text-gold-400" />
                  Livraison offerte
                </span>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="ml-1 p-0.5 rounded hover:bg-white/10"
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            )}
          </div>

          {/* Partie droite : liens + téléphone + statut */}
          <div className="flex items-center gap-3 lg:gap-4">
            {/* Liens */}
            {links.map((link) => (
              <Tooltip key={link.label} content={link.label}>
                <Link
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="hidden sm:inline-flex items-center gap-1 hover:text-gold-400 transition-colors whitespace-nowrap"
                >
                  {link.icon && <span>{link.icon}</span>}
                  <span>{link.label}</span>
                </Link>
              </Tooltip>
            ))}

            {/* Téléphone support */}
            {supportPhone && (
              <a
                href={`tel:${supportPhone.replace(/\s/g, '')}`}
                className="hidden md:flex items-center gap-1 hover:text-gold-400 transition-colors whitespace-nowrap"
              >
                <Phone size={12} className="text-gold-400" />
                <span>{supportPhone}</span>
              </a>
            )}

            {/* Horaires (tooltip) */}
            {supportHours && (
              <Tooltip content={supportHours}>
                <span className="hidden lg:flex items-center gap-1 cursor-default text-neutral-400">
                  <Clock size={12} className="text-gold-400/70" />
                </span>
              </Tooltip>
            )}

            {/* Indicateur de statut du service */}
            {showStatus && (
              <Tooltip content={online ? 'Services en ligne' : 'Connexion limitée'}>
                <span className={cn(
                  'flex items-center gap-1 transition-colors duration-300',
                  online ? 'text-green-400' : 'text-red-400'
                )}>
                  {online ? <Wifi size={12} /> : <WifiOff size={12} />}
                </span>
              </Tooltip>
            )}

            {/* Sélecteur de langue */}
            <LanguageSwitcher />
          </div>
        </div>

        {/* Panneau étendu mobile (si showOnMobile) */}
        <AnimatePresence>
          {expanded && showOnMobile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden sm:hidden"
            >
              <div className="py-2 space-y-2 text-xs text-neutral-300">
                {trustBadges.map((badge, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {badge.icon} {badge.text}
                  </div>
                ))}
                {links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="flex items-center gap-2 hover:text-gold-400 transition-colors"
                    onClick={() => setExpanded(false)}
                  >
                    {link.icon} {link.label}
                  </Link>
                ))}
                {supportPhone && (
                  <a
                    href={`tel:${supportPhone.replace(/\s/g, '')}`}
                    className="flex items-center gap-2 hover:text-gold-400 transition-colors"
                  >
                    <Phone size={12} className="text-gold-400" /> {supportPhone}
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}